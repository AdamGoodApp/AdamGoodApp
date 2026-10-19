import { type BufferGeometry, Vector3 } from "three";
import { box, cone, cyl, place, prism } from "../geometry";
import { TILE } from "../kit/atlas";
import { walkup } from "../kit/buildings";
import {
	darken,
	FIELD_B,
	FIELD_C,
	LEAF,
	PARK,
	PAVEMENT,
	WATER_LIGHT,
} from "../palette";
import { bench, fencePost, lamp, policeCar, roundTree } from "../prefabs";
import { type CrowdSpot, createCrowd } from "../sim/crowd";
import { createFarm, createWindmills, FARM_Y, type Rect } from "../sim/farm";
import { Polyline } from "../sim/path";
import { createPlacards } from "../sim/rally";
import { campusHall, rotunda, townHall } from "./civic";
import type { BuildContext } from "./context";
import { CELL_Y } from "./layout";

/**
 * "Old Town & Campus" (x[-84,-33] z[-27,27]); usable area x[-82.5,-34.5]
 * z[-25.5,25.5] (every cell edge carries a 1.5 m sidewalk).
 *
 *  x -82.5..-68.5  farm remnant: crop stripes, cow + sheep pastures, barn,
 *                  silo, hay, one windmill
 *  x -67.5..-62.5  old-town brick walk-ups (z -25.2..-3.6)
 *  x -62..-45.7    town hall (centre -56,-13.8, front +X) + rally plaza
 *                  x -46..-35.5 z -19.3..-8.3, walk-ups either side
 *  z -2.4..-0.4    High Street (pedestrian lane)
 *  z 0..25.3       university: rotunda (-56,13.2) facing +X onto the quad
 *                  x -46.7..-35.6 z 6..19.4, brick halls north and south
 */
const Y = CELL_Y;
const LAWN_TOP = 0.04;
const PAVE_TOP = 0.06;
const WALK_Y = Y + PAVE_TOP;
const LAWN_Y = Y + LAWN_TOP;
const RAIL = 0xf2efe6;
const IRON = 0x2a2a2a;
const BARN_WALL = 0xb5544a;
const LEAVES = [LEAF, 0x6cbf5a, 0x4fa04a] as const;
const FLOWERS = [0xe85d8a, 0xf2c94c, 0xb06be0, 0xff7a3c] as const;
const BRICK_TILES = [
	TILE.brickRed,
	TILE.brickBrown,
	TILE.brickOrange,
	TILE.brickDark,
] as const;
const BRONZE = 0x7d6b4c;
const STONE = 0xd7d1c2;
const COURT = 0xd3cabb;

const CROP = { minX: -82, maxX: -69, minZ: -25, maxZ: -17 };
const COWS: Rect = { minX: -82, maxX: -69, minZ: -15.5, maxZ: -5 };
const SHEEP: Rect = { minX: -82, maxX: -69, minZ: -3.5, maxZ: 6 };
const YARD: Rect = { minX: -82, maxX: -69, minZ: 8, maxZ: 25 };

const WINDMILL = { x: -77.5, z: 23.2 };
const WINDMILL_HEIGHT = 10;
const WINDMILL_FACING = Math.PI / 4;

const HALL = { x: -56, z: -13.8 };
const PLAZA: Rect = { minX: -46, maxX: -35.5, minZ: -19.3, maxZ: -8.3 };
const ROTUNDA = { x: -56, z: 13.2 };
const QUAD: Rect = { minX: -46.7, maxX: -35.6, minZ: 6, maxZ: 19.4 };
const QUAD_AXIS_Z = ROTUNDA.z;
const QUAD_SPINE_X = -41.75;
const FACE_X = Math.PI / 2;

function rectOf(r: Rect): { w: number; d: number; cx: number; cz: number } {
	return {
		w: r.maxX - r.minX,
		d: r.maxZ - r.minZ,
		cx: (r.minX + r.maxX) / 2,
		cz: (r.minZ + r.maxZ) / 2,
	};
}

