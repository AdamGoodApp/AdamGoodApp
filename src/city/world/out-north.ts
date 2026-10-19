import { type BufferGeometry, IcosahedronGeometry, Vector3 } from "three";
import {
	box,
	cone,
	cyl,
	GLOW,
	glow,
	MAT_INSTANCED,
	merge,
	paint,
	place,
	prism,
} from "../geometry";
import { TILE, type Tile } from "../kit/atlas";
import { apartment, type Lot, office, walkup } from "../kit/buildings";
import { facadeAt } from "../kit/facade";
import { CARS, PAVEMENT, WHITE } from "../palette";
import { bench, car, roundTree, truck } from "../prefabs";
import type { Rng } from "../rng";
import { type Agent, Pool } from "../sim/agent";
import type { BuildContext } from "./context";
import { SIDEWALK_Y } from "./layout";
import { type Block, OUTSKIRT_BLOCKS } from "./outskirts";
import { tintWhite } from "./tint";

/** Pavement top of every block; props stand on this (kit buildings start at y = 0). */
const GY = SIDEWALK_Y + 0.02;
/** Top of an asphalt/gravel pad laid on the pavement. */
const PY = GY + 0.05;

const ASPHALT = 0x5d6065;
const FENCE = 0x8c9196;
const ROOF_GREY = 0x6f7378;
const CONTAINERS = [
	0xc8281e, 0x2f5f8f, 0xd9a03c, 0x2f6b4f, 0x8a5a3c, 0xe8e2d0, 0xe8863c,
	0x6b3f7a,
] as const;
const TRUCK_COLOURS = [
	0xffffff, 0xe8e8e8, 0xc9d4de, 0xf0c040, 0xd9534f, 0x5b8fd9,
] as const;
const WALLS: readonly Tile[] = [
	TILE.blankBrick,
	TILE.blankConcrete,
	TILE.blankBrick,
];
const WALL_TINTS = [0xffffff, 0xe6d8cc, 0xd3d8e0] as const;

interface Rect {
	x0: number;
	x1: number;
	z0: number;
	z1: number;
}

const inset = (r: Rect, m: number): Rect => ({
	x0: r.x0 + m,
	x1: r.x1 - m,
	z0: r.z0 + m,
	z1: r.z1 - m,
});
const wOf = (r: Rect) => r.x1 - r.x0;
const dOf = (r: Rect) => r.z1 - r.z0;
const cxOf = (r: Rect) => (r.x0 + r.x1) / 2;
const czOf = (r: Rect) => (r.z0 + r.z1) / 2;

interface SmokeSource {
	x: number;
	y: number;
	z: number;
	r: number;
	steam: boolean;
}

interface TrainTrack {
	z: number;
	x0: number;
	x1: number;
}

