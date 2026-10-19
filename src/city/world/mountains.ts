import {
	BoxGeometry,
	BufferGeometry,
	CatmullRomCurve3,
	Float32BufferAttribute,
	IcosahedronGeometry,
	Matrix4,
	Vector3,
} from "three";
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
	prism,
} from "../geometry";
import { TILE } from "../kit/atlas";
import { facadeBox } from "../kit/facade";
import { CARS, ROCK, SNOW } from "../palette";
import { car, pine } from "../prefabs";
import { mulberry32 } from "../rng";
import { type CrowdSpot, createCrowd } from "../sim/crowd";
import { Polyline } from "../sim/path";
import { createLift, createSkiers } from "../sim/ski";
import type { BuildContext } from "./context";
import { CELL_Y, SIDEWALK_Y } from "./layout";
import { tintWhite } from "./tint";

interface PeakDef {
	x: number;
	z: number;
	r: number;
	h: number;
	radial: number;
	seed: number;
}

interface Peak {
	x: number;
	z: number;
	h: number;
	reach2: number;
	/** World-space triangles, 9 floats each (x, y, z × 3), wound outward. */
	tris: Float32Array;
}

const RINGS = 8;
const GRASS_LINE = 0.15;
const ROCK_LINE = 0.55;
const FOOT = 0x6f9c5a;

/** Peaks keep to z < -47 so the south of the cell is flat ground for the ski village. */
const PEAK_DEFS: readonly PeakDef[] = [
	{ x: 0, z: -65.5, r: 18, h: 34, radial: 12, seed: 0x9e3779 },
	{ x: -16.5, z: -58, r: 8, h: 13, radial: 8, seed: 0x51ed27 },
	{ x: 18, z: -58, r: 7.5, h: 12, radial: 8, seed: 0x2f6b1d },
];

/**
 * A rugged cone: the same jittered ring grid feeds both the rendered mesh and
 * `terrainHeight`, so anything placed on the terrain sits exactly on the facets.
 */
function makePeak(d: PeakDef): Peak {
	const rng = mulberry32(d.seed);
	const n = d.radial;
	const step = (Math.PI * 2) / n;
	const rings: number[][] = [];
	for (let k = 1; k <= RINGS; k++) {
		const ring: number[] = [];
		const base = k === RINGS;
		for (let j = 0; j < n; j++) {
			const theta = j * step + rng.range(-0.22, 0.22) * step;
			const rho =
				(d.r * k) / RINGS +
				(base ? -rng() * 0.04 * d.r : rng.range(-0.035, 0.035) * d.r);
			const y = base ? 0 : d.h * (1 - k / RINGS) + rng.range(-0.02, 0.02) * d.h;
			ring.push(d.x + rho * Math.sin(theta), y, d.z + rho * Math.cos(theta));
		}
		rings.push(ring);
	}

	const tris: number[] = [];
	const vert = (k: number, j: number): void => {
		const o = (j % n) * 3;
		const ring = rings[k - 1] as number[];
		tris.push(ring[o] as number, ring[o + 1] as number, ring[o + 2] as number);
	};
	for (let j = 0; j < n; j++) {
		tris.push(d.x, d.h, d.z);
		vert(1, j);
		vert(1, j + 1);
	}
	for (let k = 1; k < RINGS; k++) {
		for (let j = 0; j < n; j++) {
			vert(k, j);
			vert(k + 1, j);
			vert(k + 1, j + 1);
			vert(k, j);
			vert(k + 1, j + 1);
			vert(k, j + 1);
		}
	}
	const reach = d.r * 1.1;
	return {
		x: d.x,
		z: d.z,
		h: d.h,
		reach2: reach * reach,
		tris: Float32Array.from(tris),
	};
}

const PEAKS = PEAK_DEFS.map(makePeak);