function patch(r: Rect, hex: number, top = LAWN_TOP): BufferGeometry {
	const { w, d, cx, cz } = rectOf(r);
	return box(w, top, d, hex, cx, Y, cz);
}

function fence(out: BufferGeometry[], r: Rect): void {
	const { w, d, cx, cz } = rectOf(r);
	for (const h of [0.35, 0.7]) {
		for (const z of [r.minZ, r.maxZ])
			out.push(box(w, 0.07, 0.06, RAIL, cx, Y + h, z));
		for (const x of [r.minX, r.maxX])
			out.push(box(0.06, 0.07, d, RAIL, x, Y + h, cz));
	}
	const nx = Math.ceil(w / 2);
	const nz = Math.ceil(d / 2);
	for (let i = 0; i <= nx; i++) {
		const x = r.minX + (w * i) / nx;
		for (const z of [r.minZ, r.maxZ])
			out.push(place(fencePost(), { x, y: Y, z }));
	}
	for (let j = 1; j < nz; j++) {
		const z = r.minZ + (d * j) / nz;
		for (const x of [r.minX, r.maxX])
			out.push(place(fencePost(), { x, y: Y, z }));
	}
}

/** Wrought-iron fence along x = `x` from z0 to z1 with a gate gap (pillars on both sides). */
function gatedFence(
	out: BufferGeometry[],
	x: number,
	z0: number,
	z1: number,
	gap: readonly [number, number],
): void {
	const runs = [
		[z0, gap[0]],
		[gap[1], z1],
	] as const;
	for (const [a, b] of runs) {
		out.push(
			box(0.06, 0.08, b - a, IRON, x, Y + 0.35, (a + b) / 2),
			box(0.06, 0.08, b - a, IRON, x, Y + 1.3, (a + b) / 2),
		);
		const n = Math.max(1, Math.round((b - a) / 1.3));
		for (let i = 0; i <= n; i++) {
			out.push(box(0.08, 1.4, 0.08, IRON, x, Y, a + ((b - a) * i) / n));
		}
	}
	for (const z of gap) {
		out.push(
			box(0.7, 2.4, 0.7, STONE, x, Y, z),
			box(0.9, 0.2, 0.9, 0xf3efe4, x, Y + 2.4, z),
		);
	}
}

function flowerBed(
	out: BufferGeometry[],
	x: number,
	z: number,
	w: number,
	d: number,
	hex: number,
): void {
	out.push(
		box(w, 0.28, d, 0x8a7a66, x, LAWN_Y, z),
		box(w - 0.3, 0.34, d - 0.3, hex, x, LAWN_Y, z),
	);
}

function statue(out: BufferGeometry[], x: number, z: number): void {
	out.push(
		box(1.6, 1.0, 1.6, STONE, x, LAWN_Y, z),
		box(0.5, 1.3, 0.4, BRONZE, x, LAWN_Y + 1.0, z),
		box(0.32, 0.32, 0.32, BRONZE, x, LAWN_Y + 2.3, z),
		box(0.14, 0.7, 0.14, BRONZE, x + 0.34, LAWN_Y + 1.8, z),
	);
}

function fountain(out: BufferGeometry[], x: number, z: number): void {
	out.push(
		cyl(1.7, 1.8, 0.4, 14, STONE, x, LAWN_Y, z),
		cyl(1.5, 1.5, 0.1, 14, WATER_LIGHT, x, LAWN_Y + 0.32, z),
		cyl(0.22, 0.32, 1.3, 8, STONE, x, LAWN_Y + 0.35, z),
		cyl(0.8, 0.45, 0.25, 10, STONE, x, LAWN_Y + 1.5, z),
		cyl(0.6, 0.6, 0.06, 10, WATER_LIGHT, x, LAWN_Y + 1.7, z),
	);
}

