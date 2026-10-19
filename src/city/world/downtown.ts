import { type BufferGeometry, Vector3 } from "three";
import { box, cyl, GLOW, glow, merge, place } from "../geometry";
import { apartment, office, skyscraper, walkup } from "../kit/buildings";
import { BRIGHTS, CARS, PAVEMENT, ROAD, SIDEWALK } from "../palette";
import { bench, car, roundTree } from "../prefabs";
import { type CrowdSpot, createCrowd } from "../sim/crowd";
import { Polyline } from "../sim/path";
import type { BuildContext } from "./context";
import { ROAD_Y, SIDEWALK_Y } from "./layout";
import { tintWhite } from "./tint";

/** Inner edges of the cell, between the ring-road and avenue sidewalks. */
const INNER_MIN = -82.5;
const INNER_MAX = -34.5;
const STREETS = [-67, -50] as const;
const STREET_W = 4;
const WALK = 1.5;
/** Sidewalk centrelines of the ring road / avenue bordering the cell. */
const RING_WALK = -83.25;
const AVENUE_WALK = -33.75;

const EDGES = [
	INNER_MIN,
	STREETS[0] - STREET_W / 2,
	STREETS[0] + STREET_W / 2,
	STREETS[1] - STREET_W / 2,
	STREETS[1] + STREET_W / 2,
	INNER_MAX,
] as const;
/** Pavement block ranges per row/column (index 0 is the far, z/x = −84 side). */
const BLOCKS: readonly (readonly [number, number])[] = [
	[EDGES[0], EDGES[1]],
	[EDGES[2], EDGES[3]],
	[EDGES[4], EDGES[5]],
];
/** Landmark tower heights for the far row, west → east. */
const SKYLINE = [62, 54, 46] as const;

/** The block nearest the park mixes walk-ups around a small plaza. */
const PLAZA_CENTRE = -37.35;
const PLAZA_SIZE = 5.7;
/** Street trees stand just inside the avenue sidewalk (x or z = −35.05). */
const TREE_LINE = -35.05;

type Range = readonly [number, number];

/** Buildings for one block (r = row from the far z edge, c = column from the west). */
function fillBlock(
	ctx: BuildContext,
	r: number,
	c: number,
	xr: Range,
	zr: Range,
): void {
	const x0 = xr[0] + WALK;
	const x1 = xr[1] - WALK;
	const z0 = zr[0] + WALK;
	const z1 = zr[1] - WALK;
	const w = x1 - x0;
	const d = z1 - z0;
	const cx = (x0 + x1) / 2;
	const cz = (z0 + z1) / 2;
	// Fronts face +X or +Z (toward the camera) so lobbies and shops are visible.
	const front = Math.PI / 2;
	if (r === 0) {
		const style = (["deco", "glass", "modern"] as const)[c];
		skyscraper(
			ctx,
			{ x: cx, z: cz, w: w - 0.6, d: d - 0.6 },
			{ height: SKYLINE[c] ?? 40, style },
		);
		return;
	}
	if (r === 1 && c === 0) {
		skyscraper(
			ctx,
			{ x: cx, z: cz, w: w - 1.5, d: d - 1.5 },
			{ height: 40, style: "deco" },
		);
		return;
	}
	if (r === 1) {
		const half = d / 2;
		office(
			ctx,
			{ x: cx, z: z0 + half / 2, w: w - 0.4, d: half - 0.3 },
			{ floors: c === 1 ? 11 : 9 },
		);
		office(
			ctx,
			{ x: cx, z: z1 - half / 2, w: w - 0.4, d: half - 0.3 },
			{ floors: c === 1 ? 7 : 12, setback: c === 2 },
		);
		return;
	}
	if (r === 2 && c === 1) {
		apartment(
			ctx,
			{ x: x0 + w * 0.3, z: cz, w: w * 0.55, d: d - 0.6, ry: front },
			{ floors: 8 },
		);
		walkup(
			ctx,
			{ x: x1 - w * 0.2, z: z0 + d * 0.27, w: d * 0.5, d: w * 0.36, ry: front },
			{ floors: 5 },
		);
		walkup(
			ctx,
			{
				x: x1 - w * 0.2,
				z: z1 - d * 0.23,
				w: d * 0.42,
				d: w * 0.36,
				ry: front,
			},
			{ floors: 3 },
		);
		return;
	}
	// Walk-up quarter: four narrow buildings, fronts on the two streets nearest the camera.
	const plaza = c === 2;
	const lots = [
		{ x: x0 + w * 0.25, z: z0 + d * 0.25, ry: front },
		{ x: x0 + w * 0.25, z: z1 - d * 0.25, ry: front },
		{ x: x1 - w * 0.25, z: z0 + d * 0.25, ry: 0 },
		{ x: x1 - w * 0.25, z: z1 - d * 0.25, ry: 0 },
	];
	lots.forEach((l, i) => {
		if (plaza && i === 3) return;
		walkup(
			ctx,
			{ ...l, w: w / 2 - 0.4, d: d / 2 - 0.4 },
			{ floors: ctx.rng.int(3, 6) },
		);
	});
}

