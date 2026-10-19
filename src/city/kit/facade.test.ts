import { describe, expect, it } from "vitest";
import { TILE } from "./atlas";
import { FLOOR_H, facadeBox } from "./facade";

function column(
	attr: ArrayLike<number>,
	stride: number,
	offset: number,
): number[] {
	const out: number[] = [];
	for (let i = offset; i < attr.length; i += stride)
		out.push(attr[i] as number);
	return out;
}

describe("facadeBox", () => {
	it("lays out a whole number of bays per wall and one v unit per storey", () => {
		const g = facadeBox(10, 7, 4 * FLOOR_H, { upper: TILE.brickRed });
		const uv = g.getAttribute("uv").array;
		const us = column(uv, 2, 0);
		const vs = column(uv, 2, 1);
		for (const u of us) expect(Number.isInteger(u)).toBe(true);
		expect(Math.max(...us)).toBe(3);
		expect(Math.max(...vs)).toBeCloseTo(4);
		expect(Math.min(...vs)).toBe(0);
		expect(g.getAttribute("position").count).toBe(24);
	});

	it("uses the ground tile only for walls that start on the ground", () => {
		const ground = facadeBox(6, 6, 6, {
			upper: TILE.brickRed,
			ground: TILE.storeGlass,
		});
		expect(column(ground.getAttribute("facade").array, 2, 1)).toContain(
			TILE.storeGlass,
		);
		const tier = facadeBox(6, 6, 6, {
			upper: TILE.brickRed,
			ground: TILE.storeGlass,
			base: 20,
		});
		expect(new Set(column(tier.getAttribute("facade").array, 2, 1))).toEqual(
			new Set([TILE.brickRed]),
		);
		expect(Math.min(...column(tier.getAttribute("position").array, 3, 1))).toBe(
			20,
		);
	});

	it("drops skipped walls", () => {
		const g = facadeBox(6, 6, 6, {
			upper: TILE.brickRed,
			skip: ["back", "left"],
		});
		expect(g.getAttribute("position").count).toBe(12);
	});
});