function flagpole(
	out: BufferGeometry[],
	x: number,
	z: number,
	flag: number,
): void {
	out.push(
		cyl(0.07, 0.09, 6, 6, 0xcccccc, x, WALK_Y, z),
		box(0.05, 0.8, 1.4, flag, x, WALK_Y + 5, z - 0.7),
	);
}

function farm(ctx: BuildContext): void {
	const out = ctx.statics;
	const { rng } = ctx;

	for (let i = 0; i < 10; i++) {
		const x0 = CROP.minX + i * 1.3;
		const green = i >= 5;
		const base = green ? FIELD_B : FIELD_C;
		out.push(
			patch(
				{ minX: x0, maxX: x0 + 1.3, minZ: CROP.minZ, maxZ: CROP.maxZ },
				i % 2 ? darken(base, 0.85) : base,
			),
		);
	}
	out.push(patch(COWS, 0x88c874), patch(SHEEP, FIELD_B), patch(YARD, 0xb89f73));
	fence(out, COWS);
	fence(out, SHEEP);

	out.push(
		box(8, 5, 10, BARN_WALL, -76.5, Y, 16),
		prism(8.8, 3, 10.8, 0x7a2f2a, -76.5, Y + 5, 16),
		box(3, 3.6, 0.12, 0xf4efe0, -76.5, Y, 21.05),
		box(1.6, 1.2, 0.12, 0xf4efe0, -76.5, Y + 4, 21.05),
		cyl(1.8, 1.8, 9, 12, 0xd0d0d0, -70.6, Y, 9.8),
		cone(1.9, 1.2, 12, 0x888888, -70.6, Y + 9, 9.8),
		box(2, 0.5, 0.6, 0x6b4f33, -71, FARM_Y, 17),
		box(1.2, 1, 1.6, 0xd9b94a, -71, FARM_Y, 22),
		box(1.2, 1, 1.6, 0xd9b94a, -71, FARM_Y, 23.8),
		box(1.2, 1, 1.6, 0xc9a63e, -71, FARM_Y + 1, 22.9),
	);

	for (const [x, z] of [
		[-81.4, 10],
		[-81.4, 15],
		[-81.4, 20],
		[-80.5, -14.2],
		[-80.5, -2.3],
	] as const) {
		out.push(
			place(roundTree(rng.range(0.8, 1), rng.pick(LEAVES)), { x, y: Y, z }),
		);
	}

	const facing = new Vector3(
		Math.sin(WINDMILL_FACING),
		0,
		Math.cos(WINDMILL_FACING),
	);
	out.push(
		cyl(1.2, 2, WINDMILL_HEIGHT, 8, 0xe8e2d0, WINDMILL.x, Y, WINDMILL.z),
		cone(1.6, 1.5, 8, 0x8a5a3c, WINDMILL.x, Y + WINDMILL_HEIGHT, WINDMILL.z),
	);
	createWindmills(ctx, [
		new Vector3(
			WINDMILL.x + facing.x * 1.2,
			Y + WINDMILL_HEIGHT + 0.7,
			WINDMILL.z + facing.z * 1.2,
		),
	]);
	createFarm(ctx, { cows: COWS, sheep: SHEEP });
}

function oldTownRow(ctx: BuildContext): void {
	const { rng } = ctx;
	ctx.statics.push(
		patch(
			{ minX: -68.2, maxX: -62.2, minZ: -25.4, maxZ: -3.4 },
			PAVEMENT,
			PAVE_TOP,
		),
	);
	for (const z of [-22.5, -17.1, -11.7, -6.3]) {
		walkup(
			ctx,
			{ x: -65, z, w: 5.3, d: 5, ry: FACE_X },
			{ floors: rng.int(3, 5), shops: false, upper: rng.pick(BRICK_TILES) },
		);
	}
}

