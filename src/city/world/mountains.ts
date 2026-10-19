import {
	BoxGeometry,
	BufferGeometry,
	CatmullRomCurve3,
	Float32BufferAttribute,
	Matrix4,
	Vector3,
} from "three";
import { box, cyl, paint, paintBy, place } from "../geometry";
import { ROCK, SNOW } from "../palette";
import { house, pine } from "../prefabs";
import { mulberry32 } from "../rng";
import { Polyline } from "../sim/path";
import { createLift, createSkiers } from "../sim/ski";
import type { BuildContext } from "./context";

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

const PEAK_DEFS: readonly PeakDef[] = [
	{ x: 0, z: -60, r: 24, h: 34, radial: 12, seed: 0x9e3779 },
	{ x: -17, z: -42, r: 9, h: 14, radial: 8, seed: 0x51ed27 },
	{ x: 19, z: -44, r: 8, h: 12, radial: 8, seed: 0x2f6b1d },
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
const LIFT_BASE = { x: 16, z: -38 };
const LIFT_TOP = { x: 3, z: -57 };
const PYLONS = 5;
const PYLON_HEIGHT = 6;
const CABLE_GAP = 1.2;

const SKI_POINTS: readonly (readonly [number, number])[] = [
	[4, -56],
	[9, -52],
	[3, -47],
	[10, -42],
	[13, -37],
	[14, -34],
];
const SKI_SAMPLES = 80;

const LODGE_HALF_X = 4.3;
const LODGE_HALF_Z = 3.3;

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
		p.y = h + 0.12 + 0.28 * Math.min(1, h / 2);
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

function rectDistance(
	px: number,
	pz: number,
	cx: number,
	cz: number,
	hx: number,
	hz: number,
): number {
	return Math.hypot(
		Math.max(Math.abs(px - cx) - hx, 0),
		Math.max(Math.abs(pz - cz) - hz, 0),
	);
}

function nearPath(
	path: Polyline,
	x: number,
	z: number,
	hx = 0,
	hz = 0,
): number {
	let best = Number.POSITIVE_INFINITY;
	for (const p of path.points)
		best = Math.min(best, rectDistance(p.x, p.z, x, z, hx, hz));
	return best;
}

function lodgeFits(
	x: number,
	z: number,
	maxTerrain: number,
	path: Polyline,
): boolean {
	for (let ix = -2; ix <= 2; ix++) {
		for (let iz = -1; iz <= 1; iz++) {
			if (
				terrainHeight(x + (ix * LODGE_HALF_X) / 2, z + iz * LODGE_HALF_Z) >
				maxTerrain
			)
				return false;
		}
	}
	if (nearPath(path, x, z, LODGE_HALF_X, LODGE_HALF_Z) < 2.5) return false;
	for (let t = 0; t <= 1; t += 0.05) {
		const lx = LIFT_BASE.x + (LIFT_TOP.x - LIFT_BASE.x) * t;
		const lz = LIFT_BASE.z + (LIFT_TOP.z - LIFT_BASE.z) * t;
		if (rectDistance(lx, lz, x, z, LODGE_HALF_X, LODGE_HALF_Z) < 3)
			return false;
	}
	return true;
}

/** Closest buildable spot to (14, -37): flat ground, off the ski run and the lift. */
function lodgeSpot(path: Polyline): { x: number; z: number } {
	for (const maxTerrain of [1, 2, 3.5, 6]) {
		let best: { x: number; z: number } | null = null;
		let bestScore = Number.POSITIVE_INFINITY;
		// Front edge stays at or north of z = -34.5 (avenue sidewalk).
		for (let x = -21; x <= 21; x += 1) {
			for (let z = -34.5 - LODGE_HALF_Z - 0.3; z >= -46; z -= 0.5) {
				const score = Math.hypot(x - 14, z + 37);
				if (score >= bestScore || !lodgeFits(x, z, maxTerrain, path)) continue;
				best = { x, z };
				bestScore = score;
			}
		}
		if (best) return best;
	}
	return { x: 14, z: -38.1 };
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
		const base = terrainHeight(x, z);
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

export function buildMountains(ctx: BuildContext): void {
	const out = ctx.statics;
	const { rng } = ctx;

	for (const p of PEAKS) out.push(peakGeometry(p));

	const path = skiPath();
	const lodge = lodgeSpot(path);
	out.push(place(house(8, 6, 0x8a5a3c, 0x5f6f87), { x: lodge.x, z: lodge.z }));

	const lift = buildLift(out);

	const pines: { x: number; z: number }[] = [];
	for (let attempt = 0; attempt < 900 && pines.length < 30; attempt++) {
		const x = rng.range(-25, 25);
		const z = rng.range(-82, -35.5);
		const h = terrainHeight(x, z);
		if (h >= 3) continue;
		if (rectDistance(x, z, lodge.x, lodge.z, LODGE_HALF_X, LODGE_HALF_Z) < 2.5)
			continue;
		if (
			segmentDistance(x, z, LIFT_BASE.x, LIFT_BASE.z, LIFT_TOP.x, LIFT_TOP.z) <
			3
		)
			continue;
		if (nearPath(path, x, z) < 2.5) continue;
		if (pines.some((q) => Math.hypot(q.x - x, q.z - z) < 2.4)) continue;
		pines.push({ x, z });
		out.push(place(pine(rng.range(0.8, 1.3)), { x, y: h, z }));
	}

	createSkiers(ctx, path);
	createLift(ctx, lift.up, lift.down);
}
