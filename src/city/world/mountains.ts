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
import { bench, car, pine } from "../prefabs";
import { mulberry32 } from "../rng";
import { type CrowdSpot, createCrowd } from "../sim/crowd";
import { Polyline } from "../sim/path";
import { createGondola, createLift, createSkiers } from "../sim/ski";
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

// --- Gondola + summit observation deck ---------------------------------------

const GONDOLA_BASE = { x: -22.5, z: -50.6 };
/** Apex of the western peak; the deck sits just above it. */
const GONDOLA_TOP = { x: -16.5, z: -58 };
const DECK_Y = 13.4;
const DECK_SIZE = 5.6;
const BASE_CABLE_Y = CELL_Y + 4.9;
const TOP_CABLE_Y = DECK_Y + 2.8;
const GONDOLA_GAP = 1.4;
const GONDOLA_PYLONS = [0.36, 0.7] as const;
const DECK_RAIL = 0xd9d4c8;

function buildGondola(
	ctx: BuildContext,
	blocked: Footprint[],
	spots: CrowdSpot[],
): { up: Polyline; down: Polyline } {
	const { statics } = ctx;
	const { x: bx, z: bz } = GONDOLA_BASE;
	const { x: tx, z: tz } = GONDOLA_TOP;
	const dx = tx - bx;
	const dz = tz - bz;
	const len = Math.hypot(dx, dz);
	const side = new Vector3(dz / len, 0, -dx / len);
	const armYaw = Math.atan2(-side.z, side.x);
	const up: Vector3[] = [];
	const down: Vector3[] = [];
	for (const t of [0, ...GONDOLA_PYLONS, 1]) {
		const x = bx + dx * t;
		const z = bz + dz * t;
		const y = BASE_CABLE_Y + (TOP_CABLE_Y - BASE_CABLE_Y) * t;
		up.push(
			new Vector3(
				x + (side.x * GONDOLA_GAP) / 2,
				y,
				z + (side.z * GONDOLA_GAP) / 2,
			),
		);
		down.push(
			new Vector3(
				x - (side.x * GONDOLA_GAP) / 2,
				y,
				z - (side.z * GONDOLA_GAP) / 2,
			),
		);
		if (t === 0 || t === 1) continue;
		const base = Math.max(CELL_Y, terrainHeight(x, z));
		const top = y - 0.15;
		statics.push(
			cyl(0.22, 0.34, top - base, 6, 0x555555, x, base, z),
			box(GONDOLA_GAP + 0.9, 0.12, 0.16, 0x555555, x, top - 0.05, z, armYaw),
		);
	}
	for (let i = 0; i < up.length - 1; i++) {
		statics.push(beam(up[i] as Vector3, up[i + 1] as Vector3, 0.07, 0x333333));
		statics.push(
			beam(down[i] as Vector3, down[i + 1] as Vector3, 0.07, 0x333333),
		);
	}

	// Valley station with a loading platform on its camera-facing side.
	const y = CELL_Y;
	statics.push(
		box(3.4, 4.2, 3.0, 0x7d858c, bx, y, bz),
		box(3.9, 0.3, 3.5, 0xe8463c, bx, y + 4.2, bz),
		box(3.7, 0.12, 3.3, SNOW, bx, y + 4.5, bz),
		box(1.4, 0.6, 1.4, 0x444a52, bx, y + 4.62, bz),
		glow(box(2.4, 0.4, 0.1, 0x4cf0ff, bx, y + 2.6, bz + 1.55), GLOW.always),
		box(1.1, 2.0, 0.08, 0x2b3a4a, bx - 0.7, y, bz + 1.54),
		box(3.4, 0.3, 2.2, PAVED, bx, y, bz + 2.5),
	);
	blocked.push({ x: bx, z: bz + 0.6, hx: 2.1, hz: 3.1 });
	for (const [sx, sz] of [
		[-0.8, 2.4],
		[0.4, 2.7],
		[1.1, 2.2],
	] as const) {
		spots.push({ x: bx + sx, z: bz + sz, y: y + 0.3 });
	}

	// Summit observation deck on stilts over the apex, with the top station on it.
	const half = DECK_SIZE / 2;
	for (const sx of [-1, 1]) {
		for (const sz of [-1, 1]) {
			const lx = tx + sx * (half - 0.3);
			const lz = tz + sz * (half - 0.3);
			const base = Math.max(CELL_Y, terrainHeight(lx, lz)) - 0.4;
			statics.push(
				cyl(0.22, 0.3, DECK_Y - 0.3 - base, 6, 0x5a3a22, lx, base, lz),
			);
		}
	}
	statics.push(
		box(DECK_SIZE, 0.3, DECK_SIZE, 0x8a5a3c, tx, DECK_Y - 0.3, tz),
		box(2.8, 2.8, 2.6, 0x6d7f93, tx, DECK_Y, tz),
		box(3.2, 0.25, 3.0, 0xe8463c, tx, DECK_Y + 2.8, tz),
		box(3.0, 0.12, 2.8, SNOW, tx, DECK_Y + 3.05, tz),
		box(1.2, 0.5, 1.2, 0x444a52, tx, DECK_Y + 3.17, tz),
		glow(
			box(1.6, 0.35, 0.08, 0x4cf0ff, tx, DECK_Y + 1.6, tz + 1.34),
			GLOW.always,
		),
	);
	const edge = half - 0.12;
	for (const s of [-1, 1]) {
		statics.push(
			box(DECK_SIZE, 0.07, 0.07, DECK_RAIL, tx, DECK_Y + 0.95, tz + s * edge),
			box(0.07, 0.07, DECK_SIZE, DECK_RAIL, tx + s * edge, DECK_Y + 0.95, tz),
		);
		for (let k = 0; k < 5; k++) {
			const p = -edge + (k * 2 * edge) / 4;
			statics.push(
				box(0.07, 1.0, 0.07, DECK_RAIL, tx + p, DECK_Y, tz + s * edge),
				box(0.07, 1.0, 0.07, DECK_RAIL, tx + s * edge, DECK_Y, tz + p),
			);
		}
	}
	statics.push(
		cyl(0.05, 0.05, 3.6, 6, 0xdddddd, tx - 2.2, DECK_Y, tz - 2.2),
		box(0.9, 0.55, 0.04, 0xe8463c, tx - 1.7, DECK_Y + 2.9, tz - 2.2),
		place(bench(), { x: tx + 2.05, y: DECK_Y, z: tz - 0.4, ry: Math.PI / 2 }),
		place(bench(), { x: tx + 0.5, y: DECK_Y, z: tz + 2.05, ry: 0 }),
	);
	for (const [sx, sz] of [
		[1.9, 1.9],
		[-1.9, 1.9],
	] as const) {
		statics.push(
			cyl(0.05, 0.07, 1.2, 6, 0x444444, tx + sx, DECK_Y, tz + sz),
			place(box(0.18, 0.18, 0.7, 0xe8463c, 0, -0.09, 0), {
				rx: -0.25,
				x: tx + sx,
				y: DECK_Y + 1.3,
				z: tz + sz,
			}),
		);
	}
	for (const [sx, sz] of [
		[0.9, 1.9],
		[2.0, 0.9],
		[-0.8, 1.9],
		[1.3, -1.4],
	] as const) {
		spots.push({ x: tx + sx, z: tz + sz, y: DECK_Y + 0.02 });
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
	// Small cabins on the southern edge of the village, below the western peak.
	for (const [x, w] of [
		[-17.4, 3.6],
		[-13, 3.8],
		[-8.6, 3.6],
		[22.6, 3.6],
	] as const) {
		chalet(ctx, blocked, x, x > 0 ? -50.4 : -49.9, w, 3.2, 1);
		spots.push({
			x: x - 0.6,
			z: (x > 0 ? -50.4 : -49.9) + 2.4,
			y: CELL_Y + 0.05,
		});
	}
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
	lines: readonly (readonly [number, number, number, number])[],
): void {
	const { rng, statics } = ctx;
	const pines: { x: number; z: number }[] = [];
	const clear = (x: number, z: number, gap: number): boolean => {
		if (blocked.some((r) => rectDistance(x, z, r) < 0.6)) return false;
		if (
			lines.some(
				([ax, az, bx, bz]) => segmentDistance(x, z, ax, az, bx, bz) < 3,
			)
		)
			return false;
		let near = Number.POSITIVE_INFINITY;
		for (const p of path.points)
			near = Math.min(near, Math.hypot(p.x - x, p.z - z));
		if (near < 3) return false;
		return !pines.some((q) => Math.hypot(q.x - x, q.z - z) < gap);
	};
	// Dense forest on the valley floor, then thinner and smaller up the lower slopes.
	const passes = [
		{ cap: 175, lo: 0, hi: 3, gap: 1.75, small: 0.8, big: 1.4 },
		{ cap: 250, lo: 3, hi: 9, gap: 2.1, small: 0.6, big: 1.0 },
	] as const;
	for (const { cap, lo, hi, gap, small, big } of passes) {
		for (let attempt = 0; attempt < 9000 && pines.length < cap; attempt++) {
			const x = rng.range(-23.8, 23.8);
			const z = rng.range(-80.5, -36);
			const h = terrainHeight(x, z);
			if (h < lo || h >= hi) continue;
			if (!clear(x, z, gap)) continue;
			pines.push({ x, z });
			statics.push(
				place(pine(rng.range(small, big)), {
					x,
					y: h > 0 ? h - 0.15 : CELL_Y,
					z,
				}),
			);
		}
	}
}

/** Alternating red/blue slalom gates down the ski run, just clear of the skiers' line. */
function slalomGates(statics: BufferGeometry[], path: Polyline): void {
	const pts = path.points;
	for (let i = 8; i < pts.length - 6; i += 4) {
		const a = pts[i] as Vector3;
		const b = pts[i + 1] as Vector3;
		const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
		const tx = (b.x - a.x) / len;
		const tz = (b.z - a.z) / len;
		const hex = (i / 4) % 2 ? 0x3b7dd8 : 0xe8463c;
		for (const side of [-1, 1]) {
			const x = a.x - tz * side * 1.5;
			const z = a.z + tx * side * 1.5;
			const y = Math.max(CELL_Y, terrainHeight(x, z));
			statics.push(
				box(0.06, 1.9, 0.06, 0x333333, x, y - 0.15, z),
				box(0.7, 0.5, 0.04, hex, x, y + 1.2, z, Math.atan2(tx, tz)),
			);
		}
	}
}

/** Summit flag: a pole and a red pennant planted at a peak's apex. */
function summitFlag(statics: BufferGeometry[], p: Peak, scale: number): void {
	statics.push(
		cyl(
			0.06 * scale,
			0.07 * scale,
			3.2 * scale,
			6,
			0xdddddd,
			p.x,
			p.h - 0.2,
			p.z,
		),
		box(
			1.1 * scale,
			0.7 * scale,
			0.05 * scale,
			0xe8463c,
			p.x + 0.6 * scale,
			p.h + 2.3 * scale,
			p.z,
		),
	);
}

export function buildMountains(ctx: BuildContext): void {
	const out = ctx.statics;

	for (const p of PEAKS) out.push(peakGeometry(p));
	summitFlag(out, PEAKS[0] as Peak, 1.5);
	summitFlag(out, PEAKS[2] as Peak, 1);

	const path = skiPath();
	slalomGates(out, path);
	const lift = buildLift(out);
	const blocked: Footprint[] = [];
	const spots = buildVillage(ctx, blocked);
	const gondola = buildGondola(ctx, blocked, spots);
	scatterPines(ctx, path, blocked, [
		[LIFT_BASE.x, LIFT_BASE.z, LIFT_TOP.x, LIFT_TOP.z],
		[GONDOLA_BASE.x, GONDOLA_BASE.z, GONDOLA_TOP.x, GONDOLA_TOP.z],
	]);

	createSkiers(ctx, path);
	createLift(ctx, lift.up, lift.down);
	createGondola(ctx, gondola.up, gondola.down);
	createCrowd(ctx, spots, { count: 46, spread: 0.45 });
}