function townHallBlock(ctx: BuildContext): void {
	const out = ctx.statics;
	townHall(ctx, { x: HALL.x, z: HALL.z, ry: FACE_X });

	out.push(patch(PLAZA, COURT, PAVE_TOP));
	for (const [z0, z1] of [
		[-24.8, -19.3],
		[-8.3, -3.2],
	] as const) {
		out.push(patch({ minX: -49.7, maxX: -44.5, minZ: z0, maxZ: z1 }, PARK));
	}
	fountain(out, -46.8, -22.2);
	statue(out, -46.8, -5.6);
	flowerBed(out, -49.1, -22.2, 0.8, 4.4, ctx.rng.pick(FLOWERS));
	flowerBed(out, -49.1, -5.6, 0.8, 4.2, ctx.rng.pick(FLOWERS));
	flowerBed(out, -44.9, -19.7, 0.8, 0.8, ctx.rng.pick(FLOWERS));
	flowerBed(out, -44.9, -7.9, 0.8, 0.8, ctx.rng.pick(FLOWERS));
	flagpole(out, -45.4, PLAZA.minZ + 0.5, 0xe8463c);
	flagpole(out, -45.4, PLAZA.maxZ - 0.5, 0x3b7dd8);
	for (const z of [PLAZA.minZ + 0.3, PLAZA.maxZ - 0.3]) {
		out.push(place(lamp(), { x: -36, y: WALK_Y, z }));
	}
	out.push(
		place(bench(), { x: -47.4, y: LAWN_Y, z: -19.9, ry: Math.PI }),
		place(bench(), { x: -47.4, y: LAWN_Y, z: -8.0 }),
	);

	out.push(
		place(policeCar(), { x: -36.3, y: WALK_Y, z: -17.1 }),
		place(policeCar(), { x: -36.3, y: WALK_Y, z: -10.5, ry: Math.PI }),
	);

	walkup(
		ctx,
		{ x: -40, z: -22.4, w: 5.6, d: 8, ry: FACE_X },
		{ floors: 4, upper: TILE.brickRed },
	);
	walkup(
		ctx,
		{ x: -40, z: -5.3, w: 5.6, d: 8, ry: FACE_X },
		{ floors: 3, upper: TILE.brickOrange },
	);

	for (const z of [-19.6, -8.0]) {
		out.push(
			place(roundTree(0.6, ctx.rng.pick(LEAVES)), { x: -35.2, y: Y, z }),
		);
	}

	const spots: CrowdSpot[] = [];
	for (let row = 0; row < 10; row++) {
		for (let col = 0; col < 6; col++) {
			spots.push({
				x: -44.4 + col * 0.8,
				z: HALL.z - 4.5 * 0.88 + row * 0.88,
				y: WALK_Y,
				ry: -FACE_X,
			});
		}
	}
	createCrowd(ctx, spots, { count: 60, spread: 0.3, cheer: true });
	createPlacards(
		ctx,
		{
			minX: -44.4,
			maxX: -40.2,
			minZ: HALL.z - 4.2,
			maxZ: HALL.z + 4.2,
			y: WALK_Y + 0.15,
		},
		24,
	);

	ctx.sidewalks.push(
		new Polyline(
			[new Vector3(-34.2, WALK_Y, HALL.z), new Vector3(-45.8, WALK_Y, HALL.z)],
			false,
		),
	);
}

