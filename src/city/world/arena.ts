import {
	type BufferGeometry,
	CylinderGeometry,
	DoubleSide,
	SphereGeometry,
	TorusGeometry,
	Vector3,
} from "three";
import { positionLocal } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { night } from "../env";
import {
	box,
	cone,
	cyl,
	GLOW,
	glow,
	merge,
	paint,
	paintBy,
	place,
} from "../geometry";
import { TILE } from "../kit/atlas";
import { walkup } from "../kit/buildings";
import { facadeAt } from "../kit/facade";
import {
	BRIGHTS,
	CARS,
	CONCRETE,
	GRASS,
	PAVEMENT,
	SHIRTS,
	SIDEWALK,
	WHITE,
} from "../palette";
import { bench, bus, car, lamp, person, pine, roundTree } from "../prefabs";
import { type Agent, Pool, scaled } from "../sim/agent";
import { type CrowdSpot, createCrowd } from "../sim/crowd";
import { Polyline } from "../sim/path";
import type { BuildContext } from "./context";
import { CELL_Y, SIDEWALK_Y } from "./layout";
import { type SignSpec, signMesh } from "./signs";
import { tintWhite } from "./tint";

const CX = 48.6;
const CZ = -68.5;
const R = 13;
const SEGMENTS = 28;
const WALL_H = 8;
const DOME_R = R - 0.2;
const DOME_SY = 0.55;
/** Polar angle where the glass skylight cap ends and the shell begins. */
const CAP_THETA = 0.55;

const ASPHALT = 0x4b4e54;
const ASPHALT_Y = CELL_Y + 0.03;
const PAVED_Y = CELL_Y + 0.08;
const BAY_PITCH = 2.4;
const STRIPE = 0xe8e8e8;

const PAVILION_X = 61.4;
const PAVILION_FRONT_X = 63.4;
const SCREEN_X = 67.4;
const WALK_X = 65;

const SKY_COLORS = [0xff4fa3, 0x59d8ff, 0xffd84f, 0x7dff7a, WHITE, 0xff7a3d];

const BEAMS = 8;
const BEAM_LENGTH = 64;
const BEAM_COLORS = [0xfff1c4, 0xbfe6ff, 0xffd2f0];

function buildBowl(ctx: BuildContext): void {
	const chord = 2 * R * Math.sin(Math.PI / SEGMENTS);
	const faceR = R * Math.cos(Math.PI / SEGMENTS);
	for (let k = 0; k < SEGMENTS; k++) {
		const phi = (k * Math.PI * 2) / SEGMENTS;
		const nx = Math.cos(phi);
		const nz = Math.sin(phi);
		const ry = Math.atan2(nx, nz);
		// Segments 27, 0 and 1 are replaced by the entrance pavilion on the +X side.
		if (k !== 0 && k !== 1 && k !== SEGMENTS - 1) {
			ctx.facades.push(
				facadeAt(chord, 0.2, WALL_H, {
					upper: k % 2 ? TILE.glassDark : TILE.officeWhite,
					ground: TILE.blankConcrete,
					seed: k,
					x: CX + nx * (faceR - 0.1),
					z: CZ + nz * (faceR - 0.1),
					ry,
					skip: ["back", "left", "right"],
				}),
			);
			ctx.statics.push(
				glow(
					box(
						chord * 0.9,
						0.22,
						0.1,
						0x59d8ff,
						CX + nx * (faceR + 0.05),
						WALL_H - 0.9,
						CZ + nz * (faceR + 0.05),
						ry,
					),
					GLOW.always,
				),
			);
		}
		ctx.statics.push(
			box(
				chord + 0.1,
				0.5,
				0.9,
				0xeceff2,
				CX + nx * (faceR - 0.15),
				WALL_H,
				CZ + nz * (faceR - 0.15),
				ry,
			),
		);
	}
	ctx.statics.push(cyl(13.9, 13.9, 0.08, 36, CONCRETE, CX, CELL_Y, CZ));
}