/** Height of the rendered mountain surface at (x, z); 0 off the peaks. */
export function terrainHeight(x: number, z: number): number {
	let best = 0;
	for (const p of PEAKS) {
		const dx = x - p.x;
		const dz = z - p.z;
		if (dx * dx + dz * dz > p.reach2) continue;
		const t = p.tris;
		for (let i = 0; i < t.length; i += 9) {
			const x0 = t[i] as number;
			const z0 = t[i + 2] as number;
			const x1 = t[i + 3] as number;
			const z1 = t[i + 5] as number;
			const x2 = t[i + 6] as number;
			const z2 = t[i + 8] as number;
			const det = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
			if (Math.abs(det) < 1e-9) continue;
			const a = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / det;
			const b = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / det;
			const c = 1 - a - b;
			if (a < -1e-6 || b < -1e-6 || c < -1e-6) continue;
			const y =
				a * (t[i + 1] as number) +
				b * (t[i + 4] as number) +
				c * (t[i + 7] as number);
			if (y > best) best = y;
		}
	}
	return best;
}

function peakGeometry(p: Peak): BufferGeometry {
	const geo = new BufferGeometry();
	geo.setAttribute(
		"position",
		new Float32BufferAttribute(Float32Array.from(p.tris), 3),
	);
	return paintBy(geo, (_x, y) => {
		const f = y / p.h;
		if (f < GRASS_LINE) return FOOT;
		return f < ROCK_LINE ? ROCK : SNOW;
	});
}

// Ski lift: base → top along a straight line, 5 pylons.
const LIFT_BASE = { x: 19.5, z: -44.5 };
const LIFT_TOP = { x: 7, z: -61 };
const PYLONS = 5;
const PYLON_HEIGHT = 6;
const CABLE_GAP = 1.2;

const SKI_POINTS: readonly (readonly [number, number])[] = [
	[3, -62],
	[9, -57.5],
	[4, -53],
	[10.5, -49],
	[13, -43],
	[13.5, -38],
	[13.5, -35.6],
];
const SKI_SAMPLES = 80;

const lookMatrix = new Matrix4();
const origin = new Vector3();
const beamDir = new Vector3();
const worldUp = new Vector3(0, 1, 0);

/** Thin square beam from a to b. */
function beam(
	a: Vector3,
	b: Vector3,
	thickness: number,
	hex: number,
): BufferGeometry {
	beamDir.subVectors(b, a);
	const len = beamDir.length();
	// Matrix4.lookAt points +Z from target to eye, so aim at -dir to get +Z = dir.
	lookMatrix.lookAt(origin, beamDir.negate(), worldUp);
	lookMatrix.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
	return paint(new BoxGeometry(thickness, thickness, len), hex).applyMatrix4(
		lookMatrix,
	);
}

function skiPath(): Polyline {
	const curve = new CatmullRomCurve3(
		SKI_POINTS.map(([x, z]) => new Vector3(x, 0, z)),
		false,
		"centripetal",
	);
	const points = curve.getSpacedPoints(SKI_SAMPLES);
	for (const p of points) {
		const h = terrainHeight(p.x, p.z);
		// Hug the flat run-out, clear the facets on the slope.
		p.y = Math.max(CELL_Y + 0.05, h) + 0.12 + 0.28 * Math.min(1, h / 2);
	}
	return new Polyline(points, false);
}

function segmentDistance(
	px: number,
	pz: number,
	ax: number,
	az: number,
	bx: number,
	bz: number,
): number {
	const dx = bx - ax;
	const dz = bz - az;
	const t = Math.max(
		0,
		Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)),
	);
	return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

interface Footprint {
	x: number;
	z: number;
	hx: number;
	hz: number;
}

function rectDistance(px: number, pz: number, r: Footprint): number {
	return Math.hypot(
		Math.max(Math.abs(px - r.x) - r.hx, 0),
		Math.max(Math.abs(pz - r.z) - r.hz, 0),
	);
}

