import { useRateLimiter } from "@tanstack/react-pacer/rate-limiter";
import { useEffect, useState } from "react";

/** Requests a visitor can send in any rolling minute; the server's per-IP limits back this up. */
export const SEND_LIMIT = 5;
export const SEND_WINDOW_MS = 60_000;

const KEY = "adamgoodapp:mayor-sends:v1";

/** Send times still inside the window, so a reload does not reset the allowance. */
function loadSendTimes(now = Date.now()): number[] {
	try {
		const times: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
		return Array.isArray(times)
			? times.filter(
					(t): t is number =>
						typeof t === "number" && t <= now && now - t < SEND_WINDOW_MS,
				)
			: [];
	} catch {
		return [];
	}
}

function saveSendTimes(times: readonly number[]): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(times));
	} catch {
		// Storage full or disabled: the allowance just resets on reload.
	}
}

/**
 * The visitor's send allowance: TanStack Pacer's rate limiter with a sliding
 * one-minute window. `trySend` runs the send if allowed; otherwise it
 * refuses, and `waitSeconds` counts down to the next free slot.
 */
export function useSendLimiter() {
	const limiter = useRateLimiter(
		(send: () => void) => send(),
		{
			limit: SEND_LIMIT,
			window: SEND_WINDOW_MS,
			windowType: "sliding",
			initialState: { executionTimes: loadSendTimes() },
		},
		(state) => ({
			executionTimes: state.executionTimes,
			rejectionCount: state.rejectionCount,
		}),
	);
	const { executionTimes, rejectionCount } = limiter.state;
	useEffect(() => saveSendTimes(executionTimes), [executionTimes]);

	// After a refusal, tick once a second until a slot frees up.
	const [waitMs, setWaitMs] = useState(0);
	useEffect(() => {
		if (rejectionCount === 0) return;
		const tick = () => {
			const ms =
				limiter.getRemainingInWindow() > 0 ? 0 : limiter.getMsUntilNextWindow();
			setWaitMs(ms);
			if (ms <= 0) clearInterval(id);
		};
		const id = setInterval(tick, 1000);
		tick();
		return () => clearInterval(id);
	}, [rejectionCount, limiter]);

	return {
		/** Runs `send` if the visitor has allowance left; returns whether it ran. */
		trySend: (send: () => void) => limiter.maybeExecute(send),
		/** Seconds until the next send is allowed after a refusal; 0 when free. */
		waitSeconds: Math.ceil(waitMs / 1000),
	};
}
