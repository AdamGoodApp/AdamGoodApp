import { type BufferGeometry, Vector3 } from "three";
import { box, cone, cyl, merge, place, prism } from "../geometry";
import { TILE } from "../kit/atlas";
import { walkup } from "../kit/buildings";
import { FLOOR_H } from "../kit/facade";
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
import { campusHall, library, rotunda, townHall } from "./civic";
import type { BuildContext } from "./context";
import { CELL_Y } from "./layout";

/**
 * "Old Town & Campus" (x[-84,-33] z[-27,27]); usable area x[-82.5,-34.5]
 * z[-25.5,25.5] (every cell edge carries a 1.5 m sidewalk).
 *
 *  x -82.5..-68.5  z 3..25.3 farm corner: cow + sheep pastures, barn, silo,
 *                  greenhouse, allotments, hay, one windmill
 *  x -82.5..-68.4  z -25.2..-8.6 library + market square (8 stalls, crowd,
 *                  café terrace); z -7..2 student block (fire escapes),
 *                  café, bike rack
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

const COWS: Rect = { minX: -82, maxX: -76, minZ: 3, maxZ: 8.6 };
const SHEEP: Rect = { minX: -75.4, maxX: -69, minZ: 3, maxZ: 8.6 };
const YARD: Rect = { minX: -82.4, maxX: -68.6, minZ: 9.4, maxZ: 25.2 };

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

function bikeRack(
	out: BufferGeometry[],
	x: number,
	z: number,
	n: number,
	y = LAWN_Y,
): void {
	const len = n * 0.6;
	out.push(box(len, 0.05, 0.3, IRON, x, y, z));
	for (let i = 0; i <= n; i++) {
		out.push(box(0.04, 0.55, 0.04, IRON, x - len / 2 + i * 0.6, y, z));
	}
	const tints = [0xe8463c, 0x3b7dd8, 0xf2c94c, 0x58c27a, 0xf28c28] as const;
	for (let i = 0; i < n; i++) {
		if (i % 4 === 3) continue;
		const bx = x - len / 2 + 0.3 + i * 0.6;
		for (const dz of [-0.42, 0.42]) {
			out.push(
				place(cyl(0.3, 0.3, 0.05, 8, IRON, 0, 0, 0), {
					x: bx,
					y: y + 0.3,
					z: z + dz,
					rz: Math.PI / 2,
				}),
			);
		}
		out.push(
			box(0.05, 0.06, 0.9, tints[i % tints.length] as number, bx, y + 0.5, z),
			box(0.4, 0.04, 0.04, IRON, bx, y + 0.88, z + 0.4),
			box(0.12, 0.05, 0.2, IRON, bx, y + 0.72, z - 0.25),
		);
	}
}

function cafeTable(
	out: BufferGeometry[],
	x: number,
	z: number,
	y: number,
	umbrella: number,
): void {
	out.push(
		cyl(0.04, 0.04, 2.2, 5, 0x888888, x, y, z),
		cyl(0.45, 0.45, 0.06, 10, 0xf4efe0, x, y + 0.7, z),
		cone(1.1, 0.45, 8, umbrella, x, y + 2.0, z),
		box(0.4, 0.45, 0.4, 0x8a5a3c, x - 0.8, y, z),
		box(0.4, 0.45, 0.4, 0x8a5a3c, x + 0.8, y, z),
	);
}

/** Market stall in a local frame (front +Z): counter, back cloth, produce, striped awning. */
function stall(
	out: BufferGeometry[],
	x: number,
	z: number,
	ry: number,
	awn: number,
	goods: readonly number[],
): void {
	const parts: BufferGeometry[] = [
		box(2.5, 2.2, 0.1, 0xd9c9a8, 0, 0, -0.7),
		box(2.4, 0.95, 0.8, 0x8a5a3c, 0, 0, 0.1),
		box(0.08, 2.1, 0.08, 0x5a5d62, -1.15, 0, 0.68),
		box(0.08, 2.1, 0.08, 0x5a5d62, 1.15, 0, 0.68),
	];
	for (let i = 0; i < 4; i++) {
		parts.push(
			box(
				0.5,
				0.2,
				0.42,
				goods[i % goods.length] as number,
				-0.9 + i * 0.6,
				0.95,
				0.1,
			),
		);
	}
	const slats: BufferGeometry[] = [];
	for (let k = 0; k < 5; k++) {
		slats.push(
			box(0.5, 0.08, 1.7, k % 2 ? 0xf6f2e8 : awn, -1.0 + k * 0.5, 0, 0),
		);
	}
	parts.push(place(merge(slats), { y: 2.15, z: 0.0, rx: 0.2 }));
	out.push(place(merge(parts), { x, y: WALK_Y, z, ry }));
}