function buildLift(statics: BufferGeometry[]): {
	up: Polyline;
	down: Polyline;
} {
	const dx = LIFT_TOP.x - LIFT_BASE.x;
	const dz = LIFT_TOP.z - LIFT_BASE.z;
	const len = Math.hypot(dx, dz);
	const side = new Vector3(dz / len, 0, -dx / len);
	const armYaw = Math.atan2(-side.z, side.x);
	const up: Vector3[] = [];
	const down: Vector3[] = [];
	for (let i = 0; i < PYLONS; i++) {
		const t = i / (PYLONS - 1);
		const x = LIFT_BASE.x + dx * t;
		const z = LIFT_BASE.z + dz * t;
		const base = Math.max(CELL_Y, terrainHeight(x, z));
		statics.push(
			cyl(0.25, 0.3, PYLON_HEIGHT, 6, 0x555555, x, base, z),
			box(
				CABLE_GAP + 0.8,
				0.12,
				0.14,
				0x555555,
				x,
				base + PYLON_HEIGHT - 0.1,
				z,
				armYaw,
			),
		);
		const y = base + PYLON_HEIGHT + 0.1;
		up.push(
			new Vector3(
				x + (side.x * CABLE_GAP) / 2,
				y,
				z + (side.z * CABLE_GAP) / 2,
			),
		);
		down.push(
			new Vector3(
				x - (side.x * CABLE_GAP) / 2,
				y,
				z - (side.z * CABLE_GAP) / 2,
			),
		);
	}
	for (let i = 0; i < PYLONS - 1; i++) {
		statics.push(beam(up[i] as Vector3, up[i + 1] as Vector3, 0.07, 0x333333));
		statics.push(
			beam(down[i] as Vector3, down[i + 1] as Vector3, 0.07, 0x333333),
		);
	}
	return { up: new Polyline(up, false), down: new Polyline(down, false) };
}

// --- Ski village -----------------------------------------------------------

const VILLAGE_Z0 = -48;
const VILLAGE_Z1 = -34.5;
const SNOW_GROUND = 0xeaf0f4;
const TIMBER = 0x5a3a22;
const PAVED = 0xcfd3d6;
const CHALET_TILES = [
	TILE.stoneWhite,
	TILE.houseBrick,
	TILE.sidingYellow,
	TILE.brickBrown,
] as const;
const CHALET_TINTS = [0xffffff, 0xf3e6d2, 0xe9d8c0] as const;
const CHALET_ROOFS = [0x3f3a38, 0x4a3b33, 0x2f3a46, 0x5a2f2a] as const;
const LANE_Z = -42;
const PARKING = { x: -21.9, z: -40.95, hx: 3.6, hz: 5.65 };

const FOOTPRINT_MARGIN = 1.4;

/** Highest terrain under a footprint, or null when the ground is too steep to build on. */
function groundAt(x: number, z: number, w: number, d: number): number | null {
	let top = CELL_Y;
	for (let ix = -1; ix <= 1; ix++) {
		for (let iz = -1; iz <= 1; iz++) {
			top = Math.max(top, terrainHeight(x + (ix * w) / 2, z + (iz * d) / 2));
		}
	}
	return top > 1.6 ? null : top;
}

/** Timber-and-stone chalet: gable to the front (+Z), steep dark roof under a snow cap. */
function chalet(
	ctx: BuildContext,
	blocked: Footprint[],
	x: number,
	z: number,
	w: number,
	d: number,
	floors: number,
): void {
	const { rng } = ctx;
	const y = groundAt(x, z, w, d);
	if (y === null) return;
	const h = floors * 3;
	const rh = Math.min(4.2, w * 0.55);
	const roof = rng.pick(CHALET_ROOFS);
	ctx.facades.push(
		place(
			facadeBox(w, d, h, {
				upper: rng.pick(CHALET_TILES),
				floor: 3,
				seed: rng.int(1, 9999),
				tint: rng.pick(CHALET_TINTS),
			}),
			{ x, y, z },
		),
	);
	const cx = w * 0.22;
	const parts: BufferGeometry[] = [
		box(w + 0.3, 0.5, d + 0.3, 0x8d8f8a, 0, -0.3),
		box(w + 1, 0.2, d + 1, 0x2f2a28, 0, h - 0.05),
		prism(w + 1, rh, d + 1, roof, 0, h + 0.1),
		prism(w + 1, rh, d + 0.4, SNOW, 0, h + 0.22),
		box(0.6, rh * 0.8, 0.6, 0x7d6f66, cx, h, -d * 0.2),
		box(0.8, 0.12, 0.8, SNOW, cx, h + rh * 0.8, -d * 0.2),
		box(0.95, 2.1, 0.08, TIMBER, -w * 0.18, 0, d / 2 + 0.04),
		glow(
			box(0.2, 0.25, 0.1, 0xffe2a0, -w * 0.18 + 0.8, 1.9, d / 2 + 0.08),
			GLOW.night,
		),
	];
	for (const sx of [-1, 1]) {
		for (const sz of [-1, 1]) {
			parts.push(box(0.2, h, 0.2, TIMBER, (sx * w) / 2, 0, (sz * d) / 2));
		}
	}
	if (floors >= 2) {
		parts.push(
			box(w + 0.2, 0.2, d + 0.2, TIMBER, 0, 2.9),
			box(w * 0.6, 0.12, 0.7, 0x8a5a3c, 0, 3, d / 2 + 0.35),
			box(w * 0.6, 0.5, 0.06, TIMBER, 0, 3.12, d / 2 + 0.68),
		);
	}
	ctx.statics.push(place(merge(parts), { x, y, z }));
	blocked.push({
		x,
		z,
		hx: w / 2 + FOOTPRINT_MARGIN,
		hz: d / 2 + FOOTPRINT_MARGIN,
	});
}