/** Cars parked along both curbs of every internal street (no traffic runs there). */
function parkedCars(ctx: BuildContext): void {
	const { rng, statics } = ctx;
	for (const c of STREETS) {
		for (const side of [-1, 1]) {
			const lane = c + side * 0.95;
			for (const [a0, a1] of BLOCKS) {
				for (let t = a0 + 2.6; t <= a1 - 2.6; t += 5.4) {
					if (rng() < 0.3) continue;
					const hex = rng.pick(CARS);
					const flip = rng() < 0.5 ? Math.PI : 0;
					statics.push(
						place(tintWhite(car(), hex), {
							x: lane,
							y: ROAD_Y,
							z: t,
							ry: flip,
						}),
						place(tintWhite(car(), rng.pick(CARS)), {
							x: t,
							y: ROAD_Y,
							z: lane,
							ry: Math.PI / 2 + flip,
						}),
					);
				}
			}
		}
	}
}

/** Small trees on the sidewalks that run beside the internal streets. */
function streetTrees(ctx: BuildContext): void {
	const { rng, statics } = ctx;
	for (let i = 0; i < 3; i++) {
		const xr = BLOCKS[i] as Range;
		for (const edge of [
			...(i > 0 ? [xr[0] + 0.5] : []),
			...(i < 2 ? [xr[1] - 0.5] : []),
		]) {
			for (const [z0, z1] of BLOCKS) {
				for (let t = z0 + 3; t <= z1 - 3; t += 5.5) {
					statics.push(
						place(roundTree(rng.range(0.5, 0.6)), {
							x: edge,
							y: SIDEWALK_Y,
							z: t,
						}),
						place(roundTree(rng.range(0.5, 0.6)), {
							x: t,
							y: SIDEWALK_Y,
							z: edge,
						}),
					);
				}
			}
		}
	}
}

const KIOSKS = [
	[-64.25, -47.25, 0],
	[-52.75, -52.75, Math.PI / 2],
	[-47.25, -64.25, 0],
	[-69.75, -64.25, Math.PI / 2],
] as const;

function kiosk(hex: number): BufferGeometry {
	return merge([
		box(1.0, 1.6, 0.9, hex, 0, 0),
		box(1.3, 0.12, 1.2, 0x444a52, 0, 1.6),
		box(1.0, 0.06, 0.5, 0xf4f4f4, 0, 1.45, 0.6),
		box(0.8, 0.5, 0.05, 0xf2eee0, 0, 0.7, 0.47),
		glow(box(0.7, 0.25, 0.06, 0xfff1a8, 0, 1.75, 0.55), GLOW.night),
	]);
}

function subwayEntrance(): BufferGeometry {
	const parts = [
		box(2.0, 0.04, 1.1, 0x1c1f26, 0, 0.01),
		box(2.2, 0.8, 0.12, 0x4a4d52, 0, 0, 0.62),
		box(2.2, 0.8, 0.12, 0x4a4d52, 0, 0, -0.62),
		box(2.5, 0.1, 1.5, 0x3a6ea5, 0, 2.4),
		glow(box(0.9, 0.55, 0.08, 0x3b7dd8, 1.35, 2.5, 0.2), GLOW.always),
	];
	for (const px of [-1.1, 1.1]) {
		for (const pz of [-0.65, 0.65]) {
			parts.push(cyl(0.05, 0.05, 2.4, 6, 0x333840, px, 0, pz));
		}
	}
	return merge(parts);
}

