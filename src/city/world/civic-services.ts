import type { BufferGeometry } from "three";
import { box, cone, cyl, GLOW, glow, merge, place } from "../geometry";
import { TILE } from "../kit/atlas";
import { FLOOR_H, facadeAt, facadeBox } from "../kit/facade";
import {
	bench,
	firefighter,
	fireTruck,
	person,
	policeCar,
	roundTree,
} from "../prefabs";
import type { BuildContext } from "./context";
import { SIDEWALK_Y } from "./layout";
import type { SignSpec } from "./signs";
import { tintWhite } from "./tint";

/** Fire station: front (bay doors) faces +X onto the ring road; centre and footprint size. */
export const FIRE_STATION = { x: 75.5, z: 8.5, w: 9, d: 7, floors: 3 } as const;
/** Police station: front faces +Z onto the south avenue. */
export const POLICE_STATION = {
	x: 76.5,
	z: 18.25,
	w: 12,
	d: 7.5,
	floors: 3,
} as const;
/** Hose tower's west edge: neighbouring buildings must stay west of it. */
export const SERVICES_WEST_EDGE = 69.4;

const STONE = 0xd8d0c0;
const ROOF = 0x6f7378;
const BACKING = 0x1b1b1f;
const APRON = 0xa9adb3;
const APRON_TOP = SIDEWALK_Y + 0.03;
const BLUE = 0x3a86ff;

function roof(
	w: number,
	d: number,
	h: number,
	trim: number,
	out: BufferGeometry[],
): void {
	out.push(
		box(w, 0.25, d, ROOF, 0, h),
		box(w + 0.4, 0.5, d + 0.4, trim, 0, h - 0.3),
		box(w + 0.2, 0.5, 0.25, trim, 0, h + 0.2, d / 2 - 0.05),
		box(w + 0.2, 0.5, 0.25, trim, 0, h + 0.2, -d / 2 + 0.05),
		box(0.25, 0.5, d, trim, w / 2 - 0.05, h + 0.2),
		box(0.25, 0.5, d, trim, -w / 2 + 0.05, h + 0.2),
	);
}

function emit(
	ctx: BuildContext,
	parts: BufferGeometry[],
	walls: BufferGeometry[],
	x: number,
	z: number,
	ry: number,
): void {
	const t = { x, z, ry };
	ctx.statics.push(place(merge(parts), t));
	for (const wall of walls) ctx.facades.push(place(wall, t));
}