/** Three-storey stone lodge with a steep snowy roof, dormer, canopy and neon sign. */
function lodge(
	ctx: BuildContext,
	blocked: Footprint[],
	x: number,
	z: number,
	w: number,
	d: number,
): void {
	const floors = 3;
	const h = floors * 3.2;
	ctx.facades.push(
		place(
			facadeBox(w, d, h, {
				upper: TILE.stoneWhite,
				ground: TILE.lobby,
				seed: ctx.rng.int(1, 9999),
				tint: 0xf0e2c8,
			}),
			{ x, y: CELL_Y, z },
		),
	);
	const rh = 4.2;
	const parts: BufferGeometry[] = [
		box(w + 0.3, 0.5, d + 0.3, 0x8d8f8a, 0, -0.3),
		box(w + 1.2, 0.2, d + 1.2, 0x2f2a28, 0, h - 0.05),
		prism(w + 1.2, rh, d + 1.2, 0x3f3a38, 0, h + 0.1),
		prism(w + 1.2, rh, d + 0.6, SNOW, 0, h + 0.24),
		box(3.4, 1.8, 2, 0xf0e2c8, 0, h + 0.3, d / 2 - 0.6),
		prism(3.8, 1.5, 2.2, 0x3f3a38, 0, h + 2.1, d / 2 - 0.6),
		prism(3.8, 1.5, 1.8, SNOW, 0, h + 2.22, d / 2 - 0.6),
		glow(box(1.6, 0.9, 0.05, 0xffd27a, 0, h + 0.8, d / 2 + 0.42), GLOW.night),
		box(0.7, 2.6, 0.7, 0x7d6f66, w * 0.3, h, -d * 0.25),
		box(0.9, 0.12, 0.9, SNOW, w * 0.3, h + 2.6, -d * 0.25),
		box(3.4, 0.2, 0.7, TIMBER, 0, 3.1, d / 2 + 0.35),
		box(0.15, 3.1, 0.15, TIMBER, -1.6, 0, d / 2 + 0.55),
		box(0.15, 3.1, 0.15, TIMBER, 1.6, 0, d / 2 + 0.55),
		glow(box(2.4, 0.4, 0.1, 0x4cf0ff, 0, 3.45, d / 2 + 0.5), GLOW.always),
	];
	for (const sx of [-1, 1]) {
		for (const sz of [-1, 1]) {
			parts.push(box(0.24, h, 0.24, TIMBER, (sx * w) / 2, 0, (sz * d) / 2));
		}
	}
	ctx.statics.push(place(merge(parts), { x, y: CELL_Y, z }));
	blocked.push({
		x,
		z,
		hx: w / 2 + FOOTPRINT_MARGIN,
		hz: d / 2 + FOOTPRINT_MARGIN,
	});
}