/** Zig-zag iron escape on a wall; `east` mounts on a +X face at x, else on a +Z face at z. */
function ironEscape(
	out: BufferGeometry[],
	cx: number,
	cz: number,
	wall: number,
	east: boolean,
	floors: number,
): void {
	for (let f = 1; f < floors; f++) {
		const y = f * FLOOR_H;
		const sgn = f % 2 ? 1 : -1;
		if (east) {
			out.push(
				box(0.9, 0.08, 3.2, IRON, wall + 0.45, y, cz),
				box(0.05, 0.9, 3.2, IRON, wall + 0.9, y, cz),
				box(0.9, 0.9, 0.05, IRON, wall + 0.45, y, cz - 1.6),
				box(0.9, 0.9, 0.05, IRON, wall + 0.45, y, cz + 1.6),
				place(box(0.5, 0.06, FLOOR_H * 1.2, IRON), {
					x: wall + 0.45,
					y: y + FLOOR_H / 2,
					z: cz + sgn * 0.8,
					rx: sgn * 0.75,
				}),
			);
		} else {
			out.push(
				box(3.2, 0.08, 0.9, IRON, cx, y, wall + 0.45),
				box(3.2, 0.9, 0.05, IRON, cx, y, wall + 0.9),
				box(0.05, 0.9, 0.9, IRON, cx - 1.6, y, wall + 0.45),
				box(0.05, 0.9, 0.9, IRON, cx + 1.6, y, wall + 0.45),
				place(box(0.5, 0.06, FLOOR_H * 1.2, IRON), {
					x: cx + sgn * 0.8,
					y: y + FLOOR_H / 2,
					z: wall + 0.45,
					rx: -0.75,
					ry: Math.PI / 2,
				}),
			);
		}
	}
}

function farm(ctx: BuildContext): void {
	const out = ctx.statics;

	out.push(patch(COWS, 0x88c874), patch(SHEEP, FIELD_B), patch(YARD, 0xb89f73));
	fence(out, COWS);
	fence(out, SHEEP);

	for (let i = 0; i < 3; i++) {
		out.push(
			patch(
				{
					minX: -82.4 + i * 0.55,
					maxX: -81.95 + i * 0.55,
					minZ: 10,
					maxZ: 21.5,
				},
				i % 2 ? darken(FIELD_B, 0.85) : FIELD_C,
			),
		);
	}

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
		// greenhouse
		box(2.5, 0.5, 3.2, 0x8a7a66, -69.9, FARM_Y, 13.9),
		box(2.3, 1.5, 3.0, 0xbfe4e6, -69.9, FARM_Y + 0.5, 13.9),
		prism(2.5, 0.9, 3.2, 0xd8f0f2, -69.9, FARM_Y + 2.0, 13.9),
		box(0.6, 0.5, 0.6, 0x4f8f4a, -69.9, FARM_Y + 0.5, 13.9),
		// water trough
		box(1.8, 0.4, 0.6, 0x7a7d82, -79.5, FARM_Y, 9.9),
	);

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

/** Old-town market square (library on the north side, stalls, café terrace, crowd). */
function market(ctx: BuildContext): void {
	const out = ctx.statics;
	const { rng } = ctx;

	library(ctx, { x: -78.1, z: -22.5, w: 8.8, d: 5.4 }, { floors: 3 });
	walkup(
		ctx,
		{ x: -70.9, z: -22.5, w: 5, d: 5.4 },
		{ floors: 5, upper: TILE.brickBrown, shops: true },
	);

	out.push(
		patch(
			{ minX: -82.4, maxX: -68.2, minZ: -19.4, maxZ: -8.6 },
			COURT,
			PAVE_TOP,
		),
	);
	const awnings = [0xb5544a, 0x2f6b4f, 0x2f5f8f, 0xd9a03c, 0x6b3f7a] as const;
	const goods = [0xe85d5d, 0x8fd36b, 0xf7d64f, 0xf29e6b, 0x9b6bf2] as const;
	for (const x of [-80.6, -77.4, -74.2, -71]) {
		stall(out, x, -14.6, 0, rng.pick(awnings), goods);
		stall(out, x, -10.4, Math.PI, rng.pick(awnings), goods);
	}
	for (const z of [-17, -9.2]) {
		out.push(
			place(roundTree(0.6, rng.pick(LEAVES)), { x: -81.9, y: WALK_Y, z }),
			place(lamp(), { x: -68.8, y: WALK_Y, z }),
		);
	}
	flowerBed(out, -75.4, -17.4, 3.2, 0.8, rng.pick(FLOWERS));
	for (const x of [-72.4, -69.9])
		cafeTable(out, x, -17.2, WALK_Y, rng.pick(awnings));

	const spots: CrowdSpot[] = [];
	for (let i = 0; i < 10; i++) {
		spots.push({ x: -81 + i * 1.25, z: -12.5, y: WALK_Y });
	}
	for (let i = 0; i < 4; i++) {
		spots.push({ x: -80.6 + i * 3.2, z: -13.2, y: WALK_Y, ry: 0 });
		spots.push({ x: -80.6 + i * 3.2, z: -11.8, y: WALK_Y, ry: Math.PI });
	}
	spots.push(
		{ x: -72.4, z: -17.2, y: WALK_Y },
		{ x: -69.9, z: -17.2, y: WALK_Y },
		{ x: -71.2, z: -16.8, y: WALK_Y },
	);
	createCrowd(ctx, spots, { count: 36, spread: 0.45 });

	ctx.sidewalks.push(
		new Polyline(
			[new Vector3(-81.5, WALK_Y, -12.5), new Vector3(-68.6, WALK_Y, -12.5)],
			false,
		),
	);
}

