import { Vector3 } from "three";
import { box, place } from "../geometry";
import { apartment, office, skyscraper, walkup } from "../kit/buildings";
import { PAVEMENT, ROAD, SIDEWALK } from "../palette";
import { bench, roundTree } from "../prefabs";
import { Polyline } from "../sim/path";
import type { BuildContext } from "./context";
import { ROAD_Y, SIDEWALK_Y } from "./layout";

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
}