function campus(ctx: BuildContext): void {
	const out = ctx.statics;
	const { rng } = ctx;

	rotunda(ctx, { x: ROTUNDA.x, z: ROTUNDA.z, ry: FACE_X }, 6);
	campusHall(
		ctx,
		{ x: -41.75, z: 3, w: 11.5, d: 6 },
		{ floors: 3, tile: TILE.brickRed },
	);
	campusHall(
		ctx,
		{ x: -58.75, z: 3, w: 14.5, d: 6 },
		{ floors: 4, tile: TILE.brickBrown, entrance: false },
	);
	campusHall(
		ctx,
		{ x: -41.75, z: 22.6, w: 11.5, d: 5.4, ry: Math.PI },
		{ floors: 3, tile: TILE.brickOrange },
	);
	campusHall(
		ctx,
		{ x: -58.75, z: 22.6, w: 14.5, d: 5.4, ry: Math.PI },
		{ floors: 3, tile: TILE.brickRed, entrance: false },
	);

	out.push(patch(QUAD, PARK));
	out.push(
		box(12.2, PAVE_TOP, 2.4, COURT, -40.6, Y, QUAD_AXIS_Z),
		box(2.2, PAVE_TOP, 8.2, COURT, QUAD_SPINE_X, Y, 13.1),
	);
	gatedFence(out, -35.4, QUAD.minZ + 0.1, QUAD.maxZ + 0.3, [
		QUAD_AXIS_Z - 1.7,
		QUAD_AXIS_Z + 1.7,
	]);

	for (const [x, z] of [
		[-44.5, 9.9],
		[-44.5, 16.6],
		[-38.6, 16.6],
	] as const) {
		out.push(
			place(roundTree(rng.range(0.75, 0.9), rng.pick(LEAVES)), {
				x,
				y: LAWN_Y,
				z,
			}),
		);
	}
	statue(out, -38.4, 9.8);
	for (const x of [-44.2, -39]) {
		out.push(
			place(bench(), { x, y: WALK_Y, z: QUAD_AXIS_Z - 1.9 }),
			place(bench(), { x, y: WALK_Y, z: QUAD_AXIS_Z + 1.9, ry: Math.PI }),
		);
	}
	out.push(
		place(lamp(), { x: -36.6, y: LAWN_Y, z: QUAD_AXIS_Z - 2.1 }),
		place(lamp(), { x: -36.6, y: LAWN_Y, z: QUAD_AXIS_Z + 2.1 }),
		place(lamp(), { x: -45.6, y: LAWN_Y, z: QUAD_AXIS_Z - 2.6 }),
		place(lamp(), { x: -45.6, y: LAWN_Y, z: QUAD_AXIS_Z + 2.6 }),
	);

	for (const [x, z] of [
		[-64.4, 9],
		[-64.4, 17.4],
		[-49.6, 3.6],
		[-35.2, 6.4],
		[-35.2, 20.6],
		[-35.2, 24.4],
		[-67.2, 1],
		[-67.2, 6],
	] as const) {
		out.push(
			place(roundTree(rng.range(0.7, 0.95), rng.pick(LEAVES)), { x, y: Y, z }),
		);
	}

	const groups: readonly (readonly [number, number])[] = [
		[-43.6, 10.6],
		[-38.8, 10.4],
		[-43.6, 15.8],
		[-38.8, 16],
		[-45.4, QUAD_AXIS_Z],
		[-41.6, QUAD_AXIS_Z + 1.2],
		[-40, 8.2],
	];
	createCrowd(
		ctx,
		groups.map(([x, z]) => ({ x, z, y: LAWN_Y })),
		{ count: groups.length * 3, spread: 0.7 },
	);

	ctx.sidewalks.push(
		new Polyline(
			[
				new Vector3(-34.2, WALK_Y, QUAD_AXIS_Z),
				new Vector3(-45.4, WALK_Y, QUAD_AXIS_Z),
			],
			false,
		),
		new Polyline(
			[
				new Vector3(QUAD_SPINE_X, WALK_Y, 9),
				new Vector3(QUAD_SPINE_X, WALK_Y, 17.2),
			],
			false,
		),
	);
}

function highStreet(ctx: BuildContext): void {
	const out = ctx.statics;
	out.push(box(31.5, PAVE_TOP, 2, 0xcdc3b0, -50.25, Y, -1.4));
	for (const x of [-64, -56, -48, -40]) {
		out.push(place(lamp(), { x, y: WALK_Y, z: -2.2 }));
	}
	ctx.sidewalks.push(
		new Polyline(
			[new Vector3(-34.2, WALK_Y, -1.4), new Vector3(-66, WALK_Y, -1.4)],
			false,
		),
	);
}

export function buildRural(ctx: BuildContext): void {
	farm(ctx);
	oldTownRow(ctx);
	townHallBlock(ctx);
	highStreet(ctx);
	campus(ctx);
}