function kiosksAndSubway(ctx: BuildContext): void {
	for (const [x, z, ry] of KIOSKS) {
		ctx.statics.push(
			place(kiosk(ctx.rng.pick(BRIGHTS)), { x, y: SIDEWALK_Y, z, ry }),
		);
	}
	ctx.statics.push(
		place(subwayEntrance(), { x: -41.25, y: SIDEWALK_Y, z: -47.25 }),
	);
}

function plazaCrowd(ctx: BuildContext): void {
	const p = PLAZA_CENTRE;
	const py = SIDEWALK_Y + 0.04;
	const spots: CrowdSpot[] = [];
	for (const dx of [-1, 1]) {
		for (const dz of [-1, 1]) {
			spots.push({ x: p + dx * 1.1, z: p + dz * 1.1, y: py });
		}
	}
	spots.push({ x: p - 1.0, z: p, y: py }, { x: p + 1.0, z: p, y: py });
	for (const [x, z] of KIOSKS) {
		spots.push({ x: x + 0.2, z: z + 0.9, y: SIDEWALK_Y });
	}
	for (const dx of [-1.8, -0.4, 1.2]) {
		spots.push({ x: -41.25 + dx, z: -47.25 + 0.4, y: SIDEWALK_Y });
	}
	createCrowd(ctx, spots, { count: 24, spread: 0.45 });
}

export function buildDowntown(ctx: BuildContext): void {
	const { rng, statics } = ctx;
	const len = INNER_MAX - INNER_MIN;
	const centre = (INNER_MIN + INNER_MAX) / 2;

	for (const c of STREETS) {
		statics.push(box(STREET_W, ROAD_Y, len, ROAD, c, 0, centre));
		statics.push(box(len, ROAD_Y, STREET_W, ROAD, centre, 0, c));
	}

	for (let r = 0; r < 3; r++) {
		const zr = BLOCKS[r] as readonly [number, number];
		for (let c = 0; c < 3; c++) {
			const xr = BLOCKS[c] as readonly [number, number];
			const bx = (xr[0] + xr[1]) / 2;
			const bz = (zr[0] + zr[1]) / 2;
			statics.push(
				box(xr[1] - xr[0], SIDEWALK_Y, zr[1] - zr[0], SIDEWALK, bx, 0, bz),
			);

			fillBlock(ctx, r, c, xr, zr);
		}
	}

	// Plaza with four benches facing a small tree.
	const p = PLAZA_CENTRE;
	statics.push(box(PLAZA_SIZE, 0.04, PLAZA_SIZE, PAVEMENT, p, SIDEWALK_Y, p));
	const y = SIDEWALK_Y + 0.04;
	const benchAt = PLAZA_SIZE / 2 - 0.9;
	statics.push(
		place(bench(), { x: p, y, z: p - benchAt }),
		place(bench(), { x: p, y, z: p + benchAt, ry: Math.PI }),
		place(bench(), { x: p - benchAt, y, z: p, ry: Math.PI / 2 }),
		place(bench(), { x: p + benchAt, y, z: p, ry: -Math.PI / 2 }),
		place(roundTree(0.6), { x: p, y, z: p }),
	);

	// Street trees on the sides that face the avenues (x = −33 and z = −33);
	// the third row/column is the plaza block.
	for (let i = 0; i < 2; i++) {
		const range = BLOCKS[i] as readonly [number, number];
		for (const t of [range[0] + 3.2, range[1] - 3.2]) {
			const scale = rng.range(0.6, 0.75);
			statics.push(
				place(roundTree(scale), { x: TREE_LINE, y: SIDEWALK_Y, z: t }),
				place(roundTree(scale), { x: t, y: SIDEWALK_Y, z: TREE_LINE }),
			);
		}
	}

	// Pedestrian network: both sides of every internal street.
	for (const c of STREETS) {
		for (const side of [-1, 1]) {
			const off = c + side * (STREET_W / 2 + WALK / 2);
			ctx.sidewalks.push(
				new Polyline(
					[
						new Vector3(off, SIDEWALK_Y, RING_WALK),
						new Vector3(off, SIDEWALK_Y, AVENUE_WALK),
					],
					false,
				),
				new Polyline(
					[
						new Vector3(RING_WALK, SIDEWALK_Y, off),
						new Vector3(AVENUE_WALK, SIDEWALK_Y, off),
					],
					false,
				),
			);
		}
	}

	parkedCars(ctx);
	streetTrees(ctx);
	kiosksAndSubway(ctx);
	plazaCrowd(ctx);
}
