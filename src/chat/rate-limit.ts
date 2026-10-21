/** One sliding-window limit: at most `limit` requests in any `periodMs`. */
export interface LimitTier {
	limit: number;
	periodMs: number;
}

export type LimitResult =
	| { success: true }
	| { success: false; retryAfterSeconds: number };

/** /api/chat per client IP: a burst cap, a per-minute cap and a daily cap. */
export const CHAT_LIMITS: readonly LimitTier[] = [
	// One visitor turn can be 2–4 requests (tool results continue the run).
	{ limit: 8, periodMs: 10_000 },
	{ limit: 20, periodMs: 60_000 },
	{ limit: 200, periodMs: 86_400_000 },
];

/**
 * Sliding-window check over the times of earlier accepted requests (oldest
 * first). Returns the verdict and the times to keep; a refused request is
 * not recorded, so retrying while refused does not extend the wait.
 */
export function slidingWindowHit(
	hits: readonly number[],
	tiers: readonly LimitTier[],
	now: number,
): { result: LimitResult; hits: number[] } {
	const longest = Math.max(0, ...tiers.map((t) => t.periodMs));
	const kept = hits.filter((t) => now - t < longest);
	let retryAfterMs = 0;
	for (const { limit, periodMs } of tiers) {
		const inWindow = kept.filter((t) => now - t < periodMs);
		if (inWindow.length >= limit) {
			// A slot frees when the oldest request that pushes the count over the limit leaves the window.
			const freeing = inWindow[inWindow.length - limit] ?? now;
			retryAfterMs = Math.max(retryAfterMs, freeing + periodMs - now);
		}
	}
	if (retryAfterMs > 0) {
		return {
			result: {
				success: false,
				retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
			},
			hits: kept,
		};
	}
	return { result: { success: true }, hits: [...kept, now] };
}