interface Env {
	readonly ctx: BuildContext;
	readonly rng: Rng;
	readonly smoke: SmokeSource[];
	train: TrainTrack | null;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function pad(env: Env, r: Rect, hex: number): void {
	env.ctx.statics.push(box(wOf(r), 0.05, dOf(r), hex, cxOf(r), GY, czOf(r)));
}

/** Chain-link style fence round `r` with a 6 m gate gap in the south (+Z) side. */
function fence(env: Env, r: Rect): void {
	const s = env.ctx.statics;
	const f = inset(r, 0.3);
	const run = (ax: number, az: number, bx: number, bz: number) => {
		const len = Math.hypot(bx - ax, bz - az);
		if (len < 0.5) return;
		const alongX = az === bz;
		const mx = (ax + bx) / 2;
		const mz = (az + bz) / 2;
		const rw = alongX ? len : 0.06;
		const rd = alongX ? 0.06 : len;
		s.push(box(rw, 0.07, rd, FENCE, mx, GY + 0.5, mz));
		s.push(box(rw, 0.07, rd, FENCE, mx, GY + 1.4, mz));
		const n = Math.max(1, Math.round(len / 4));
		for (let i = 0; i <= n; i++) {
			const t = i / n;
			s.push(
				box(0.14, 1.6, 0.14, FENCE, ax + (bx - ax) * t, GY, az + (bz - az) * t),
			);
		}
	};
	const cx = cxOf(f);
	run(f.x0, f.z0, f.x1, f.z0);
	run(f.x0, f.z0, f.x0, f.z1);
	run(f.x1, f.z0, f.x1, f.z1);
	run(f.x0, f.z1, cx - 3, f.z1);
	run(cx + 3, f.z1, f.x1, f.z1);
}

/** Tall tapered stack with red/white bands and a glowing red tip; returns its top y. */
function stack(
	env: Env,
	x: number,
	z: number,
	h: number,
	r: number,
	smoke: boolean,
): void {
	const s = env.ctx.statics;
	const segs = 7;
	const segH = h / segs;
	const y0 = PY;
	s.push(cyl(r * 1.35, r * 1.45, 1.2, 10, 0x8c9196, x, y0, z));
	for (let i = 0; i < segs; i++) {
		const rb = r * (1 - (0.3 * i) / segs);
		const rt = r * (1 - (0.3 * (i + 1)) / segs);
		const hex = i % 2 === 1 ? 0xd62828 : 0xf2f2f2;
		s.push(cyl(rt, rb, segH, 10, hex, x, y0 + 1.2 + i * segH, z));
	}
	const top = y0 + 1.2 + h;
	const rTop = r * 0.7;
	s.push(cyl(rTop * 1.15, rTop * 1.15, 0.35, 10, 0x3a3d42, x, top, z));
	s.push(glow(box(0.5, 0.5, 0.5, 0xff2a1a, x, top + 0.35, z), GLOW.always));
	if (smoke)
		env.smoke.push({ x, y: top + 0.4, z, r: rTop * 1.1, steam: false });
}

function roofClutter(env: Env, r: Rect, y: number): void {
	const { rng } = env;
	const s = env.ctx.statics;
	for (let i = 0; i < 2; i++) {
		s.push(
			box(
				1.6,
				0.9,
				1.2,
				0x9aa0a6,
				rng.range(r.x0 + 2, r.x1 - 2),
				y,
				rng.range(r.z0 + 2, r.z1 - 2),
			),
		);
	}
}

function parkedTruck(env: Env, x: number, z: number, ry: number): void {
	env.ctx.statics.push(
		place(tintWhite(truck(), env.rng.pick(TRUCK_COLOURS)), { x, y: PY, z, ry }),
	);
}

// ---------------------------------------------------------------------------
// Industrial blocks
// ---------------------------------------------------------------------------

/** Brick hall with a sawtooth roof, office annex, yard truck and a banded smokestack. */
function factory(env: Env, r: Rect): void {
	const { ctx, rng } = env;
	const ir = inset(r, 1.4);
	const w = wOf(ir);
	const d = dOf(ir);
	pad(env, r, ASPHALT);
	fence(env, r);

	const hallD = Math.min(d * 0.5, 10);
	const hallW = w - 4;
	const hallH = 8;
	const hx = ir.x0 + hallW / 2;
	const hz = ir.z0 + hallD / 2;
	ctx.facades.push(
		facadeAt(hallW, hallD, hallH, {
			upper: rng.pick(WALLS),
			tint: rng.pick(WALL_TINTS),
			floor: 4,
			seed: rng.int(1, 9999),
			x: hx,
			z: hz,
		}),
	);
	ctx.statics.push(
		box(hallW + 0.3, 0.4, hallD + 0.3, ROOF_GREY, hx, hallH, hz),
	);
	const teeth = Math.max(2, Math.round(hallW / 4.5));
	const roof = rng.pick([0x8c9196, 0xb5544a, 0x7d8b99] as const);
	for (let i = 0; i < teeth; i++) {
		ctx.statics.push(
			prism(
				hallW / teeth,
				2.0,
				hallD - 0.4,
				roof,
				ir.x0 + ((i + 0.5) * hallW) / teeth,
				hallH + 0.4,
				hz,
			),
		);
	}
	stack(env, ir.x1 - 1.6, ir.z0 + 1.8, rng.range(26, 36), 1.2, true);
	// Chimney-side boiler shed.
	ctx.statics.push(box(2.6, 4, 2.6, 0x9a968e, ir.x1 - 1.6, PY, ir.z0 + 5.4));

	// Office annex at the front.
	const annexH = 6.4;
	const ax = ir.x0 + 3.6;
	const az = ir.z0 + hallD + 2.6;
	ctx.facades.push(
		facadeAt(7.2, 5, annexH, {
			upper: TILE.officeBand,
			ground: TILE.lobby,
			seed: rng.int(1, 9999),
			x: ax,
			z: az,
		}),
	);
	ctx.statics.push(box(7.6, 0.4, 5.4, ROOF_GREY, ax, annexH, az));
	roofClutter(
		env,
		{ x0: ax - 3, x1: ax + 3, z0: az - 2, z1: az + 2 },
		annexH + 0.4,
	);

	// Yard: delivery truck, crates, drums.
	parkedTruck(env, ir.x1 - 5.6, ir.z1 - 1.8, Math.PI / 2);
	for (let i = 0; i < 3; i++) {
		ctx.statics.push(
			box(1.3, 1.2, 1.3, 0x9c7b55, ir.x0 + 8.6 + i * 1.5, PY, ir.z1 - 1.5),
		);
	}
	ctx.statics.push(
		cyl(0.45, 0.45, 1.0, 8, 0x2f5f8f, ir.x0 + 4.4, PY, ir.z1 - 1.2),
	);
	ctx.statics.push(
		cyl(0.45, 0.45, 1.0, 8, 0xc8281e, ir.x0 + 5.5, PY, ir.z1 - 1.2),
	);
}

/** Warehouse with roll-up doors, a raised loading dock and trucks backed against it. */
function warehouse(env: Env, r: Rect): void {
	const { ctx, rng } = env;
	const ir = inset(r, 1.2);
	const w = wOf(ir);
	const d = dOf(ir);
	pad(env, r, ASPHALT);
	fence(env, r);
	const hallD = Math.max(7, Math.min(8, d * 0.4));
	const hallH = 8;
	const hz = ir.z0 + hallD / 2;
	ctx.facades.push(
		facadeAt(w, hallD, hallH, {
			upper: rng.pick([
				TILE.blankConcrete,
				TILE.blankConcrete,
				TILE.blankBrick,
			]),
			ground: TILE.garageWhite,
			tint: rng.pick(WALL_TINTS),
			floor: 4,
			seed: rng.int(1, 9999),
			x: cxOf(ir),
			z: hz,
		}),
	);
	ctx.statics.push(
		box(w + 0.3, 0.4, hallD + 0.3, ROOF_GREY, cxOf(ir), hallH, hz),
	);
	ctx.statics.push(
		prism(
			w,
			1.4,
			hallD,
			rng.pick([0x9fa3a8, 0x8c9196, 0xb8bcc2] as const),
			cxOf(ir),
			hallH + 0.4,
			hz,
		),
	);
	roofClutter(
		env,
		{ x0: ir.x0, x1: ir.x1, z0: ir.z0, z1: ir.z0 + hallD },
		hallH + 0.4,
	);
	// Loading dock platform with bumpers.
	const dockZ = ir.z0 + hallD + 1.1;
	ctx.statics.push(box(w * 0.92, 1.1, 2.2, 0xb9b5ac, cxOf(ir), PY, dockZ));
	const bays = Math.max(2, Math.floor(w / 3.8));
	for (let i = 0; i < bays; i++) {
		const bx = ir.x0 + ((i + 0.5) * w) / bays;
		ctx.statics.push(box(0.9, 0.5, 0.2, 0x2b2b2b, bx, PY + 0.3, dockZ + 1.15));
		const tz = dockZ + 1.1 + 4.6;
		if (tz + 4.4 <= ir.z1 && rng() < 0.7) parkedTruck(env, bx, tz, 0);
	}
}

/** Cylindrical storage tanks inside a low bund wall, with a pipe rack and pump house. */
function tanks(env: Env, r: Rect): void {
	const { ctx, rng } = env;
	const ir = inset(r, 1.2);
	pad(env, r, 0x9a9a96);
	fence(env, r);
	const cols = Math.max(1, Math.floor(wOf(ir) / 8.2));
	const rows = Math.max(1, Math.floor((dOf(ir) - 4) / 8.2));
	const bund = 0xbdb9b0;
	const bz0 = ir.z0;
	const bz1 = ir.z0 + (rows * (dOf(ir) - 4)) / rows;
	ctx.statics.push(box(wOf(ir), 0.5, 0.25, bund, cxOf(ir), PY, bz0));
	ctx.statics.push(box(wOf(ir), 0.5, 0.25, bund, cxOf(ir), PY, bz1));
	ctx.statics.push(box(0.25, 0.5, bz1 - bz0, bund, ir.x0, PY, (bz0 + bz1) / 2));
	ctx.statics.push(box(0.25, 0.5, bz1 - bz0, bund, ir.x1, PY, (bz0 + bz1) / 2));
	const shades = [0xe8eaee, 0xd8dde2, 0xc8c2b8, 0x9fb7c9] as const;
	for (let i = 0; i < cols; i++) {
		for (let j = 0; j < rows; j++) {
			const tx = ir.x0 + ((i + 0.5) * wOf(ir)) / cols;
			const tz = bz0 + ((j + 0.5) * (bz1 - bz0)) / rows;
			const rt = rng.range(2.8, 3.5);
			const h = rng.range(5, 8);
			const col = rng.pick(shades);
			ctx.statics.push(cyl(rt, rt, h, 12, col, tx, PY, tz));
			ctx.statics.push(cone(rt * 1.02, 1.3, 12, 0xb8bcc2, tx, PY + h, tz));
			ctx.statics.push(
				cyl(rt + 0.05, rt + 0.05, 0.3, 12, 0x6f7378, tx, PY + h * 0.5, tz),
			);
			ctx.statics.push(
				box(0.2, h + 0.8, 0.12, 0x444444, tx + rt * 0.7, PY, tz + rt * 0.72),
			);
		}
	}
	// Pipe rack along the front and a pump house.
	ctx.statics.push(
		box(wOf(ir) - 4, 0.3, 0.3, 0xc8281e, cxOf(ir) + 2, PY + 1.6, ir.z1 - 2.2),
	);
	for (let x = ir.x0 + 4; x < ir.x1; x += 4) {
		ctx.statics.push(box(0.2, 1.6, 0.2, 0x444444, x, PY, ir.z1 - 2.2));
	}
	ctx.statics.push(box(3.4, 2.8, 2.6, 0x8c9196, ir.x0 + 1.8, PY, ir.z1 - 1.4));
	ctx.statics.push(
		box(3.6, 0.25, 2.8, ROOF_GREY, ir.x0 + 1.8, PY + 2.8, ir.z1 - 1.4),
	);
}

/** Stacked shipping containers in aisles with a yellow gantry crane. */
function containers(env: Env, r: Rect): void {
	const { ctx, rng } = env;
	const ir = inset(r, 1.0);
	pad(env, r, 0x55585d);
	fence(env, r);
	const bayLen = 6.6;
	const bays = Math.max(1, Math.floor(wOf(ir) / bayLen));
	const x0 = cxOf(ir) - (bays * bayLen) / 2 + bayLen / 2;
	let z = ir.z0 + 1.5;
	let row = 0;
	const aisleZ: number[] = [];
	while (z < ir.z1 - 1.3) {
		if (row % 3 === 2) {
			aisleZ.push(z + 0.2);
			z += 3.2;
			row++;
			continue;
		}
		for (let b = 0; b < bays; b++) {
			if (rng() < 0.12) continue;
			const levels = rng.int(1, 3);
			const x = x0 + b * bayLen;
			const col = rng.pick(CONTAINERS);
			for (let k = 0; k < levels; k++) {
				const c = k === 0 || rng() < 0.6 ? col : rng.pick(CONTAINERS);
				ctx.statics.push(box(6.0, 2.5, 2.4, c, x, PY + k * 2.55, z));
				ctx.statics.push(
					box(6.05, 0.08, 2.45, 0x2b2b2b, x, PY + k * 2.55 + 2.5, z),
				);
			}
		}
		z += 2.8;
		row++;
	}
	// Gantry crane straddling the yard, running along x.
	const gz = ir.z0 + 0.4;
	const beamY = PY + 9.2;
	const yellow = 0xe8b83c;
	for (const lx of [ir.x0 + 0.3, ir.x1 - 0.3]) {
		ctx.statics.push(box(0.5, 9.2, 0.5, yellow, lx, PY, gz));
	}
	ctx.statics.push(box(wOf(ir), 0.6, 0.9, yellow, cxOf(ir), beamY, gz));
	ctx.statics.push(
		box(1.8, 0.8, 1.2, 0x3a3d42, cxOf(ir) + rng.range(-4, 4), beamY - 0.7, gz),
	);
}

/** Truck depot: garage building at the back, a line of parked trucks in front. */
function depot(env: Env, r: Rect): void {
	const { ctx, rng } = env;
	const ir = inset(r, 1.2);
	const w = wOf(ir);
	pad(env, r, ASPHALT);
	fence(env, r);
	const gd = 7;
	const gh = 4.8;
	ctx.facades.push(
		facadeAt(w - 1, gd, gh, {
			upper: TILE.garageRed,
			seed: rng.int(1, 9999),
			x: cxOf(ir),
			z: ir.z0 + gd / 2,
		}),
	);
	ctx.statics.push(
		box(w - 0.6, 0.35, gd + 0.3, ROOF_GREY, cxOf(ir), gh, ir.z0 + gd / 2),
	);
	ctx.statics.push(
		box(3.4, 0.9, 0.2, 0xffffff, ir.x0 + 4, gh - 1.3, ir.z0 + gd + 0.05),
	);
	const n = Math.max(2, Math.floor(w / 3.9));
	const tz = ir.z0 + gd + 1.6 + 4.4;
	for (let i = 0; i < n; i++) {
		if (rng() < 0.18) continue;
		if (tz + 4.4 > ir.z1 + 0.6) break;
		parkedTruck(env, ir.x0 + ((i + 0.5) * w) / n, tz, 0);
	}
	// Fuel pump island.
	ctx.statics.push(box(1.0, 1.5, 0.5, 0xd62828, ir.x1 - 2, PY, ir.z1 - 1.4));
	ctx.statics.push(
		box(3.0, 0.2, 2.0, 0xf2f2f2, ir.x1 - 2, PY + 3.2, ir.z1 - 1.4),
	);
	ctx.statics.push(box(0.2, 3.2, 0.2, 0x8c9196, ir.x1 - 3.3, PY, ir.z1 - 0.6));
	ctx.statics.push(box(0.2, 3.2, 0.2, 0x8c9196, ir.x1 - 0.7, PY, ir.z1 - 0.6));
}

// ---------------------------------------------------------------------------
// Rail yard + freight train
// ---------------------------------------------------------------------------

const WAGON_LEN = 4.4;
const LOCO_LEN = 5;
const COUPLE = 0.35;
const RAIL_TOP = PY + 0.14;

function wagonGeo(): BufferGeometry {
	return merge([
		box(2.0, 0.35, WAGON_LEN, 0x3a3d42, 0, 0.45),
		box(2.5, 2.2, WAGON_LEN - 0.3, WHITE, 0, 0.8),
		box(2.6, 0.12, WAGON_LEN - 0.2, 0x666a70, 0, 3.0),
		box(1.8, 0.5, 1.2, 0x2a2c30, 0, 0.2, WAGON_LEN / 2 - 1.0),
		box(1.8, 0.5, 1.2, 0x2a2c30, 0, 0.2, -WAGON_LEN / 2 + 1.0),
	]);
}

function locoGeo(): BufferGeometry {
	const yellow = 0xd9a03c;
	return merge([
		box(2.0, 0.35, LOCO_LEN, 0x3a3d42, 0, 0.45),
		box(2.5, 2.0, LOCO_LEN - 0.3, yellow, 0, 0.8),
		box(2.5, 1.1, 2.0, yellow, 0, 2.8, 1.2),
		box(2.3, 0.6, 0.1, 0x2b3a4a, 0, 3.0, 2.25),
		box(2.52, 0.4, LOCO_LEN - 0.3, 0x3a3d42, 0, 1.4),
		glow(
			box(0.4, 0.3, 0.1, 0xfff4d6, -0.8, 1.6, LOCO_LEN / 2 - 0.1),
			GLOW.always,
		),
		glow(
			box(0.4, 0.3, 0.1, 0xfff4d6, 0.8, 1.6, LOCO_LEN / 2 - 0.1),
			GLOW.always,
		),
		box(1.8, 0.5, 1.2, 0x2a2c30, 0, 0.2, LOCO_LEN / 2 - 1.1),
		box(1.8, 0.5, 1.2, 0x2a2c30, 0, 0.2, -LOCO_LEN / 2 + 1.1),
	]);
}

/** Gravel bed with parallel tracks along x, standing wagons and a signal hut. */
function railYard(env: Env, r: Rect, withTrain: boolean): void {
	const { ctx, rng } = env;
	const ir = inset(r, 1.0);
	pad(env, r, 0x8d8a86);
	fence(env, r);
	ctx.facades.push(
		facadeAt(3.4, 2.4, 3.2, {
			upper: TILE.blankBrick,
			seed: rng.int(1, 9999),
			x: ir.x1 - 2.2,
			z: ir.z0 + 1.4,
		}),
	);
	ctx.statics.push(
		box(3.8, 0.3, 2.8, ROOF_GREY, ir.x1 - 2.2, 3.2, ir.z0 + 1.4),
	);
	const tracks = Math.max(2, Math.floor((dOf(ir) - 3.4) / 4));
	const len = wOf(ir) - 0.4;
	const cx = cxOf(ir);
	for (let t = 0; t < tracks; t++) {
		const z = ir.z0 + 3.6 + t * 4;
		for (const side of [-0.72, 0.72]) {
			ctx.statics.push(box(len, 0.1, 0.12, 0x8d9399, cx, PY + 0.06, z + side));
		}
		for (let x = ir.x0 + 0.8; x < ir.x1 - 0.4; x += 1.5) {
			ctx.statics.push(box(0.35, 0.08, 2.0, 0x6b4a33, x, PY, z));
		}
		for (const ex of [ir.x0 + 0.1, ir.x1 - 0.1]) {
			ctx.statics.push(box(0.3, 0.7, 1.8, 0xc8281e, ex, PY, z));
		}
		if (t === 0 && withTrain) {
			env.train = { z, x0: ir.x0 + 0.4, x1: ir.x1 - 0.4 };
			continue;
		}
		let x = ir.x0 + 0.6 + WAGON_LEN / 2;
		while (x + WAGON_LEN / 2 < ir.x1 - 0.5) {
			if (rng() < 0.7) {
				ctx.statics.push(
					place(tintWhite(wagonGeo(), rng.pick(CONTAINERS)), {
						x,
						y: RAIL_TOP,
						z,
						ry: Math.PI / 2,
					}),
				);
			}
			x += WAGON_LEN + COUPLE + (rng() < 0.4 ? 1.6 : 0);
		}
	}
	// Signal mast with a night lamp.
	ctx.statics.push(
		cyl(0.1, 0.12, 4, 6, 0x5a5d62, ir.x0 + 0.8, PY, ir.z1 - 0.7),
	);
	ctx.statics.push(
		glow(
			box(0.4, 0.3, 0.4, 0xff4a30, ir.x0 + 0.8, PY + 4, ir.z1 - 0.7),
			GLOW.always,
		),
	);
}

class TrainAgent implements Agent {
	private readonly pos = new Vector3();

