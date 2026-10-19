import { describe, expect, it } from "vitest";
import { mulberry32 } from "./rng";

describe("mulberry32", () => {
	it("is deterministic for a seed", () => {
		const a = mulberry32(42);
		const b = mulberry32(42);
		const seqA = Array.from({ length: 5 }, () => a());
		const seqB = Array.from({ length: 5 }, () => b());
		expect(seqA).toEqual(seqB);
	});

	it("differs between seeds", () => {
		const a = mulberry32(1);
		const b = mulberry32(2);
		expect(a()).not.toBe(b());
	});

	it("keeps helpers inside their bounds", () => {
		const r = mulberry32(7);
		for (let i = 0; i < 1000; i++) {
			const v = r.range(3, 5);
			expect(v).toBeGreaterThanOrEqual(3);
			expect(v).toBeLessThan(5);
			const n = r.int(1, 3);
			expect([1, 2, 3]).toContain(n);
		}
	});
});
