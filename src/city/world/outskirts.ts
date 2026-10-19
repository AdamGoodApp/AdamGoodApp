import { box } from "../geometry";
import { GRASS, LANE, PAVEMENT, ROAD, ROCK, SIDEWALK } from "../palette";
import type { BuildContext } from "./context";
import {
	COAST_SOUTH_X,
	COAST_WEST_Z,
	isSea,
	LAND_HALF,
	RING,
	ROAD_Y,
	SIDEWALK_WIDTH,
	SIDEWALK_Y,
	WORLD_HALF,
} from "./layout";

/**
 * The outskirts: a 30 m street grid around the 3×3 district square so the city
 * fills the whole screen. Only blocks that can appear on screen are generated;
 * district builders for the four sides fill `OUTSKIRT_BLOCKS` by `region`.
 */
export const STREET_W = 5;
export type Region = "west" | "north" | "east" | "south";

/** Street centrelines beyond the ring road (avenues ±30 continue outward). */
const OUTER = [117, 147, 177, 207, 237];
const LINES = [...OUTER.map((v) => -v), -60, -30, 0, 30, 60, ...OUTER].sort(
	(a, b) => a - b,
);

export interface Segment {
	/** Constant coordinate: x for "x" lines (running along z), z for "z" lines. */
	at: number;
	axis: "x" | "z";
	from: number;
	to: number;
}

export interface Block {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
	region: Region;
	/** Edge touching the sea (for waterfront treatment), if any. */
	coast: "south" | "west" | null;
}

/** View-space test: would a point at ground (x, z) show on any desktop aspect up to 21:9? */
export function onScreen(x: number, z: number, margin = 0): boolean {
	const u = (x - z) / Math.SQRT2;
	const v = ((x + z) / Math.SQRT2) * 0.577;
	return Math.abs(u) <= 200 + margin && Math.abs(v) <= 100 + margin;
}

/** Intervals of a street line on land and outside the district square. */
function landIntervals(at: number, axis: "x" | "z"): [number, number][] {
	const out: [number, number][] = [];
	let start: number | null = null;
	for (let t = -WORLD_HALF; t <= WORLD_HALF + 1; t++) {
		const x = axis === "x" ? at : t;
		const z = axis === "x" ? t : at;
		const ok =
			t <= WORLD_HALF &&
			onScreen(x, z, 40) &&
			!isSea(x, z) &&
			(Math.abs(at) > LAND_HALF || Math.abs(t) >= LAND_HALF);
		if (ok && start === null) start = t;
		if (!ok && start !== null) {
			if (t - 1 - start > 8) out.push([start, t - 1]);
			start = null;
		}
	}
	return out;
}

export const OUTSKIRT_SEGMENTS: readonly Segment[] = (
	["x", "z"] as const
).flatMap((axis) =>
	LINES.flatMap((at) =>
		landIntervals(at, axis).map(([from, to]) => ({ at, axis, from, to })),
	),
);

function regionOf(cx: number, cz: number): Region {
	if (Math.abs(cx) >= Math.abs(cz)) return cx < 0 ? "west" : "east";
	return cz < 0 ? "north" : "south";
}

/** Block edges: the street lines plus the ring road (centred on ±RING) around the districts. */
const EDGES = [-WORLD_HALF, ...LINES, -RING, RING, WORLD_HALF].sort(
	(a, b) => a - b,
);

export const OUTSKIRT_BLOCKS: readonly Block[] = (() => {
	const blocks: Block[] = [];
	const inset = STREET_W / 2 + SIDEWALK_WIDTH;
	for (let i = 0; i < EDGES.length - 1; i++) {
		for (let j = 0; j < EDGES.length - 1; j++) {
			const x0 = (EDGES[i] as number) + inset;
			const x1 = (EDGES[i + 1] as number) - inset;
			const z0 = (EDGES[j] as number) + inset;
			const z1 = (EDGES[j + 1] as number) - inset;
			const cx = (x0 + x1) / 2;
			const cz = (z0 + z1) / 2;
			if (x1 - x0 < 8 || z1 - z0 < 8) continue;
			// Skip blocks overlapping the district square (incl. its ring road).
			if (
				x0 < LAND_HALF &&
				x1 > -LAND_HALF &&
				z0 < LAND_HALF &&
				z1 > -LAND_HALF
			)
				continue;
			if (!onScreen(cx, cz, 20)) continue;
			// Clip to the coast; drop blocks that are mostly sea.
			let minX = x0;
			let maxZ = z1;
			let coast: Block["coast"] = null;
			if (x1 <= -LAND_HALF && z1 > COAST_WEST_Z) {
				if (z0 >= COAST_WEST_Z - 6) continue;
				maxZ = COAST_WEST_Z - 1;
				coast = "south";
			}
			if (z0 >= LAND_HALF && x0 < COAST_SOUTH_X) {
				if (x1 <= COAST_SOUTH_X + 6) continue;
				minX = COAST_SOUTH_X + 1;
				coast = "west";
			}
			if (isSea(cx, cz)) continue;
			blocks.push({
				minX,
				maxX: x1,
				minZ: z0,
				maxZ,
				region: regionOf(cx, cz),
				coast,
			});
		}
	}
	return blocks;
})();

/** Land slabs (everything but the south-west sea), outskirt streets and sidewalks. */
export function buildOutskirts(ctx: BuildContext): void {
	const s = ctx.statics;
	const W = WORLD_HALF;
	const L = LAND_HALF;
	// Land: (a) east of the west coast down to the south coast, (b) south strip east of the
	// south coast, (c) west strip north of the west coast. The district square sits on (a).
	const slab = (x0: number, x1: number, z0: number, z1: number) => {
		s.push(box(x1 - x0, 2, z1 - z0, GRASS, (x0 + x1) / 2, -2, (z0 + z1) / 2));
		s.push(
			box(x1 - x0, 0.01, z1 - z0, ROCK, (x0 + x1) / 2, -2.01, (z0 + z1) / 2),
		);
	};
	slab(-L, W, -W, L);
	slab(COAST_SOUTH_X, W, L, W);
	slab(-W, -L, -W, COAST_WEST_Z);

	for (const b of OUTSKIRT_BLOCKS) {
		s.push(
			box(
				b.maxX - b.minX + 2 * SIDEWALK_WIDTH,
				SIDEWALK_Y,
				b.maxZ - b.minZ + 2 * SIDEWALK_WIDTH,
				SIDEWALK,
				(b.minX + b.maxX) / 2,
				0,
				(b.minZ + b.maxZ) / 2,
			),
		);
		s.push(
			box(
				b.maxX - b.minX,
				0.02,
				b.maxZ - b.minZ,
				PAVEMENT,
				(b.minX + b.maxX) / 2,
				SIDEWALK_Y,
				(b.minZ + b.maxZ) / 2,
			),
		);
	}

	for (const seg of OUTSKIRT_SEGMENTS) {
		const len = seg.to - seg.from;
		const mid = (seg.from + seg.to) / 2;
		const [x, z, w, d] =
			seg.axis === "x"
				? [seg.at, mid, STREET_W, len]
				: [mid, seg.at, len, STREET_W];
		s.push(box(w, ROAD_Y, d, ROAD, x, 0, z));
		for (let t = seg.from + 3; t < seg.to - 3; t += 5) {
			const [dx, dz, dw, dd] =
				seg.axis === "x" ? [seg.at, t, 0.2, 1.8] : [t, seg.at, 1.8, 0.2];
			s.push(box(dw, 0.02, dd, LANE, dx, ROAD_Y, dz));
		}
	}
}
