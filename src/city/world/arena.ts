import {
	CylinderGeometry,
	DoubleSide,
	SphereGeometry,
	TorusGeometry,
	Vector3,
} from "three";
import { positionLocal } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { night } from "../env";
import { box, cyl, GLOW, glow, paint, paintBy, place } from "../geometry";
import { TILE } from "../kit/atlas";
import { facadeAt } from "../kit/facade";
import { CARS, CONCRETE, PAVEMENT, SIDEWALK, WHITE } from "../palette";
import { car, lamp, roundTree } from "../prefabs";
import { type Agent, Pool, scaled } from "../sim/agent";
import { type CrowdSpot, createCrowd } from "../sim/crowd";
import { Polyline } from "../sim/path";
import type { BuildContext } from "./context";
import { CELL_Y, SIDEWALK_Y } from "./layout";
import { signMesh } from "./signs";
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

function buildLots(ctx: BuildContext): void {
	asphalt(ctx, 35.8, 62.6, -54.6, -35.6);
	rowAlongX(ctx, 36, 11, -54.4, 4.6, 0);
	rowAlongX(ctx, 36, 11, -45, 4.6, Math.PI);
	rowAlongX(ctx, 36, 11, -40.4, 4.6, 0);

	asphalt(ctx, 68.2, 82, -81.2, -54.5);
	rowAlongZ(ctx, -81, 11, 68.4, 4.4, Math.PI / 2);
	rowAlongZ(ctx, -81, 11, 77.4, 4.4, -Math.PI / 2);

	for (const i of [2, 6, 10]) {
		ctx.statics.push(
			place(lamp(), { x: 36 + i * BAY_PITCH, y: ASPHALT_Y, z: -40.4 }),
		);
	}
	for (const i of [3, 8]) {
		const z = -81 + i * BAY_PITCH;
		ctx.statics.push(
			place(lamp(), { x: 68.5, y: ASPHALT_Y, z }),
			place(lamp(), { x: 81.7, y: ASPHALT_Y, z }),
		);
	}
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
	for (let x = 40; x < 62; x += 6) {
		s.push(place(roundTree(0.5), { x, y: CELL_Y, z: -35.2 }));
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
	createCrowd(ctx, spots, { count: 50, spread: 0.35, cheer: false });
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
	buildPlaza(ctx);
	buildSearchlights(ctx);
}