/** Red-brick fire station with three bay doors, a hose tower and a parked engine. */
function fireStation(ctx: BuildContext, signs: SignSpec[]): void {
	const { x, z, w, d, floors } = FIRE_STATION;
	const h = floors * FLOOR_H;
	const seed = ctx.rng.int(1, 9999);
	const walls = [
		facadeBox(w, d, h, {
			upper: TILE.brickRed,
			ground: TILE.garageRed,
			seed,
			skip: ["back", "left", "right"],
		}),
		facadeBox(w, d, h, {
			upper: TILE.brickRed,
			ground: TILE.blankBrick,
			seed,
			skip: ["front"],
		}),
	];
	const s: BufferGeometry[] = [];
	roof(w, d, h, STONE, s);
	s.push(
		box(w + 0.1, 0.3, 0.25, STONE, 0, FLOOR_H - 0.15, d / 2 + 0.05),
		box(0.35, h, 0.35, STONE, -w / 2, 0, d / 2),
		box(0.35, h, 0.35, STONE, w / 2, 0, d / 2),
		box(4.7, 1.4, 0.12, BACKING, 0, 3.5, d / 2 + 0.1),
		glow(
			box(0.35, 0.35, 0.18, 0xff3b30, -2.9, 3.95, d / 2 + 0.12),
			GLOW.always,
		),
		glow(box(0.35, 0.35, 0.18, 0xff3b30, 2.9, 3.95, d / 2 + 0.12), GLOW.always),
	);
	emit(ctx, s, walls, x, z, Math.PI / 2);

	signs.push({
		label: "FIRE DEPT",
		width: 4.4,
		height: 1.1,
		position: [x + d / 2 + 0.2, 4.2, z],
		ry: Math.PI / 2,
	});

	const tx = SERVICES_WEST_EDGE + 1.3;
	const tz = z - w / 2 + 1.3;
	ctx.facades.push(
		facadeAt(2.6, 2.6, 13, {
			x: tx,
			z: tz,
			upper: TILE.brickRed,
			ground: TILE.blankBrick,
			seed: seed + 1,
		}),
	);
	ctx.statics.push(
		box(3, 0.35, 3, STONE, tx, 13, tz),
		place(cone(2.12, 1.6, 4, 0x8a3b30), {
			x: tx,
			y: 13.35,
			z: tz,
			ry: Math.PI / 4,
		}),
	);

	const apronX0 = x + d / 2;
	const apronW = 82.5 - apronX0;
	ctx.statics.push(
		box(apronW, 0.03, w, APRON, apronX0 + apronW / 2, SIDEWALK_Y, z),
		box(0.15, 0.035, w, 0xd62828, apronX0 + 0.1, SIDEWALK_Y, z),
		place(fireTruck(), { x: 80.8, y: APRON_TOP, z: z + 0.1 }),
		place(firefighter(), {
			x: 82.2,
			y: APRON_TOP,
			z: z - 3.4,
			ry: -Math.PI / 2,
		}),
		place(firefighter(), {
			x: 82.2,
			y: APRON_TOP,
			z: z + 3.6,
			ry: -Math.PI / 2,
		}),
	);
}

/** Blue-grey stone police station with an entrance portico, flag and two patrol cars. */
function policeStation(ctx: BuildContext, signs: SignSpec[]): void {
	const { x, z, w, d, floors } = POLICE_STATION;
	const h = floors * FLOOR_H;
	const walls = [
		facadeBox(w, d, h, {
			upper: TILE.stoneGrey,
			ground: TILE.lobby,
			tint: 0xb8c8e4,
			seed: ctx.rng.int(1, 9999),
		}),
	];
	const s: BufferGeometry[] = [];
	roof(w, d, h, 0xdfe3ea, s);
	s.push(
		box(w + 0.3, 0.3, d + 0.3, 0xdfe3ea, 0, FLOOR_H - 0.15),
		box(3.4, 0.25, 2, 0xe8eaee, 0, 3, d / 2 + 0.95),
		cyl(0.18, 0.18, 3, 8, 0xf0f0f0, -1.5, 0, d / 2 + 1.75),
		cyl(0.18, 0.18, 3, 8, 0xf0f0f0, 1.5, 0, d / 2 + 1.75),
		box(3.2, 0.12, 1.9, 0xcfd3d8, 0, 0, d / 2 + 0.95),
		box(3.2, 0.12, 1.2, 0xcfd3d8, 0, 0.12, d / 2 + 0.6),
		box(4.3, 1.3, 0.12, BACKING, 0, 3.75, d / 2 + 0.1),
		glow(box(0.3, 0.5, 0.15, BLUE, -2.6, 4, d / 2 + 0.12), GLOW.always),
		glow(box(0.3, 0.5, 0.15, BLUE, 2.6, 4, d / 2 + 0.12), GLOW.always),
		cyl(0.05, 0.05, 2.2, 6, 0x555555, -2.5, 0, d / 2 + 0.35),
		cyl(0.05, 0.05, 2.2, 6, 0x555555, 2.5, 0, d / 2 + 0.35),
		glow(box(0.32, 0.45, 0.32, BLUE, -2.5, 2.2, d / 2 + 0.35), GLOW.always),
		glow(box(0.32, 0.45, 0.32, BLUE, 2.5, 2.2, d / 2 + 0.35), GLOW.always),
		cyl(0.06, 0.08, 4, 6, 0x666666, 3.5, h + 0.3, -1),
		box(1.2, 0.6, 1.2, 0x8c9196, -3.5, h + 0.3, 0.5),
	);
	emit(ctx, s, walls, x, z, 0);

	signs.push({
		label: "POLICE",
		width: 4,
		height: 1,
		position: [x, 4.4, z + d / 2 + 0.2],
		ry: 0,
	});

	const frontZ = z + d / 2;
	const apronD = 25.5 - frontZ;
	ctx.statics.push(
		box(w, 0.03, apronD, APRON, x, SIDEWALK_Y, frontZ + apronD / 2),
		place(policeCar(), { x: x - 3.8, y: APRON_TOP, z: 23.8, ry: Math.PI / 2 }),
		place(policeCar(), { x: x + 3.8, y: APRON_TOP, z: 23.8, ry: -Math.PI / 2 }),
	);

	const px = x - w / 2 + 0.4;
	const pz = 25.1;
	ctx.statics.push(
		cyl(0.07, 0.07, 7, 6, 0xbdbdbd, px, SIDEWALK_Y, pz),
		box(1.5, 0.2, 0.04, 0xb22234, px + 0.8, SIDEWALK_Y + 6.6, pz),
		box(1.5, 0.2, 0.04, 0xf4f4f4, px + 0.8, SIDEWALK_Y + 6.4, pz),
		box(1.5, 0.2, 0.04, 0xb22234, px + 0.8, SIDEWALK_Y + 6.2, pz),
		box(0.6, 0.4, 0.05, 0x3c3b6e, px + 0.3, SIDEWALK_Y + 6.4, pz),
		box(0.2, 0.2, 0.2, 0xffd84a, px, SIDEWALK_Y + 7, pz),
	);
}