function snowman(x: number, z: number, ry: number): BufferGeometry {
	return place(
		merge([
			place(paint(new IcosahedronGeometry(0.5, 0), 0xffffff), { y: 0.5 }),
			place(paint(new IcosahedronGeometry(0.38, 0), 0xffffff), { y: 1.25 }),
			place(paint(new IcosahedronGeometry(0.28, 0), 0xffffff), { y: 1.85 }),
			place(cone(0.05, 0.35, 5, 0xf28c28), {
				rx: Math.PI / 2,
				y: 1.85,
				z: 0.2,
			}),
			cyl(0.2, 0.2, 0.3, 8, 0x222222, 0, 2.05, 0),
			cyl(0.3, 0.3, 0.04, 8, 0x222222, 0, 2.05, 0),
			box(1, 0.05, 0.05, TIMBER, 0, 1.3, 0),
			box(0.4, 0.08, 0.08, 0xe8463c, 0, 1.55, 0.3),
		]),
		{ x, y: CELL_Y + 0.05, z, ry },
	);
}

function buildParking(ctx: BuildContext): CrowdSpot[] {
	const { rng, statics } = ctx;
	const { x, z, hx, hz } = PARKING;
	statics.push(box(2 * hx, 0.06, 2 * hz, 0x4a4d52, x, CELL_Y, z));
	for (let k = 0; k <= 3; k++) {
		for (const lz of [-37.7, -43.9]) {
			statics.push(
				box(
					0.1,
					0.01,
					4.4,
					0xffffff,
					x - hx + 0.1 + k * 2.4,
					CELL_Y + 0.06,
					lz,
				),
			);
		}
	}
	const spots: CrowdSpot[] = [];
	for (const [row, lz] of [-37.7, -43.9].entries()) {
		for (let bay = 0; bay < 3; bay++) {
			if (rng() < 0.2) continue;
			const bx = x - hx + 1.3 + bay * 2.4;
			statics.push(
				place(tintWhite(car(), rng.pick(CARS)), {
					x: bx,
					y: CELL_Y + 0.06,
					z: lz,
					ry: row === 0 ? Math.PI : 0,
				}),
			);
		}
	}
	spots.push({ x: x + 0.2, z: -41, y: CELL_Y + 0.06 });
	spots.push({ x: x + 2, z: -41.2, y: CELL_Y + 0.06 });
	return spots;
}

