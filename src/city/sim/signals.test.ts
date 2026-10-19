import { describe, expect, it } from "vitest";
import { AVENUE, RING } from "../world/layout";
import {
	AMBER,
	AMBER_TIME,
	CLEAR_TIME,
	CYCLE,
	GREEN,
	JUNCTIONS,
	lampAt,
	RED,
} from "./signals";

const STEP = 0.05;

describe("traffic signals", () => {
	it("covers the four avenue crossings and the eight ring junctions", () => {
		expect(JUNCTIONS.filter((j) => j.kind === "cross")).toHaveLength(4);
		expect(JUNCTIONS.filter((j) => j.kind === "tee")).toHaveLength(8);
		for (const j of JUNCTIONS) {
			expect(Math.abs(j.x) === AVENUE || Math.abs(j.x) === RING).toBe(true);
			expect(Math.abs(j.z) === AVENUE || Math.abs(j.z) === RING).toBe(true);
		}
	});

	it("runs every junction on the same cycle", () => {
		for (const j of JUNCTIONS) {
			expect(j.green[0] + j.green[1] + 2 * (AMBER_TIME + CLEAR_TIME)).toBe(
				CYCLE,
			);
		}
	});

	it("never shows crossing axes green or amber together and clears between phases", () => {
		for (const j of JUNCTIONS) {
			let allRed = 0;
			for (let t = 0; t < CYCLE * 2; t += STEP) {
				const x = lampAt(j, 0, t);
				const z = lampAt(j, 1, t);
				expect(x === RED || z === RED).toBe(true);
				if (x === RED && z === RED) allRed += STEP;
			}
			// Two all-red intervals per cycle.
			expect(allRed / 2).toBeCloseTo(2 * CLEAR_TIME, 0);
		}
	});

	it("steps green, amber, red on each axis with the configured green time", () => {
		for (const j of JUNCTIONS) {
			for (const axis of [0, 1] as const) {
				const seen: number[] = [];
				let green = 0;
				for (let t = 0; t < CYCLE; t += STEP) {
					const lamp = lampAt(j, axis, t);
					if (lamp === GREEN) green += STEP;
					if (seen[seen.length - 1] !== lamp) seen.push(lamp);
				}
				expect(green).toBeCloseTo(j.green[axis], 0);
				// The cycle wraps: a phase running through t = 0 shows up at both ends.
				if (seen.length > 1 && seen[0] === seen[seen.length - 1]) seen.pop();
				const pairs = seen.map((l, i) => [l, seen[(i + 1) % seen.length]]);
				for (const [from, to] of pairs) {
					expect(
						(from === GREEN && to === AMBER) ||
							(from === AMBER && to === RED) ||
							(from === RED && to === GREEN),
					).toBe(true);
				}
			}
		}
	});
});