const HEDGE = 0x3f8a4a;
const CONE = 0xff7a1a;

function cone2(ctx: BuildContext, x: number, z: number): void {
	ctx.statics.push(
		box(0.4, 0.05, 0.4, 0x222222, x, APRON_TOP, z),
		cone(0.17, 0.55, 6, CONE, x, APRON_TOP + 0.05, z),
		box(0.22, 0.08, 0.22, 0xffffff, x, APRON_TOP + 0.22, z),
	);
}

function bollard(ctx: BuildContext, x: number, z: number, hex: number): void {
	ctx.statics.push(cyl(0.1, 0.1, 0.75, 6, hex, x, SIDEWALK_Y, z));
}

function hydrant(ctx: BuildContext, x: number, z: number): void {
	ctx.statics.push(
		cyl(0.14, 0.16, 0.55, 6, 0xd62828, x, SIDEWALK_Y, z),
		cyl(0.18, 0.18, 0.08, 6, 0xd62828, x, SIDEWALK_Y + 0.55, z),
		box(0.4, 0.12, 0.12, 0xd62828, x, SIDEWALK_Y + 0.25, z),
	);
}

function planterBox(
	ctx: BuildContext,
	x: number,
	z: number,
	w: number,
	d: number,
	flower: number,
): void {
	ctx.statics.push(
		box(w, 0.4, d, 0x8a5a3c, x, SIDEWALK_Y, z),
		box(w - 0.1, 0.18, d - 0.1, HEDGE, x, SIDEWALK_Y + 0.4, z),
		box(0.25, 0.14, 0.25, flower, x - w / 4, SIDEWALK_Y + 0.58, z),
		box(0.25, 0.14, 0.25, flower, x + w / 4, SIDEWALK_Y + 0.58, z),
	);
}

function standing(
	ctx: BuildContext,
	x: number,
	z: number,
	ry: number,
	shirt: number,
): void {
	ctx.statics.push(
		place(tintWhite(person(), shirt), { x, y: SIDEWALK_Y, z, ry }),
	);
}

