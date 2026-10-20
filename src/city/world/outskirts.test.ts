import { type BufferGeometry, Group } from "three";
import { describe, expect, it } from "vitest";
import { CityEvents } from "../events";
import { mulberry32 } from "../rng";
import type { BuildContext } from "./context";
import { isSea, LAND_HALF } from "./layout";
import { buildOutskirtsNorth } from "./out-north";
import { buildOutskirtsSouth } from "./out-south";
import { buildOutskirtsEast, buildOutskirtsWest } from "./out-urban";
import { OUTSKIRT_BLOCKS, OUTSKIRT_SEGMENTS } from "./outskirts";

function context(): BuildContext {
	return {
		rng: mulberry32(7),
		density: 1,
		statics: [],
		facades: [],
		group: new Group(),
		agents: [],
		events: new CityEvents(),
		sidewalks: [],
		residentialDoors: [],
		residentialLoop: null,
		parkLoop: null,
	};
}

/** First vertex standing above the ground inside the district square, if any. */
function intruder(geos: readonly BufferGeometry[]): string | null {
	const inner = LAND_HALF - 5;
	for (const g of geos) {
		const p = g.getAttribute("position");
		for (let v = 0; v < p.count; v++) {
			const x = p.getX(v);
			const z = p.getZ(v);
			if (Math.abs(x) < inner && Math.abs(z) < inner && p.getY(v) > 0.5) {
				return `(${x.toFixed(1)}, ${p.getY(v).toFixed(1)}, ${z.toFixed(1)})`;
			}
		}
	}
	return null;
}

describe("outskirts", () => {
	it("keep every block and street on land outside the districts", () => {
		for (const b of OUTSKIRT_BLOCKS) {
			expect(isSea((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2)).toBe(false);
			const overlaps =
				b.minX < LAND_HALF &&
				b.maxX > -LAND_HALF &&
				b.minZ < LAND_HALF &&
				b.maxZ > -LAND_HALF;
			expect(overlaps).toBe(false);
		}
		for (const s of OUTSKIRT_SEGMENTS) {
			const mid = (s.from + s.to) / 2;
			const [x, z] = s.axis === "x" ? [s.at, mid] : [mid, s.at];
			expect(isSea(x, z)).toBe(false);
		}
	});

	it.each([
		["west", buildOutskirtsWest],
		["north", buildOutskirtsNorth],
		["east", buildOutskirtsEast],
		["south", buildOutskirtsSouth],
	] as const)(
		"%s builder places nothing inside the district square",
		(_name, build) => {
			const ctx = context();
			build(ctx);
			expect(intruder(ctx.statics)).toBeNull();
			expect(intruder(ctx.facades)).toBeNull();
		},
	);
});