/** Brick student housing with iron fire escapes, a café with a terrace, bikes and students. */
function studentBlock(ctx: BuildContext): void {
	const out = ctx.statics;
	const { rng } = ctx;

	out.push(
		patch(
			{ minX: -82.4, maxX: -67.8, minZ: -0.3, maxZ: 2.0 },
			PAVEMENT,
			PAVE_TOP,
		),
	);
	walkup(
		ctx,
		{ x: -78.4, z: -3.6, w: 8.2, d: 6.6 },
		{ floors: 5, shops: false, upper: TILE.brickRed },
	);
	ironEscape(out, -78.4, -3.6, -74.3, true, 5);
	ironEscape(out, -80.8, -3.6, -0.3, false, 5);
	walkup(
		ctx,
		{ x: -70.6, z: -4.3, w: 5.2, d: 5.4 },
		{ floors: 4, upper: TILE.stuccoCream, shops: true },
	);

	const awnings = [0xb5544a, 0x2f6b4f, 0x2f5f8f, 0xd9a03c] as const;
	for (const x of [-72.2, -70.2, -68.4]) {
		cafeTable(out, x, 0.8, WALK_Y, rng.pick(awnings));
	}
	bikeRack(out, -77.6, 1.4, 6, WALK_Y);
	out.push(
		place(bench(), { x: -80.8, y: WALK_Y, z: 1.6, ry: Math.PI }),
		place(lamp(), { x: -74.6, y: WALK_Y, z: 1.6 }),
	);

	createCrowd(
		ctx,
		[
			{ x: -79.8, z: 0.8, y: WALK_Y },
			{ x: -75.8, z: 0.9, y: WALK_Y },
			{ x: -72.2, z: 1.4, y: WALK_Y },
			{ x: -70.2, z: 1.4, y: WALK_Y },
			{ x: -68.6, z: 1.2, y: WALK_Y },
		],
		{ count: 12, spread: 0.6 },
	);
	ctx.sidewalks.push(
		new Polyline(
			[new Vector3(-82, WALK_Y, 0.6), new Vector3(-67.6, WALK_Y, 0.6)],
			false,
		),
	);
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

	campusHall(
		ctx,
		{ x: -64.8, z: ROTUNDA.z, w: 10, d: 4, ry: FACE_X },
		{ floors: 3, tile: TILE.brickBrown, entrance: false },
	);
	for (const [x, z] of [
		[-45.4, 7.1],
		[-37.4, 7.1],
		[-37.6, 18.4],
		[-45.6, 18.4],
	] as const) {
		bikeRack(out, x, z, 4);
	}
	for (const x of [-44.1, -39.4]) {
		out.push(
			place(bench(), { x, y: LAWN_Y, z: 8.5 }),
			place(bench(), { x, y: LAWN_Y, z: 17.2, ry: Math.PI }),
		);
	}
	for (const z of [9.4, 16.9]) {
		out.push(
			box(0.7, 0.6, 1.6, 0x4f8f4a, -46.2, LAWN_Y, z),
			box(0.7, 0.6, 1.6, 0x4f8f4a, -36.1, LAWN_Y, z),
		);
	}
	flowerBed(out, -41.75, 7.6, 2.2, 0.8, ctx.rng.pick(FLOWERS));
	flowerBed(out, -41.75, 18.4, 2.2, 0.8, ctx.rng.pick(FLOWERS));

	for (const [x, z] of [
		[-67.4, 8.8],
		[-67.4, 12.5],
		[-67.4, 17],
		[-67.4, 20.2],
		[-67.4, 24.4],
		[-49.6, 3.6],
		[-35.2, 6.4],
		[-35.2, 20.6],
		[-35.2, 24.4],
		[-67.2, 1],
		[-67.2, 6],
		[-48.8, 8.2],
		[-48.8, 18.6],
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
		[-45.6, 7.8],
		[-37.2, 8.4],
		[-45.8, 18.0],
		[-37.4, 18.2],
		[-41.7, 18.4],
		[-48.2, 6.6],
		[-48.2, 19.4],
		[-64.2, 6.8],
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
	for (const x of [-60, -52, -44]) {
		out.push(
			box(1.2, 0.5, 0.5, 0x8a7a66, x, WALK_Y, -2.2),
			box(1.0, 0.45, 0.3, ctx.rng.pick(LEAVES), x, WALK_Y + 0.5, -2.2),
			place(bench(), { x: x + 2, y: WALK_Y, z: -0.7, ry: Math.PI }),
		);
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
	market(ctx);
	studentBlock(ctx);
	townHallBlock(ctx);
	highStreet(ctx);
	campus(ctx);
}
