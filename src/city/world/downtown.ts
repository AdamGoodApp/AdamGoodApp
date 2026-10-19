import { Vector3 } from "three";
import { box, place } from "../geometry";
import { FACADES, PAVEMENT, ROAD, SIDEWALK } from "../palette";
import { bench, roundTree, tower } from "../prefabs";
import { Polyline } from "../sim/path";
import { addFacadeWindows } from "../sim/windows";
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
/** Tower heights [row from the far z edge][column from the west x edge]. */
const HEIGHTS: readonly (readonly number[])[] = [
	[42, 36, 30],
	[24, 18, 28],
	[14, 20, 12],
];

/** The block nearest the park keeps a small tower and gains a plaza. */
const PLAZA_CENTRE = -37.35;
const PLAZA_SIZE = 5.7;
const PLAZA_TOWER = -44;
const PLAZA_TOWER_SIZE = 7.5;
/** Street trees stand just inside the avenue sidewalk (x or z = −35.05). */
const TREE_LINE = -35.05;

export function buildDowntown(ctx: BuildContext): void {
	const { rng, statics, windows } = ctx;
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

			const h = (HEIGHTS[r] as readonly number[])[c] as number;
			const facade = rng.pick(FACADES);
			const side = rng.range(8, 10);
			const plaza = r === 2 && c === 2;
			const w = plaza ? PLAZA_TOWER_SIZE : side;
			const tx = plaza ? PLAZA_TOWER : bx;
			const tz = plaza ? PLAZA_TOWER : bz;
			statics.push(place(tower(w, w, h, facade), { x: tx, z: tz }));
			addFacadeWindows(windows, tx, tz, w, w, h);
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