	constructor(
		private readonly loco: Pool,
		private readonly wagons: Pool,
		private readonly track: TrainTrack,
	) {}

	update(_dt: number, t: number): void {
		const { track, wagons, loco, pos } = this;
		const span = LOCO_LEN + wagons.count * (WAGON_LEN + COUPLE);
		const minF = track.x0 + span;
		const maxF = track.x1;
		const u = 0.5 - 0.5 * Math.cos(t * 0.18);
		const front = minF + (maxF - minF) * u;
		const yaw = Math.PI / 2;
		pos.set(front - LOCO_LEN / 2, RAIL_TOP, track.z);
		loco.write(0, pos, yaw);
		let x = front - LOCO_LEN - COUPLE;
		for (let i = 0; i < wagons.count; i++) {
			pos.set(x - WAGON_LEN / 2, RAIL_TOP, track.z);
			wagons.write(i, pos, yaw);
			x -= WAGON_LEN + COUPLE;
		}
		loco.commit();
		wagons.commit();
	}
}

/** Two pools (loco + wagons) shuttling slowly back and forth on the yard's first track. */
function createTrain(env: Env): void {
	const { ctx, rng, train } = env;
	if (!train) return;
	const wagonCount = Math.max(
		1,
		Math.min(
			2,
			Math.floor((train.x1 - train.x0 - LOCO_LEN) / (WAGON_LEN + COUPLE)) - 1,
		),
	);
	const loco = new Pool(locoGeo(), MAT_INSTANCED, 1, { shadow: true });
	const wagons = new Pool(wagonGeo(), MAT_INSTANCED, wagonCount, {
		shadow: true,
	});
	for (let i = 0; i < wagonCount; i++) wagons.color(i, rng.pick(CONTAINERS));
	ctx.group.add(loco.mesh, wagons.mesh);
	const agent = new TrainAgent(loco, wagons, train);
	agent.update(0, 0);
	ctx.agents.push(agent);
}

// ---------------------------------------------------------------------------
// Power plant
// ---------------------------------------------------------------------------

/** Hyperboloid cooling tower: stacked tapering cylinders (narrow waist, flared base). */
function coolingTower(env: Env, x: number, z: number, h: number): void {
	const s = env.ctx.statics;
	const segs = 9;
	const rad = (u: number) => 3.0 + 1.6 * ((u - 0.72) / 0.72) ** 2;
	const segH = h / segs;
	for (let i = 0; i < segs; i++) {
		const hex = i === 0 ? 0xb8b3a8 : 0xd8d4cc;
		s.push(
			cyl(
				rad((i + 1) / segs),
				rad(i / segs),
				segH,
				12,
				hex,
				x,
				PY + i * segH,
				z,
			),
		);
	}
	s.push(cyl(rad(1) + 0.12, rad(1) + 0.12, 0.35, 12, 0x9a968e, x, PY + h, z));
	env.smoke.push({ x, y: PY + h + 0.3, z, r: 2.6, steam: true });
}

/** Two cooling towers, turbine hall, banded stack and a transformer yard. */
function powerPlant(env: Env, r: Rect): void {
	const { ctx, rng } = env;
	const ir = inset(r, 1.4);
	pad(env, r, 0x9a9a96);
	fence(env, r);
	const cx = cxOf(ir);
	const spread = Math.max(5.0, Math.min(5.3, wOf(ir) / 2 - 3.6));
	const towerZ = ir.z0 + 5.2;
	coolingTower(env, cx - spread, towerZ, 22);
	coolingTower(env, cx + spread, towerZ, 22);

	const hallD = 6;
	const hz = ir.z1 - hallD / 2;
	const hx0 = ir.x0 + 5;
	const hallW = ir.x1 - hx0;
	ctx.facades.push(
		facadeAt(hallW, hallD, 9, {
			upper: TILE.blankConcrete,
			floor: 4.5,
			seed: rng.int(1, 9999),
			x: hx0 + hallW / 2,
			z: hz,
		}),
	);
	ctx.statics.push(
		box(hallW + 0.3, 0.4, hallD + 0.3, ROOF_GREY, hx0 + hallW / 2, 9, hz),
	);
	ctx.statics.push(
		box(hallW * 0.5, 1.4, hallD * 0.5, 0x9aa0a6, hx0 + hallW / 2, 9.4, hz),
	);
	// Pipe bridge from the hall to the towers.
	ctx.statics.push(
		box(1.0, 1.0, 3.2, 0x9aa0a6, cx, PY + 4.5, ir.z1 - hallD - 1.4),
	);
	ctx.statics.push(box(0.7, 4.5, 0.7, 0x6f7378, cx, PY, ir.z1 - hallD - 1.4));
	stack(env, ir.x0 + 1.8, ir.z0 + 14, 34, 1.3, true);
	// Transformer yard.
	for (let i = 0; i < 3; i++) {
		ctx.statics.push(
			box(1.6, 1.8, 1.4, 0x6f7a6b, ir.x0 + 3 + i * 2.4, PY, ir.z0 + 9.8),
		);
		ctx.statics.push(
			box(
				0.12,
				0.5,
				0.12,
				0xd8d4cc,
				ir.x0 + 3 + i * 2.4,
				PY + 1.8,
				ir.z0 + 9.8,
			),
		);
	}
}

// ---------------------------------------------------------------------------
// Mixed / mid-rise blocks near the district square
// ---------------------------------------------------------------------------

function parkingRow(env: Env, x0: number, x1: number, z: number): void {
	const { ctx, rng } = env;
	ctx.statics.push(box(x1 - x0, 0.05, 6, ASPHALT, (x0 + x1) / 2, GY, z));
	for (let x = x0 + 1.4; x < x1 - 1; x += 2.5) {
		if (rng() < 0.3) continue;
		ctx.statics.push(
			place(tintWhite(car(), rng.pick(CARS)), {
				x,
				y: PY,
				z,
				ry: rng() < 0.5 ? 0 : Math.PI,
			}),
		);
	}
}

/** Office or apartment slab at the back, a row of walk-ups along the street. */
function mixedRows(env: Env, r: Rect): void {
	const { ctx, rng } = env;
	const ir = inset(r, 0.9);
	const w = wOf(ir);
	const backD = Math.min(10, dOf(ir) * 0.5);
	const back: Lot = { x: cxOf(ir), z: ir.z0 + backD / 2, w, d: backD };
	if (rng() < 0.5)
		office(ctx, back, { floors: rng.int(7, 11), setback: rng() < 0.5 });
	else apartment(ctx, back, { floors: rng.int(6, 9) });
	const frontD = dOf(ir) - backD - 0.4;
	const n = Math.max(2, Math.round(w / 6.5));
	for (let i = 0; i < n; i++) {
		walkup(
			ctx,
			{
				x: ir.x0 + ((i + 0.5) * w) / n,
				z: ir.z1 - frontD / 2,
				w: w / n - 0.15,
				d: frontD,
			},
			{ floors: rng.int(2, 5) },
		);
	}
}

/** Apartment at the back, an office front-left, a surface car park front-right. */
function mixedPark(env: Env, r: Rect): void {
	const { ctx, rng } = env;
	const ir = inset(r, 0.9);
	const w = wOf(ir);
	const backD = Math.min(10, dOf(ir) * 0.5);
	apartment(
		ctx,
		{ x: cxOf(ir), z: ir.z0 + backD / 2, w, d: backD },
		{ floors: rng.int(6, 9) },
	);
	const frontD = dOf(ir) - backD - 0.4;
	office(
		ctx,
		{ x: ir.x0 + w * 0.3, z: ir.z1 - frontD / 2, w: w * 0.6, d: frontD },
		{ floors: rng.int(4, 6) },
	);
	parkingRow(env, ir.x0 + w * 0.6 + 0.4, ir.x1, ir.z1 - 3.5);
	ctx.statics.push(
		place(roundTree(1), { x: ir.x1 - 0.8, y: GY, z: ir.z1 - 8 }),
	);
}

/** Two offices side by side with a small plaza (trees + benches) on the street. */
function mixedPlaza(env: Env, r: Rect): void {
	const { ctx, rng } = env;
	const ir = inset(r, 0.9);
	const w = wOf(ir);
	const d = dOf(ir) - 5;
	for (let i = 0; i < 2; i++) {
		office(
			ctx,
			{ x: ir.x0 + ((i + 0.5) * w) / 2, z: ir.z0 + d / 2, w: w / 2 - 0.2, d },
			{ floors: rng.int(6, 10), setback: rng() < 0.4 },
		);
	}
	ctx.statics.push(box(w, 0.05, 4.6, PAVEMENT, cxOf(ir), GY, ir.z1 - 2.3));
	for (let i = 0; i < 4; i++) {
		ctx.statics.push(
			place(roundTree(0.9), {
				x: ir.x0 + ((i + 0.5) * w) / 4,
				y: PY,
				z: ir.z1 - 1.0,
			}),
		);
	}
	for (const bx of [cxOf(ir) - 3, cxOf(ir) + 3]) {
		ctx.statics.push(place(bench(), { x: bx, y: PY, z: ir.z1 - 3.2 }));
	}
}

/** Walk-ups fronting the east street (+X), a mid-rise office at the back-left. */
function mixedEast(env: Env, r: Rect): void {
	const { ctx, rng } = env;
	const ir = inset(r, 0.9);
	const d = dOf(ir);
	const colD = 8;
	const n = Math.max(2, Math.round(d / 6.5));
	for (let i = 0; i < n; i++) {
		walkup(
			ctx,
			{
				x: ir.x1 - colD / 2,
				z: ir.z0 + ((i + 0.5) * d) / n,
				w: d / n - 0.15,
				d: colD,
				ry: Math.PI / 2,
			},
			{ floors: rng.int(2, 5) },
		);
	}
	const ow = wOf(ir) - colD - 0.4;
	office(
		ctx,
		{ x: ir.x0 + ow / 2, z: ir.z0 + 5.5, w: ow, d: 11 },
		{ floors: rng.int(6, 10) },
	);
	parkingRow(env, ir.x0, ir.x0 + ow, ir.z1 - 3.2);
}

// ---------------------------------------------------------------------------
// Block assignment
// ---------------------------------------------------------------------------

type Kind =
	| "factory"
	| "warehouse"
	| "tanks"
	| "containers"
	| "depot"
	| "rail"
	| "power"
	| "rows"
	| "park"
	| "plaza"
	| "east";

function weighted(rng: Rng, items: readonly [Kind, number][]): Kind {
	let total = 0;
	for (const [, w] of items) total += w;
	let t = rng() * total;
	for (const [k, w] of items) {
		t -= w;
		if (t <= 0) return k;
	}
	return (items[0] as [Kind, number])[0];
}

/** 0 = band next to the ring road … 4 = outermost row. */
function rowOf(b: Block): number {
	const cz = (b.minZ + b.maxZ) / 2;
	return Math.max(0, Math.min(5, Math.round((-cz - 103) / 30)));
}

function kindFor(env: Env, row: number): Kind {
	const { rng } = env;
	if (row === 0)
		return weighted(rng, [
			["rows", 4],
			["park", 2],
			["plaza", 2],
			["east", 2],
		]);
	if (row === 1)
		return weighted(rng, [
			["rows", 2],
			["park", 1],
			["east", 1],
			["warehouse", 3],
			["depot", 1],
			["plaza", 1],
		]);
	return weighted(rng, [
		["factory", 30],
		["warehouse", 20],
		["tanks", 12],
		["containers", 15],
		["depot", 9],
		["plaza", 4],
	]);
}

const BUILDERS: Record<Kind, (env: Env, r: Rect) => void> = {
	factory,
	warehouse,
	tanks,
	containers,
	depot,
	rail: (env, r) => railYard(env, r, true),
	power: powerPlant,
	rows: mixedRows,
	park: mixedPark,
	plaza: mixedPlaza,
	east: mixedEast,
};

function build(env: Env, r: Rect, kind: Kind): void {
	// Slivers can only hold a container yard.
	const sliver = Math.min(wOf(r), dOf(r)) < 14 && kind !== "rows";
	BUILDERS[sliver ? "containers" : kind](env, r);
}

// ---------------------------------------------------------------------------
// Smoke + steam
// ---------------------------------------------------------------------------

const PUFF_SMOKE = 0xb4b7bc;
const PUFF_STEAM = 0xf2f5f8;

class SmokeAgent implements Agent {
	private readonly pos = new Vector3();