/** Chalets, lodge, car park and lanes at the foot of the mountain; returns standing-crowd spots. */
function buildVillage(ctx: BuildContext, blocked: Footprint[]): CrowdSpot[] {
	const { statics, rng } = ctx;
	const y = CELL_Y;
	const depth = VILLAGE_Z1 - VILLAGE_Z0;
	statics.push(
		box(51, 0.05, depth, SNOW_GROUND, 0, y, (VILLAGE_Z0 + VILLAGE_Z1) / 2),
	);
	const spots = buildParking(ctx);
	blocked.push(PARKING);

	// Row A faces the avenue; row B stands behind it.
	const rowA: [number, number, number][] = [
		[-14.7, 6.6, 2],
		[-7, 6.4, 2],
		[-0.7, 6, 2],
		[23.2, 4.6, 2],
	];
	for (const [x, w, floors] of rowA)
		chalet(ctx, blocked, x, -38.4, w, 6, floors);
	const rowB: [number, number, number][] = [
		[-14.7, 6.6, 2],
		[-7, 6.4, 3],
		[-0.5, 6.4, 2],
		[6.3, 6.4, 2],
	];
	for (const [x, w, floors] of rowB) chalet(ctx, blocked, x, -45, w, 5, floors);
	lodge(ctx, blocked, 6.7, -38.5, 8.2, 6.8);
	chalet(ctx, blocked, 18.6, -38.5, 3.6, 4, 1);
	statics.push(
		glow(box(3, 0.5, 0.1, 0xff4fa3, 18.6, 2.6, -36.4), GLOW.always),
		box(0.1, 1.6, 0.1, 0x8a8f96, 17.6, 0.1, -35.7),
		box(0.1, 1.6, 0.1, 0x8a8f96, 19.6, 0.1, -35.7),
		box(2.2, 0.1, 0.1, 0x8a8f96, 18.6, 1.7, -35.7),
	);

	// Lift base station next to the first pylon.
	statics.push(
		box(3.2, 2.8, 3.4, 0x777f86, 22.4, y, -44.8),
		box(3.8, 0.3, 4, 0xe8463c, 22.4, y + 2.8, -44.8),
		box(3.6, 0.12, 3.8, SNOW, 22.4, y + 3.1, -44.8),
		glow(box(2, 0.4, 0.1, 0x4cf0ff, 22.4, y + 1.8, -43.05), GLOW.always),
	);
	blocked.push({ x: 22.4, z: -44.8, hx: 3.2, hz: 3.4 });

	// Lanes: behind the front row, between chalets and along the lodge.
	const lanes: [number, number, number, number][] = [
		[-18, LANE_Z, 11.2, LANE_Z],
		[-10.8, VILLAGE_Z1 - 0.2, -10.8, LANE_Z],
		[11.2, VILLAGE_Z1 - 0.2, 11.2, LANE_Z],
	];
	for (const [x0, z0, x1, z1] of lanes) {
		const len = Math.hypot(x1 - x0, z1 - z0);
		statics.push(
			box(
				x0 === x1 ? 1.2 : len,
				0.08,
				x0 === x1 ? len : 1.2,
				PAVED,
				(x0 + x1) / 2,
				y,
				(z0 + z1) / 2,
			),
		);
		ctx.sidewalks.push(
			new Polyline(
				[new Vector3(x0, SIDEWALK_Y, z0), new Vector3(x1, SIDEWALK_Y, z1)],
				false,
			),
		);
		blocked.push({
			x: (x0 + x1) / 2,
			z: (z0 + z1) / 2,
			hx: Math.abs(x1 - x0) / 2 + 0.6,
			hz: Math.abs(z1 - z0) / 2 + 0.6,
		});
	}

	for (const [x, z] of [
		[12, -36.6],
		[16.1, -41.6],
		[-24.4, -34.9],
	] as const) {
		statics.push(snowman(x, z, rng.range(-0.5, 0.5) + Math.PI / 6));
	}

	const feet = SIDEWALK_Y - 0.03;
	for (const x of [-15, -7, 0, 3.5, 6.5, 9.5, 23]) {
		spots.push({ x, z: -35, y: feet });
	}
	for (let i = 0; i < 6; i++) {
		spots.push({
			x: 12 + (i % 3) * 1.5,
			z: -37 - Math.floor(i / 3) * 4,
			y: CELL_Y + 0.05,
		});
	}
	for (let i = 0; i < 5; i++) {
		spots.push({
			x: 19.2 + (i % 2) * 0.9,
			z: -41.2 - i * 0.7,
			y: CELL_Y + 0.05,
		});
	}
	for (let x = -17; x <= 9; x += 3.5) {
		spots.push({ x, z: LANE_Z, y: feet });
	}
	return spots;
}

function scatterPines(
	ctx: BuildContext,
	path: Polyline,
	blocked: readonly Footprint[],
): void {
	const { rng, statics } = ctx;
	const pines: { x: number; z: number }[] = [];
	for (let attempt = 0; attempt < 7000 && pines.length < 140; attempt++) {
		const x = rng.range(-23.8, 23.8);
		const z = rng.range(-80.5, -36);
		const h = terrainHeight(x, z);
		if (h >= 3) continue;
		if (blocked.some((r) => rectDistance(x, z, r) < 0.6)) continue;
		if (
			segmentDistance(x, z, LIFT_BASE.x, LIFT_BASE.z, LIFT_TOP.x, LIFT_TOP.z) <
			3
		)
			continue;
		let near = Number.POSITIVE_INFINITY;
		for (const p of path.points)
			near = Math.min(near, Math.hypot(p.x - x, p.z - z));
		if (near < 3) continue;
		if (pines.some((q) => Math.hypot(q.x - x, q.z - z) < 1.9)) continue;
		pines.push({ x, z });
		statics.push(
			place(pine(rng.range(0.8, 1.4)), { x, y: Math.max(h, CELL_Y), z }),
		);
	}
}

export function buildMountains(ctx: BuildContext): void {
	const out = ctx.statics;

	for (const p of PEAKS) out.push(peakGeometry(p));

	const path = skiPath();
	const lift = buildLift(out);
	const blocked: Footprint[] = [];
	const spots = buildVillage(ctx, blocked);
	scatterPines(ctx, path, blocked);

	createSkiers(ctx, path);
	createLift(ctx, lift.up, lift.down);
	createCrowd(ctx, spots, { count: 34, spread: 0.45 });
}