function buildDome(ctx: BuildContext): void {
	const at = { x: CX, y: WALL_H, z: CZ, sy: DOME_SY };
	const shell = paintBy(
		new SphereGeometry(
			DOME_R,
			28,
			8,
			0,
			Math.PI * 2,
			CAP_THETA,
			Math.PI / 2 - CAP_THETA,
		),
		(x, y, z) => {
			const sector = Math.floor(
				((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 16,
			);
			if (y < 0.7) return 0xc9ced4;
			return sector % 2 ? 0xdfe4ea : 0xf3f5f7;
		},
	);
	ctx.statics.push(place(shell, at));
	const skylight = paint(
		new SphereGeometry(DOME_R * 1.004, 28, 3, 0, Math.PI * 2, 0, CAP_THETA),
		0x8fb9d6,
		GLOW.night,
	);
	ctx.statics.push(place(skylight, at));

	for (let k = 0; k < 4; k++) {
		const rib = paint(
			new TorusGeometry(DOME_R + 0.15, 0.2, 5, 28, Math.PI),
			WHITE,
		);
		ctx.statics.push(place(rib, { ...at, ry: (k * Math.PI) / 4 }));
	}
	for (const theta of [0.95, 1.25]) {
		const r = DOME_R * Math.sin(theta) + 0.1;
		const ring = paint(new TorusGeometry(r, 0.15, 4, 32), WHITE);
		ctx.statics.push(
			place(ring, {
				x: CX,
				y: WALL_H + DOME_R * Math.cos(theta) * DOME_SY,
				z: CZ,
				rx: Math.PI / 2,
			}),
		);
	}
}

function buildEntrance(ctx: BuildContext): void {
	const s = ctx.statics;
	ctx.facades.push(
		facadeAt(9, 4, 6.4, {
			upper: TILE.glassBlue,
			ground: TILE.lobby,
			seed: 71,
			x: PAVILION_X,
			z: CZ,
			ry: Math.PI / 2,
			skip: ["back"],
		}),
	);
	s.push(
		box(4.6, 0.4, 9.6, 0xf4f5f7, PAVILION_X + 0.2, 6.4, CZ),
		box(0.5, 0.6, 9.6, 0x3b7dd8, PAVILION_FRONT_X + 0.25, 6.4, CZ),
		box(0.4, 3.2, 11, 0x14171c, PAVILION_FRONT_X - 0.2, 6.8, CZ),
		glow(
			box(0.1, 0.2, 11, 0x59d8ff, PAVILION_FRONT_X - 0.1, 10, CZ),
			GLOW.always,
		),
		glow(
			box(0.1, 0.2, 11, 0xff4fa3, PAVILION_FRONT_X - 0.1, 6.6, CZ),
			GLOW.always,
		),
	);
	ctx.group.add(
		signMesh([
			{
				label: "ADAMGOODAPP ARENA",
				width: 10.4,
				height: 2.6,
				position: [PAVILION_FRONT_X + 0.02, 8.4, CZ],
				ry: Math.PI / 2,
			},
		]),
	);
}

function ledScreen(ctx: BuildContext, cz: number): void {
	const s = ctx.statics;
	for (const dz of [-3.2, 3.2]) {
		s.push(cyl(0.25, 0.3, 3.6, 8, 0x6b7078, SCREEN_X, PAVED_Y, cz + dz));
	}
	s.push(box(0.5, 4.8, 8.4, 0x14171c, SCREEN_X, 3.5, cz));
	const face = SCREEN_X + 0.28;
	for (let row = 0; row < 3; row++) {
		for (let col = 0; col < 6; col++) {
			s.push(
				glow(
					box(
						0.06,
						1.1,
						1.2,
						ctx.rng.pick(SKY_COLORS),
						face,
						3.5 + 0.3 + row * 1.4,
						cz + (col - 2.5) * 1.3,
					),
					GLOW.always,
				),
			);
		}
	}
}

function asphalt(
	ctx: BuildContext,
	x0: number,
	x1: number,
	z0: number,
	z1: number,
): void {
	ctx.statics.push(
		box(x1 - x0, 0.03, z1 - z0, ASPHALT, (x0 + x1) / 2, CELL_Y, (z0 + z1) / 2),
	);
}

function parkCar(
	ctx: BuildContext,
	x: number,
	z: number,
	ry: number,
	y = ASPHALT_Y,
): void {
	ctx.statics.push(
		place(tintWhite(car(), ctx.rng.pick(CARS)), {
			x: x + ctx.rng.range(-0.12, 0.12),
			y,
			z: z + ctx.rng.range(-0.15, 0.15),
			ry: ry + ctx.rng.range(-0.03, 0.03),
		}),
	);
}

const HEDGE = 0x3f8a47;
const HEDGE_TOP = 0x58a85c;
const STEEL = 0x8c9196;
const DARK = 0x2b2f36;
const UMBRELLAS = [0xe8463c, 0x3b7dd8, 0xf2c94c, 0x58c27a, 0xf28c28] as const;
/** Top of a grass plate laid on the district slab. */
export const GRASS_Y = CELL_Y + 0.04;

/** True when (x, z) is at least `m` metres from the arena centre. */
function clear(x: number, z: number, m: number): boolean {
	return Math.hypot(x - CX, z - CZ) >= m;
}

export function grassPlate(
	ctx: BuildContext,
	x0: number,
	x1: number,
	z0: number,
	z1: number,
): void {
	ctx.statics.push(
		box(x1 - x0, 0.04, z1 - z0, GRASS, (x0 + x1) / 2, CELL_Y, (z0 + z1) / 2),
	);
}

export function hedge(
	ctx: BuildContext,
	x: number,
	z: number,
	w: number,
	d: number,
	y = GRASS_Y,
	h = 0.8,
): void {
	ctx.statics.push(
		box(w, h, d, HEDGE, x, y, z),
		box(w * 0.9, 0.14, d * 0.8, HEDGE_TOP, x, y + h, z),
	);
}

export function planter(
	ctx: BuildContext,
	x: number,
	z: number,
	y = GRASS_Y,
): void {
	const s = ctx.statics;
	s.push(
		box(0.9, 0.4, 0.9, 0xb8aa98, x, y, z),
		box(0.74, 0.1, 0.74, 0x6b4a2f, x, y + 0.4, z),
		box(0.6, 0.3, 0.6, HEDGE_TOP, x, y + 0.5, z),
	);
	for (const [dx, dz] of [
		[-0.18, -0.15],
		[0.17, -0.1],
		[0, 0.18],
	] as const) {
		s.push(
			box(0.16, 0.14, 0.16, ctx.rng.pick(BRIGHTS), x + dx, y + 0.8, z + dz),
		);
	}
}

export function bin(
	ctx: BuildContext,
	x: number,
	z: number,
	y = GRASS_Y,
): void {
	ctx.statics.push(
		cyl(0.22, 0.2, 0.75, 6, 0x3f6b52, x, y, z),
		cyl(0.25, 0.25, 0.08, 6, 0x2e4a3a, x, y + 0.75, z),
	);
}

/** Steel rail with parked bikes; the rail runs along local Z (`ry` rotates it). */
export function bikeRack(
	ctx: BuildContext,
	x: number,
	z: number,
	y: number,
	ry = 0,
): void {
	const parts: BufferGeometry[] = [box(0.06, 0.06, 1.8, STEEL, 0, 0.45, 0)];
	for (const pz of [-0.8, 0, 0.8]) {
		parts.push(box(0.06, 0.45, 0.06, STEEL, 0, 0, pz));
	}
	for (const bz of [-0.5, 0.45]) {
		parts.push(
			box(0.9, 0.08, 0.07, ctx.rng.pick(BRIGHTS), 0, 0.35, bz),
			box(0.05, 0.5, 0.5, DARK, -0.4, 0, bz),
			box(0.05, 0.5, 0.5, DARK, 0.4, 0, bz),
			box(0.06, 0.05, 0.4, DARK, -0.4, 0.55, bz),
		);
	}
	ctx.statics.push(place(merge(parts), { x, y, z, ry }));
}

export function staticPerson(
	ctx: BuildContext,
	x: number,
	y: number,
	z: number,
	ry = ctx.rng.range(0, Math.PI * 2),
): void {
	ctx.statics.push(
		place(tintWhite(person(), ctx.rng.pick(SHIRTS)), { x, y, z, ry }),
	);
}

/** Cafe table with a parasol and two chairs. */
function tableSet(ctx: BuildContext, x: number, z: number, y: number): void {
	const chair = ctx.rng.pick(UMBRELLAS);
	ctx.statics.push(
		place(
			merge([
				cyl(0.03, 0.03, 2.1, 5, STEEL, 0, 0, 0),
				cyl(0.38, 0.38, 0.05, 8, 0xf4f0e6, 0, 0.7, 0),
				box(0.32, 0.45, 0.32, DARK, -0.62, 0, 0),
				box(0.32, 0.45, 0.32, DARK, 0.62, 0, 0),
				cone(0.95, 0.45, 8, chair, 0, 1.95, 0),
			]),
			{ x, y, z },
		),
	);
}

/** Street-food cart with a parasol; its serving side faces local +Z. */
function foodCart(
	ctx: BuildContext,
	x: number,
	z: number,
	y: number,
	ry: number,
): void {
	ctx.statics.push(
		place(
			merge([
				box(1.3, 0.7, 0.8, ctx.rng.pick(BRIGHTS), 0, 0.3, 0),
				box(1.4, 0.06, 0.9, 0xd9d9d6, 0, 1.0, 0),
				cyl(0.03, 0.03, 1.2, 5, STEEL, 0.4, 1.0, 0),
				cone(0.9, 0.4, 8, ctx.rng.pick(UMBRELLAS), 0.4, 2.0, 0),
				box(0.06, 0.4, 0.4, DARK, -0.67, 0, 0),
				box(0.06, 0.4, 0.4, DARK, 0.67, 0, 0),
			]),
			{ x, y, z, ry },
		),
	);
}

/** Small drinks/news kiosk with an awning, front facing local +Z. */
function kiosk(ctx: BuildContext, x: number, z: number, ry: number): void {
	const roof = ctx.rng.pick(BRIGHTS);
	ctx.statics.push(
		place(
			merge([
				box(1.6, 2.2, 1.4, 0xe8eaee, 0, 0, 0),
				box(1.8, 0.15, 1.6, roof, 0, 2.2, 0),
				box(1.1, 0.7, 0.05, 0x2f4866, 0, 1.1, 0.72),
				box(1.5, 0.08, 0.4, 0xd9d9d6, 0, 1.0, 0.9),
				box(1.9, 0.1, 0.9, roof, 0, 1.95, 0.95),
			]),
			{ x, y: GRASS_Y, z, ry },
		),
	);
}

/** Densify one corner of the arena square; (ox, oz) is the outer corner, (sx, sz) point inwards. */
function corner(
	ctx: BuildContext,
	ox: number,
	oz: number,
	sx: number,
	sz: number,
): void {
	const at = (u: number, v: number) => ({ x: ox + sx * u, z: oz + sz * v });
	const ex = ox + sx * 9.5;
	const ez = oz + sz * 8.4;
	grassPlate(
		ctx,
		Math.min(ox, ex),
		Math.max(ox, ex),
		Math.min(oz, ez),
		Math.max(oz, ez),
	);
	for (let v = 0.4; v < 8.4; v += 1.2) {
		const p = at(0.55, v);
		if (clear(p.x, p.z, 14.9)) hedge(ctx, p.x, p.z, 0.6, 1.2);
	}
	const k = at(2.4, 2.4);
	const hasKiosk = clear(k.x, k.z, 16.4);
	if (hasKiosk) {
		kiosk(ctx, k.x, k.z, Math.PI / 4);
		for (const [u, v] of [
			[4.4, 2.6],
			[2.6, 4.6],
		] as const) {
			const t = at(u, v);
			if (clear(t.x, t.z, 16.2)) {
				tableSet(ctx, t.x, t.z, GRASS_Y);
				staticPerson(ctx, t.x + 0.9, GRASS_Y, t.z + 0.3);
			}
		}
	}
	const l = at(6.2, 1.6);
	if (clear(l.x, l.z, 16))
		ctx.statics.push(place(lamp(), { x: l.x, y: GRASS_Y, z: l.z }));
	for (let u = 1.4; u < 9; u += 1.8) {
		for (let v = 1.8; v < 8.2; v += 1.8) {
			if (hasKiosk && u < 5.6 && v < 5.6) continue;
			const p = at(u, v);
			if (!clear(p.x, p.z, 15.9)) continue;
			const r = ctx.rng();
			if (r < 0.34) {
				ctx.statics.push(
					place(roundTree(ctx.rng.range(0.4, 0.6)), {
						x: p.x,
						y: GRASS_Y,
						z: p.z,
					}),
				);
			} else if (r < 0.46) {
				ctx.statics.push(place(pine(0.5), { x: p.x, y: GRASS_Y, z: p.z }));
			} else if (r < 0.62) {
				planter(ctx, p.x, p.z);
			} else if (r < 0.78) {
				ctx.statics.push(
					place(bench(), {
						x: p.x,
						y: GRASS_Y,
						z: p.z,
						ry: Math.atan2(CX - p.x, CZ - p.z),
					}),
				);
			} else if (r < 0.88) {
				bin(ctx, p.x, p.z);
			} else {
				staticPerson(ctx, p.x, GRASS_Y, p.z);
			}
		}
	}
}

/** Grass, hedges and trees along the outer edges of the arena square and its lots. */
function buildEdges(ctx: BuildContext): void {
	const s = ctx.statics;
	grassPlate(ctx, 34.5, 68.2, -82.5, -81.2);
	grassPlate(ctx, 68.2, 82.5, -82.5, -81.8);
	grassPlate(ctx, 82, 82.5, -81.8, -54.5);
	grassPlate(ctx, 34.5, 62.5, -56.5, -54.6);
	grassPlate(ctx, 34.5, 35.8, -54.6, -34.5);
	grassPlate(ctx, 35.8, 48, -35.6, -34.5);
	for (let x = 35; x < 68; x += 1.2) {
		if (clear(x, -81.75, 14.9)) hedge(ctx, x, -81.75, 1.2, 0.6);
	}
	for (let x = 35; x < 62.5; x += 1.2) {
		if (clear(x, -55.2, 14.9)) hedge(ctx, x, -55.2, 1.2, 0.6);
	}
	for (let x = 36; x < 46.5; x += 1.2) hedge(ctx, x, -34.75, 1.2, 0.5);
	for (const x of [37, 40, 43]) {
		s.push(place(roundTree(0.5), { x, y: GRASS_Y, z: -35.2 }));
	}
	for (const z of [-54, -48, -42, -36.5]) {
		s.push(place(roundTree(0.5), { x: 35.3, y: GRASS_Y, z }));
	}
	for (let z = -80; z <= -56; z += 3) {
		s.push(place(roundTree(0.5), { x: 82.25, y: GRASS_Y, z }));
	}
	corner(ctx, 34.5, -82.5, 1, 1);
	corner(ctx, 62.5, -82.5, -1, 1);
	corner(ctx, 34.5, -54.6, 1, -1);
	corner(ctx, 62.5, -54.6, -1, -1);
}

/** Bus terminal with a boarding island, plus a taxi rank, at the north end of the east lot. */
function buildTerminal(ctx: BuildContext, signs: SignSpec[]): void {
	const s = ctx.statics;
	const y = ASPHALT_Y;
	const iy = y + 0.12;
	for (const [z, ry, col] of [
		[-80.4, Math.PI / 2, 0x3b7dd8],
		[-75.6, -Math.PI / 2, 0xe8463c],
	] as const) {
		s.push(place(tintWhite(bus(), col), { x: 74.6, y, z, ry }));
	}
	s.push(
		box(8.6, 0.12, 2.4, 0xc9ccd1, 74.6, y, -78),
		box(8.6, 0.02, 0.12, 0xf2c94c, 74.6, iy, -79.05),
		box(8.6, 0.02, 0.12, 0xf2c94c, 74.6, iy, -76.95),
		box(7.4, 0.15, 2.2, 0x3b7dd8, 74.6, 3.35, -78),
		box(7.4, 0.05, 2.2, 0xe8eaee, 74.6, 3.3, -78),
		box(1.2, 1.5, 0.1, 0x2f4866, 74.6, iy, -77.05),
	);
	for (const px of [71.2, 74.6, 78]) {
		for (const pz of [-78.9, -77.1]) {
			s.push(cyl(0.07, 0.07, 3.1, 6, STEEL, px, iy, pz));
		}
	}
	for (const bx of [72.6, 76.6]) {
		s.push(place(bench(), { x: bx, y: iy, z: -78 }));
	}
	for (const [px, pz] of [
		[71.0, -78.5],
		[71.6, -77.5],
		[72.9, -78.7],
		[75.6, -77.4],
		[77.4, -78.4],
		[78.2, -77.6],
	] as const) {
		staticPerson(ctx, px, iy, pz);
	}
	s.push(
		cyl(0.05, 0.05, 3.2, 6, STEEL, 79.4, y, -78),
		box(1.7, 0.65, 0.08, DARK, 79.4, 3.1, -78.02),
	);
	signs.push({
		label: "BUS",
		width: 1.6,
		height: 0.5,
		position: [79.4, 3.4, -77.95],
		ry: 0,
	});

	asphalt(ctx, 68.2, 82, -81.8, -81.2);
	s.push(box(13.4, 0.02, 0.1, 0xf2c94c, 75.1, ASPHALT_Y, -74));
	for (const x of [70.8, 75.2, 79.6]) {
		s.push(
			place(tintWhite(car(), 0xf2c94c), { x, y, z: -72.7, ry: Math.PI / 2 }),
			glow(box(0.2, 0.18, 0.55, 0xfff1c4, x - 0.2, y + 1.2, -72.7), GLOW.night),
		);
	}
	s.push(
		cyl(0.05, 0.05, 3.2, 6, STEEL, 69.2, y, -73.9),
		box(1.7, 0.65, 0.08, DARK, 69.2, 3.1, -73.92),
	);
	signs.push({
		label: "TAXI",
		width: 1.6,
		height: 0.5,
		position: [69.2, 3.4, -73.85],
		ry: 0,
	});
	for (const [px, pz] of [
		[73.0, -71.8],
		[77.5, -71.9],
		[81.2, -74.4],
	] as const) {
		staticPerson(ctx, px, y, pz);
	}
	for (const x of [69.0, 81.4]) {
		s.push(place(lamp(), { x, y, z: -77.9 }));
	}
}

/** Pharmacy / cafe / diner strip with sidewalk tables along the avenue edge of the south lot. */
function buildStrip(ctx: BuildContext, signs: SignSpec[]): void {
	const s = ctx.statics;
	const z = -38.5;
	const d = 3.6;
	const specs = [
		{ x: 50.6, w: 4.8, floors: 2, label: "PHARMACY", upper: TILE.stuccoCream },
		{ x: 55.4, w: 4.4, floors: 1, label: "CAFE", upper: TILE.brickRed },
		{ x: 60.1, w: 4.6, floors: 2, label: "DINER", upper: TILE.stoneBeige },
	];
	s.push(box(14.6, 0.08, 2.2, SIDEWALK, 55.3, CELL_Y, -35.6));
	for (const b of specs) {
		walkup(
			ctx,
			{ x: b.x, z, w: b.w, d, ry: 0 },
			{
				floors: b.floors,
				upper: b.upper,
				ground: TILE.storeGlass,
				shops: true,
			},
		);
		signs.push({
			label: b.label,
			width: Math.min(b.w * 0.8, 3),
			height: 0.6,
			position: [b.x, b.floors * 3.2 + 0.45, z + d / 2 + 0.1],
			ry: 0,
		});
	}
	for (const x of [54.4, 56.4, 59.3, 61.2]) tableSet(ctx, x, -35.5, SIDEWALK_Y);
	for (const x of [53.1, 57.7, 62.2]) planter(ctx, x, -35.3, SIDEWALK_Y);
	bikeRack(ctx, 49.4, -35.5, SIDEWALK_Y, Math.PI / 2);
	for (const [px, pz] of [
		[50.6, -35.6],
		[51.5, -36.1],
		[55.4, -36.1],
		[60.2, -36.1],
		[58.2, -35.2],
	] as const) {
		staticPerson(ctx, px, SIDEWALK_Y, pz);
	}
	s.push(place(lamp(), { x: 48.5, y: SIDEWALK_Y, z: -34.9 }));
}

/** Benches, bins and planters along the walkway between the south lot and the hospital. */
function buildPromenade(ctx: BuildContext): void {
	const s = ctx.statics;
	for (const z of [-52.5, -49, -41.5, -38]) {
		s.push(place(bench(), { x: 63.0, y: SIDEWALK_Y, z, ry: Math.PI / 2 }));
	}
	for (const z of [-50.3, -45, -40.2]) bin(ctx, 66.0, z, SIDEWALK_Y);
	for (const z of [-53.2, -47.5, -42.5]) planter(ctx, 66.0, z, SIDEWALK_Y);
	for (const z of [-51.5, -43.5]) {
		s.push(place(lamp(), { x: 66.2, y: SIDEWALK_Y, z }));
	}
}

function buildLots(ctx: BuildContext): void {
	asphalt(ctx, 35.8, 62.6, -54.6, -35.6);
	rowAlongX(ctx, 36, 11, -54.4, 4.6, 0);
	rowAlongX(ctx, 36, 11, -45, 4.6, Math.PI);
	rowAlongX(ctx, 36, 5, -40.4, 4.6, 0);

	asphalt(ctx, 68.2, 82, -81.2, -54.5);
	rowAlongZ(ctx, -71.4, 7, 68.4, 4.4, Math.PI / 2);
	rowAlongZ(ctx, -71.4, 7, 77.4, 4.4, -Math.PI / 2);

	ctx.statics.push(
		place(lamp(), { x: 36 + 2 * BAY_PITCH, y: ASPHALT_Y, z: -40.4 }),
	);
	for (const x of [50.4, 60]) {
		ctx.statics.push(place(lamp(), { x, y: ASPHALT_Y, z: -47.4 }));
	}
	const z = -81 + 8 * BAY_PITCH;
	ctx.statics.push(
		place(lamp(), { x: 68.5, y: ASPHALT_Y, z }),
		place(lamp(), { x: 81.7, y: ASPHALT_Y, z }),
	);
}

function buildPlaza(ctx: BuildContext): void {
	const s = ctx.statics;
	s.push(
		box(5.7, 0.08, 26.6, PAVEMENT, 65.35, CELL_Y, -67.9),
		box(3.7, 0.08, 19.7, SIDEWALK, 64.45, CELL_Y, -44.75),
	);
	ledScreen(ctx, -76.5);
	ledScreen(ctx, -60.5);
	for (const z of [-71, -66]) {
		s.push(place(roundTree(0.55), { x: SCREEN_X, y: PAVED_Y, z }));
	}
	for (const z of [-56.6, -80.4]) {
		s.push(place(lamp(), { x: 66.6, y: PAVED_Y, z }));
	}
	for (let x = 38; x < 82; x += 6) {
		s.push(place(roundTree(0.5), { x, y: CELL_Y, z: -82.1 }));
	}
	for (const z of [-51, -45, -39]) {
		s.push(place(roundTree(0.5), { x: 35.3, y: CELL_Y, z }));
	}

	for (const z of [-79.6, -73.5, -58.6]) planter(ctx, 63.0, z, PAVED_Y);
	bikeRack(ctx, 63.2, -76.8, PAVED_Y);
	bikeRack(ctx, 63.2, -60.8, PAVED_Y);
	foodCart(ctx, 67.1, -68.5, PAVED_Y, -Math.PI / 2);
	foodCart(ctx, 63.6, -55.8, PAVED_Y, Math.PI / 2);
	foodCart(ctx, 63.6, -80.3, PAVED_Y, Math.PI / 2);
	for (let i = 0; i < 12; i++) {
		staticPerson(
			ctx,
			ctx.rng.range(63.6, 66.6),
			PAVED_Y,
			ctx.rng.range(-80.5, -56),
		);
	}

	ctx.sidewalks.push(
		new Polyline(
			[
				new Vector3(WALK_X, SIDEWALK_Y, -33.9),
				new Vector3(WALK_X, SIDEWALK_Y, -79.5),
			],
			false,
		),
	);

	const door = { x: PAVILION_FRONT_X + 0.9, z: CZ };
	const spots: CrowdSpot[] = [];
	for (const z of [-78, -74, -70.5, -68.5, -66.5, -63, -58.5]) {
		for (let i = 0; i < 6; i++) {
			const t = 0.25 + i * 0.15;
			const x = door.x + (66.6 - door.x) * t;
			const sz = door.z + (z - door.z) * t;
			spots.push({
				x,
				z: sz,
				y: SIDEWALK_Y,
				ry: Math.atan2(door.x - x, door.z - sz),
			});
		}
	}
	for (let i = 0; i < 8; i++) {
		spots.push({
			x: ctx.rng.range(64, 66.6),
			z: ctx.rng.range(-80, -57),
			y: SIDEWALK_Y,
		});
	}
	for (const [cx, cz] of [
		[65.8, -68.5],
		[65, -55.8],
		[65, -80.3],
		[64, -76.8],
		[64, -60.8],
	] as const) {
		for (let i = 0; i < 4; i++) {
			spots.push({
				x: cx + ctx.rng.range(-0.5, 0.5),
				z: cz + ctx.rng.range(-0.6, 0.6),
				y: SIDEWALK_Y,
			});
		}
	}
	createCrowd(ctx, spots, { count: 70, spread: 0.35, cheer: false });
}
/** A row of bays side by side along X; cars point along ±Z (`ry` 0 = +Z). */
function rowAlongX(
	ctx: BuildContext,
	x0: number,
	count: number,
	z0: number,
	depth: number,
	ry: number,
): void {
	for (let i = 0; i <= count; i++) {
		ctx.statics.push(
			box(
				0.12,
				0.02,
				depth,
				STRIPE,
				x0 + i * BAY_PITCH,
				ASPHALT_Y,
				z0 + depth / 2,
			),
		);
	}
	for (let i = 0; i < count; i++) {
		if (ctx.rng() < 0.95) {
			parkCar(ctx, x0 + (i + 0.5) * BAY_PITCH, z0 + depth / 2, ry);
		}
	}
}

/** A row of bays side by side along Z; cars point along ±X (`ry` π/2 = +X). */
function rowAlongZ(
	ctx: BuildContext,
	z0: number,
	count: number,
	x0: number,
	depth: number,
	ry: number,
): void {
	for (let i = 0; i <= count; i++) {
		ctx.statics.push(
			box(
				depth,
				0.02,
				0.12,
				STRIPE,
				x0 + depth / 2,
				ASPHALT_Y,
				z0 + i * BAY_PITCH,
			),
		);
	}
	for (let i = 0; i < count; i++) {
		if (ctx.rng() < 0.95) {
			parkCar(ctx, x0 + depth / 2, z0 + (i + 0.5) * BAY_PITCH, ry);
		}
	}
}

function beamMaterial(): MeshBasicNodeMaterial {
	const m = new MeshBasicNodeMaterial({
		vertexColors: true,
		transparent: true,
		depthWrite: false,
		side: DoubleSide,
	});
	const fade = positionLocal.y.div(BEAM_LENGTH).oneMinus().mul(0.85).add(0.15);
	m.opacityNode = night.mul(0.32).mul(fade);
	return m;
}

class SearchlightAgent implements Agent {
	constructor(
		private readonly pool: Pool,
		private readonly bases: readonly Vector3[],
		private readonly outward: readonly number[],
	) {}

	update(_dt: number, t: number): void {
		for (let i = 0; i < this.bases.length; i++) {
			const yaw =
				(this.outward[i] as number) + 0.7 * Math.sin(t * 0.35 + i * 1.3);
			const pitch = 0.35 + 0.25 * Math.sin(t * 0.27 + i * 2.1);
			this.pool.write(i, this.bases[i] as Vector3, yaw, pitch);
		}
		this.pool.commit();
	}
}

function buildSearchlights(ctx: BuildContext): void {
	const n = scaled(BEAMS, ctx.density);
	const geo = paint(
		new CylinderGeometry(1.6, 0.25, BEAM_LENGTH, 10, 1, true),
		WHITE,
	).translate(0, BEAM_LENGTH / 2, 0);
	const pool = new Pool(geo, beamMaterial(), n, { shadow: false });
	const bases: Vector3[] = [];
	const outward: number[] = [];
	for (let i = 0; i < n; i++) {
		const phi = ((i + 0.5) * Math.PI * 2) / n;
		const x = CX + Math.cos(phi) * 13;
		const z = CZ + Math.sin(phi) * 13;
		bases.push(new Vector3(x, WALL_H + 1.1, z));
		outward.push(Math.atan2(Math.cos(phi), Math.sin(phi)));
		pool.color(i, BEAM_COLORS[i % BEAM_COLORS.length] as number);
		ctx.statics.push(
			box(0.9, 0.5, 0.9, 0x2b2f36, x, WALL_H + 0.5, z),
			glow(box(0.6, 0.15, 0.6, 0xfff1c4, x, WALL_H + 1, z), GLOW.night),
		);
	}
	ctx.group.add(pool.mesh);
	ctx.agents.push(new SearchlightAgent(pool, bases, outward));
}

/** Domed stadium at the NE cell's west half: bowl, roof, plaza, parking lots, crowd, searchlights. */
export function buildArena(ctx: BuildContext): void {
	buildBowl(ctx);
	buildDome(ctx);
	buildEntrance(ctx);
	buildLots(ctx);
	buildEdges(ctx);
	buildPlaza(ctx);
	buildPromenade(ctx);
	const signs: SignSpec[] = [];
	buildTerminal(ctx, signs);
	buildStrip(ctx, signs);
	ctx.group.add(signMesh(signs));
	buildSearchlights(ctx);
}
