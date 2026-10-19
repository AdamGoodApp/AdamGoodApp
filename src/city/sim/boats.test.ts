import { describe, expect, it } from "vitest";
import { isSea } from "../world/layout";
import { ORBITS } from "./boats";

/** Distance from a point to an axis-aligned box [x0,x1]×[z0,z1] (a segment when one side is degenerate). */
function distToBox(
	x: number,
	z: number,
	x0: number,
	x1: number,
	z0: number,
	z1: number,
): number {
	return Math.hypot(
		x - Math.min(Math.max(x, x0), x1),
		z - Math.min(Math.max(z, z0), z1),
	);
}

describe("sail orbits", () => {
	for (const [index, o] of ORBITS.entries()) {
		it(`orbit ${index} stays in open water`, () => {
			for (let k = 0; k < 720; k++) {
				const a = (k / 720) * Math.PI * 2;
				const x = o.cx + o.rx * Math.cos(a);
				const z = o.cz + o.rz * Math.sin(a);
				expect(isSea(x, z)).toBe(true);
				// Coast lines: z = 25 (x < -90), x = -90 (z 25..90), z = 90 (x -90..-25), quay x = -25 (z > 90).
				expect(distToBox(x, z, -250, -90, 25, 25)).toBeGreaterThanOrEqual(10);
				expect(distToBox(x, z, -90, -90, 25, 90)).toBeGreaterThanOrEqual(10);
				expect(distToBox(x, z, -90, -25, 90, 90)).toBeGreaterThanOrEqual(10);
				expect(distToBox(x, z, -25, -25, 90, 250)).toBeGreaterThanOrEqual(10);
				// Pier deck, lighthouse islet, ferry loop, marina jetties (x >= -46 for z > 90).
				expect(distToBox(x, z, -119, -90, 68, 72)).toBeGreaterThanOrEqual(6);
				expect(Math.hypot(x + 124, z - 70)).toBeGreaterThanOrEqual(11);
				expect(distToBox(x, z, -140, -104, 77.5, 104)).toBeGreaterThanOrEqual(
					6,
				);
				expect(distToBox(x, z, -46, -25, 90, 250)).toBeGreaterThanOrEqual(8);
				expect(
					distToBox(x, z, -186.5, -167.5, 25, 60.2),
				).toBeGreaterThanOrEqual(6);
			}
		});
	}
});