	constructor(
		private readonly pool: Pool,
		private readonly sources: readonly SmokeSource[],
		private readonly perSource: number,
	) {}

	update(_dt: number, t: number): void {
		let i = 0;
		for (let k = 0; k < this.sources.length; k++) {
			const s = this.sources[k] as SmokeSource;
			const rate = s.steam ? 0.07 : 0.09;
			for (let j = 0; j < this.perSource; j++, i++) {
				const u = (t * rate + j / this.perSource + k * 0.37) % 1;
				const rise = s.steam ? 16 : 20;
				const dx = s.steam ? 5 : 9;
				this.pos.set(
					s.x + u * dx + Math.sin(u * 9 + k + j) * 0.5,
					s.y + u * rise,
					s.z + u * dx * 0.4,
				);
				const fade = u < 0.12 ? u / 0.12 : u > 0.75 ? (1 - u) / 0.25 : 1;
				this.pool.write(
					i,
					this.pos,
					u * 6 + j,
					0,
					0,
					Math.max(0.001, s.r * (0.5 + u * 2.2) * fade),
				);
			}
		}
		this.pool.commit();
	}
}

/** ONE pool of grey/white puffs rising from every stack and cooling tower and recycling. */
function createSmoke(env: Env): void {
	const { ctx, smoke } = env;
	if (smoke.length === 0) return;
	const perSource = Math.max(3, Math.round(6 * ctx.density));
	const count = smoke.length * perSource;
	const geo = paint(new IcosahedronGeometry(1, 0), WHITE);
	const pool = new Pool(geo, MAT_INSTANCED, count, { shadow: false });
	let i = 0;
	for (const s of smoke) {
		for (let j = 0; j < perSource; j++)
			pool.color(i++, s.steam ? PUFF_STEAM : PUFF_SMOKE);
	}
	ctx.group.add(pool.mesh);
	const agent = new SmokeAgent(pool, smoke, perSource);
	agent.update(0, 0);
	ctx.agents.push(agent);
}

// ---------------------------------------------------------------------------

/**
 * North outskirts (screen top-right): mid-rise offices and walk-ups next to the
 * ring road, thickening into factories, warehouses, tank farms, container and
 * rail yards, a truck depot and a power plant further north. 3 Pools max
 * (smoke/steam puffs, freight loco, freight wagons).
 */
export function buildOutskirtsNorth(ctx: BuildContext): void {
	const blocks = OUTSKIRT_BLOCKS.filter((b) => b.region === "north");
	const env: Env = { ctx, rng: ctx.rng, smoke: [], train: null };
	const meta = blocks.map((b) => ({
		b,
		row: rowOf(b),
		cx: (b.minX + b.maxX) / 2,
	}));
	const nearest = (list: typeof meta, tx: number) =>
		list.reduce<(typeof meta)[number] | null>(
			(best, m) =>
				!best || Math.abs(m.cx - tx) < Math.abs(best.cx - tx) ? m : best,
			null,
		);
	const far = meta.filter((m) => m.row >= 2);
	const power =
		nearest(
			far.filter((m) => m.row >= 3),
			60,
		) ?? nearest(far, 60);
	const rail =
		nearest(
			far.filter((m) => m.row === 2 && m !== power),
			-60,
		) ??
		nearest(
			far.filter((m) => m !== power),
			-60,
		);

	for (const m of meta) {
		const r: Rect = {
			x0: m.b.minX + 0.5,
			x1: m.b.maxX - 0.5,
			z0: m.b.minZ + 0.5,
			z1: m.b.maxZ - 0.5,
		};
		const kind: Kind =
			m === power ? "power" : m === rail ? "rail" : kindFor(env, m.row);
		// Cap smokestacks at 5 factory stacks; extra factories become warehouses.
		const stacks = env.smoke.filter((s) => !s.steam).length;
		build(env, r, kind === "factory" && stacks >= 5 ? "warehouse" : kind);
	}
	createSmoke(env);
	createTrain(env);
}
