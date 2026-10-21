import { describe, expect, it } from "vitest";
import { type LimitTier, slidingWindowHit } from "./rate-limit";

const TIERS: LimitTier[] = [
	{ limit: 3, periodMs: 10_000 },
	{ limit: 5, periodMs: 60_000 },
];

/** Sends a request at each time, returning the verdicts. */
function run(times: number[], tiers = TIERS) {
	let hits: number[] = [];
	return times.map((now) => {
		const out = slidingWindowHit(hits, tiers, now);
		hits = out.hits;
		return out.result;
	});
}

describe("slidingWindowHit", () => {
	it("refuses the request past the burst cap and says when a slot frees", () => {
		const results = run([0, 1_000, 2_000, 2_500]);
		expect(results.slice(0, 3).every((r) => r.success)).toBe(true);
		// The oldest of the three in the window (t=0) leaves at 10 s.
		expect(results[3]).toEqual({ success: false, retryAfterSeconds: 8 });
	});

	it("does not count refused requests, so hammering does not extend the wait", () => {
		const results = run([0, 1_000, 2_000, 3_000, 4_000, 9_000, 10_000]);
		expect(results.map((r) => r.success)).toEqual([
			true,
			true,
			true,
			false,
			false,
			false,
			true,
		]);
	});

	it("applies the longer window once bursts are spaced out", () => {
		// Three every 10 s is fine for the burst cap; the sixth in a minute is not.
		const results = run([0, 11_000, 22_000, 33_000, 44_000, 55_000]);
		expect(results.slice(0, 5).every((r) => r.success)).toBe(true);
		expect(results[5]).toEqual({ success: false, retryAfterSeconds: 5 });
	});

	it("forgets requests older than the longest window", () => {
		const { hits } = slidingWindowHit([0, 1, 2], TIERS, 120_000);
		expect(hits).toEqual([120_000]);
	});
});