/** Hedges, trees, cones, bollards, benches and standing staff around both stations. */
function serviceDetails(ctx: BuildContext): void {
	const { statics } = ctx;
	const y = SIDEWALK_Y;
	const { x: fx, z: fz, w: fw } = FIRE_STATION;
	const fireWallZ = fz - fw / 2;

	// Street side of the fire station (z 2..4): planters, bench, hydrant, chatting crew.
	planterBox(ctx, 72.6, 3.35, 1.1, 0.5, 0xe8463c);
	planterBox(ctx, 78.4, 3.35, 1.1, 0.5, 0xf2c94c);
	statics.push(place(bench(), { x: fx, y, z: fireWallZ - 0.45, ry: Math.PI }));
	hydrant(ctx, 73.6, 2.45);
	hydrant(ctx, 80.2, 2.45);
	bollard(ctx, 80.9, 3.5, 0xd62828);
	bollard(ctx, 81.9, 3.5, 0xd62828);
	standing(ctx, 74.3, 3.0, 0, 0xe85d5d);
	standing(ctx, 76.8, 3.1, Math.PI, 0x4f8ef7);

	// Hose-drill yard behind the shops (x 69.4..72, z 7..13).
	statics.push(
		box(0.7, 0.55, 5.8, HEDGE, 69.85, y, 10),
		place(roundTree(0.45), { x: 71.1, y, z: 12.2 }),
		place(bench(), { x: 71.3, y, z: 9.2, ry: Math.PI / 2 }),
		box(1.8, 0.04, 5.2, 0x9aa0a8, 70.9, y, 9.8),
		box(0.3, 0.3, 0.3, 0xd62828, 70.8, y, 7.4),
		box(0.3, 0.3, 0.3, 0xe8c23a, 71.3, y, 7.4),
		cyl(0.35, 0.35, 0.5, 8, 0x444a52, 71.2, y, 7.9),
	);
	hydrant(ctx, 70.5, 11);
	for (const [cx, cz] of [
		[70.7, 8.4],
		[71.5, 10.6],
	] as const) {
		statics.push(
			cone(0.17, 0.5, 6, CONE, cx, y, cz),
			box(0.22, 0.08, 0.22, 0xffffff, cx, y + 0.2, cz),
		);
	}
	statics.push(
		place(firefighter(), {
			x: 71.3,
			y,
			z: 10.6,
			ry: Math.PI,
		}),
	);

	// Apron beside the engine: cones, hydrant and an idle firefighter.
	cone2(ctx, 79.4, 4.5);
	cone2(ctx, 79.4, 12.5);
	cone2(ctx, 82.2, 8.2);
	hydrant(ctx, 82.3, 9.5);
	statics.push(
		place(firefighter(), { x: 79.4, y: APRON_TOP, z: 8.6, ry: Math.PI / 2 }),
	);

	// Rear strip between the stations (z 13..14.5).
	statics.push(box(12.4, 0.55, 0.6, HEDGE, 76.1, y, 13.75));
	for (const x of [71.2, 74.8, 78.4, 81.5]) {
		statics.push(place(roundTree(0.42), { x, y: y + 0.4, z: 13.75 }));
	}
	statics.push(box(0.7, 0.55, 7.2, HEDGE, 69.85, y, 18.3));
	statics.push(
		place(roundTree(0.4), { x: 69.95, y: y + 0.4, z: 16.2 }),
		place(roundTree(0.4), { x: 69.95, y: y + 0.4, z: 20.4 }),
	);

	// Police apron: bollards, planters, officers and visitors.
	for (const bx of [72.4, 73.6, 74.4, 78.8, 80, 81.2]) {
		bollard(ctx, bx, 25.2, 0x3a86ff);
	}
	planterBox(ctx, 72.5, 22.4, 0.9, 0.5, 0xf2c94c);
	planterBox(ctx, 80.5, 22.4, 0.9, 0.5, 0xe8463c);
	standing(ctx, 75.7, 24.4, 0, 0x1f3a6e);
	standing(ctx, 77.3, 24.4, Math.PI, 0x1f3a6e);
	standing(ctx, 76.5, 25.0, Math.PI, 0xf29e6b);
}

export function buildCivicServices(ctx: BuildContext, signs: SignSpec[]): void {
	fireStation(ctx, signs);
	policeStation(ctx, signs);
	serviceDetails(ctx);
}
