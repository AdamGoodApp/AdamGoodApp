import type { BufferGeometry } from "three";
import { box, cone, cyl, GLOW, glow, merge, place, prism } from "../geometry";
import { TILE } from "../kit/atlas";
import {
	apartment,
	frontGarden,
	house,
	type Lot,
	office,
	skyscraper,
	walkup,
} from "../kit/buildings";
import { facadeAt } from "../kit/facade";
import {
	BRIGHTS,
	CARS,
	CONCRETE,
	LEAF,
	PAVEMENT,
	WATER_LIGHT,
	WHITE,
} from "../palette";
import { bench, car, lamp, palm, roundTree } from "../prefabs";
import type { Rng } from "../rng";
import { type CrowdSpot, createCrowd } from "../sim/crowd";
import type { BuildContext } from "./context";
import { SIDEWALK_Y } from "./layout";
import { type Block, OUTSKIRT_BLOCKS } from "./outskirts";
import { tintWhite } from "./tint";

/**
 * Dense city blocks for the west (continuing downtown) and east (mixed
 * residential/commercial) outskirts. Every block is ~22 m square, already
 * paved at SIDEWALK_Y + 0.02; kit buildings start at y = 0 (the slab hides
 * the base), props stand on the pavement.
 */

interface Rect {
	x0: number;
	x1: number;
	z0: number;
	z1: number;
}
type Side = "N" | "S" | "E" | "W";

const Y = SIDEWALK_Y;
/** Top of the block pavement. */
const PAD = SIDEWALK_Y + 0.02;
/** Buildable area stays 0.5 m clear of the block edge. */
const INSET = 0.5;
const TREES = [LEAF, 0x6cbf5a, 0x4f9f4c, 0x7bc063] as const;
const LAWN = 0x8fd16a;
const STONE = 0xcfc7b8;
const ASPHALT = 0x5a5e66;
const FRONT = Math.PI / 2;

const cxOf = (r: Rect) => (r.x0 + r.x1) / 2;
const czOf = (r: Rect) => (r.z0 + r.z1) / 2;
function inner(b: Block): Rect {
	return {
		x0: b.minX + INSET,
		x1: b.maxX - INSET,
		z0: b.minZ + INSET,
		z1: b.maxZ - INSET,
	};
}

function weighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
	let total = 0;
	for (const e of entries) total += e[1];
	let t = rng() * total;
	for (const e of entries) {
		t -= e[1];
		if (t <= 0) return e[0];
	}
	return (entries[entries.length - 1] as readonly [T, number])[0];
}

function put(
	ctx: BuildContext,
	geo: BufferGeometry,
	x: number,
	y: number,
	z: number,
	ry = 0,
): void {
	ctx.statics.push(place(geo, { x, y, z, ry }));
}

/** Thin slab on the block pavement; returns its top y. */
function pave(
	ctx: BuildContext,
	r: Rect,
	hex: number,
	h = 0.03,
	y = PAD,
): number {
	ctx.statics.push(box(r.x1 - r.x0, h, r.z1 - r.z0, hex, cxOf(r), y, czOf(r)));
	return y + h;
}

function treeAt(
	ctx: BuildContext,
	x: number,
	z: number,
	s: number,
	y = Y,
): void {
	put(ctx, roundTree(s, ctx.rng.pick(TREES)), x, y, z);
}

function carAt(
	ctx: BuildContext,
	x: number,
	y: number,
	z: number,
	ry: number,
): void {
	put(ctx, tintWhite(car(), ctx.rng.pick(CARS)), x, y, z, ry);
}

/**
 * Lots along one side of a rect, fronts facing the street on that side
 * (S → +Z, E → +X, N → −Z, W → −X). `depth` is measured inward from the side.
 */
function row(
	side: Side,
	r: Rect,
	depth: number,
	n: number,
	make: (lot: Lot, i: number) => void,
	span?: readonly [number, number],
	gap = 0.15,
): void {
	const horizontal = side === "N" || side === "S";
	const [a, b] = span ?? (horizontal ? [r.x0, r.x1] : [r.z0, r.z1]);
	const len = (b - a) / n;
	for (let i = 0; i < n; i++) {
		const c = a + len * (i + 0.5);
		const w = len - gap;
		if (side === "S")
			make({ x: c, z: r.z1 - depth / 2, w, d: depth, ry: 0 }, i);
		else if (side === "N")
			make({ x: c, z: r.z0 + depth / 2, w, d: depth, ry: Math.PI }, i);
		else if (side === "E")
			make({ x: r.x1 - depth / 2, z: c, w, d: depth, ry: FRONT }, i);
		else make({ x: r.x0 + depth / 2, z: c, w, d: depth, ry: -FRONT }, i);
	}
}

/** Lamp posts along the sidewalks on the given sides of a block. */
function streetLamps(
	ctx: BuildContext,
	b: Block,
	sides: readonly ("E" | "S" | "W")[],
): void {
	const parts: BufferGeometry[] = [];
	for (const side of sides) {
		if (side === "S") {
			for (let x = b.minX + 5.5; x < b.maxX; x += 11)
				parts.push(place(lamp(), { x, y: Y, z: b.maxZ + 1.1 }));
		} else {
			const lx = side === "E" ? b.maxX + 1.1 : b.minX - 1.1;
			for (let z = b.minZ + 5.5; z < b.maxZ; z += 11)
				parts.push(place(lamp(), { x: lx, y: Y, z }));
		}
	}
	if (parts.length) ctx.statics.push(merge(parts));
}

/** A row of parking bays centred on z = zc, cars along z; lines are collected for one merge. */
function bayRow(
	ctx: BuildContext,
	x0: number,
	x1: number,
	zc: number,
	y: number,
	fill: number,
	lines: BufferGeometry[],
): void {
	const { rng } = ctx;
	const pitch = 2.7;
	const n = Math.floor((x1 - x0) / pitch);
	const start = (x0 + x1) / 2 - (n * pitch) / 2;
	for (let i = 0; i <= n; i++)
		lines.push(box(0.1, 0.012, 4.6, 0xf2f2ee, start + i * pitch, y, zc));
	for (let i = 0; i < n; i++) {
		if (rng() > fill) continue;
		carAt(
			ctx,
			start + (i + 0.5) * pitch + rng.range(-0.12, 0.12),
			y,
			zc + rng.range(-0.25, 0.25),
			rng() < 0.5 ? 0 : Math.PI,
		);
	}
}

/** Asphalt lot with one or two bay rows (two when deep enough) and lamps. */
function parkingLot(ctx: BuildContext, r: Rect, fill: number): void {
	const top = pave(ctx, r, ASPHALT, 0.04);
	const lines: BufferGeometry[] = [];
	const depth = r.z1 - r.z0;
	if (depth >= 11.5) {
		bayRow(ctx, r.x0 + 0.6, r.x1 - 0.6, r.z0 + 2.4, top, fill, lines);
		bayRow(ctx, r.x0 + 0.6, r.x1 - 0.6, r.z1 - 2.4, top, fill, lines);
	} else {
		bayRow(ctx, r.x0 + 0.6, r.x1 - 0.6, czOf(r), top, fill, lines);
	}
	ctx.statics.push(merge(lines));
	for (const x of [r.x0 + 0.8, r.x1 - 0.8]) put(ctx, lamp(), x, top, czOf(r));
}

/** Posts and two rails along an axis-aligned line. */
function fenceLine(
	ctx: BuildContext,
	x0: number,
	z0: number,
	x1: number,
	z1: number,
	y: number,
	hex = 0x3c6e4f,
	h = 1.2,
): void {
	const len = Math.hypot(x1 - x0, z1 - z0);
	const n = Math.max(1, Math.round(len / 1.8));
	const parts: BufferGeometry[] = [];
	for (let i = 0; i <= n; i++)
		parts.push(
			box(
				0.1,
				h,
				0.1,
				hex,
				x0 + ((x1 - x0) * i) / n,
				y,
				z0 + ((z1 - z0) * i) / n,
			),
		);
	const mx = (x0 + x1) / 2;
	const mz = (z0 + z1) / 2;
	for (const k of [0.82, 0.45]) {
		if (Math.abs(x1 - x0) >= Math.abs(z1 - z0))
			parts.push(box(len, 0.07, 0.05, hex, mx, y + h * k, z0));
		else parts.push(box(0.05, 0.07, len, hex, x0, y + h * k, mz));
	}
	ctx.statics.push(merge(parts));
}

function kiosk(hex: number): BufferGeometry {
	return merge([
		box(1.0, 1.6, 0.9, hex, 0, 0),
		box(1.3, 0.12, 1.2, 0x444a52, 0, 1.6),
		box(1.0, 0.06, 0.5, 0xf4f4f4, 0, 1.45, 0.6),
		box(0.8, 0.5, 0.05, 0xf2eee0, 0, 0.7, 0.47),
		glow(box(0.7, 0.25, 0.06, 0xfff1a8, 0, 1.75, 0.55), GLOW.night),
	]);
}

/** Vertical blade sign hanging off a building corner. */
function neonBlade(ctx: BuildContext, x: number, z: number): void {
	put(
		ctx,
		glow(box(0.15, 1.7, 0.7, ctx.rng.pick(BRIGHTS), 0, 0), GLOW.always),
		x,
		3.3,
		z,
	);
}

// ─────────────────────────────── shared block templates ───────────────────────────────

interface RingOpts {
	lo: number;
	hi: number;
	shops: boolean;
	/** Chance a lot becomes a taller office slab instead of a walk-up. */
	tower: number;
}

/** Walk-up rows on every street side around a small courtyard. */
function ring(ctx: BuildContext, r: Rect, o: RingOpts): void {
	const { rng } = ctx;
	const rz = r.z1 - r.z0;
	const D = rz >= 20 ? 7.5 : (rz - 0.4) / 2;
	const mk = (lot: Lot) => {
		if (rng() < o.tower) office(ctx, lot, { floors: rng.int(7, 12) });
		else walkup(ctx, lot, { floors: rng.int(o.lo, o.hi), shops: o.shops });
	};
	row("S", r, D, 3, mk);
	row("N", r, D, 3, mk);
	if (rz >= 20) {
		const span = [r.z0 + D, r.z1 - D] as const;
		row("E", r, D, 1, mk, span);
		row("W", r, D, 1, mk, span);
		const yard: Rect = {
			x0: r.x0 + D,
			x1: r.x1 - D,
			z0: r.z0 + D,
			z1: r.z1 - D,
		};
		const top = pave(ctx, yard, LAWN);
		treeAt(ctx, cxOf(yard), czOf(yard) - 0.6, 0.6, top);
		put(ctx, bench(), cxOf(yard), top, yard.z1 - 0.7);
	}
	if (rng() < 0.7) neonBlade(ctx, r.x1 - 0.2, r.z1 + 0.05);
	if (rng() < 0.4) neonBlade(ctx, r.x0 + 0.2, r.z1 + 0.05);
}

/** Two office slabs side by side with a planted forecourt. */
function officePair(ctx: BuildContext, r: Rect, lo: number, hi: number): void {
	const { rng } = ctx;
	const frontD = 3.4;
	const bz1 = r.z1 - frontD;
	const w = (r.x1 - r.x0) / 2 - 0.2;
	for (let i = 0; i < 2; i++) {
		office(
			ctx,
			{
				x: r.x0 + w / 2 + i * (w + 0.4),
				z: (r.z0 + bz1) / 2,
				w,
				d: bz1 - r.z0,
				ry: 0,
			},
			{ floors: rng.int(lo, hi) },
		);
	}
	const top = pave(ctx, { ...r, z0: bz1 }, STONE);
	for (let x = r.x0 + 2.5; x < r.x1 - 1; x += 5)
		treeAt(ctx, x, r.z1 - 1.3, 0.55, top);
	put(ctx, bench(), cxOf(r), top, r.z1 - 1.0, Math.PI);
}

/** Big back building(s) with a front row of shop walk-ups. */
function mixed(ctx: BuildContext, r: Rect, west: boolean): void {
	const { rng } = ctx;
	const frontD = 8;
	const backD = r.z1 - r.z0 - frontD - 0.3;
	const w = (r.x1 - r.x0) / 2 - 0.2;
	for (let i = 0; i < 2; i++) {
		const lot: Lot = {
			x: r.x0 + w / 2 + i * (w + 0.4),
			z: r.z0 + backD / 2,
			w,
			d: backD,
			ry: 0,
		};
		if (west) office(ctx, lot, { floors: rng.int(8, 12) });
		else apartment(ctx, lot, { floors: rng.int(5, 10) });
	}
	row("S", r, frontD, 3, (lot) =>
		walkup(ctx, lot, { floors: rng.int(3, 5), shops: true }),
	);
	if (rng() < 0.6) neonBlade(ctx, r.x1 - 0.2, r.z1 + 0.05);
}

/** Pavement lot with a row of low shops on its north edge. */
function retailLot(ctx: BuildContext, r: Rect, fill: number): void {
	const { rng } = ctx;
	const bd = 7.5;
	row("S", { ...r, z1: r.z0 + bd }, bd, 3, (lot) =>
		walkup(ctx, lot, { floors: rng.int(2, 3), shops: true }),
	);
	parkingLot(ctx, { ...r, z0: r.z0 + bd + 0.3 }, fill);
}

/** Lawn with crossing paths, pond, benches and trees. */
function pocketPark(ctx: BuildContext, r: Rect): void {
	const { rng } = ctx;
	const top = pave(ctx, r, LAWN);
	const x = cxOf(r);
	const z = czOf(r);
	const rz = r.z1 - r.z0;
	const rx = r.x1 - r.x0;
	ctx.statics.push(
		box(rx, 0.02, 2, STONE, x, top, z),
		box(2, 0.02, rz, STONE, x, top, z),
		cyl(3.2, 3.2, 0.04, 16, STONE, x, top, z),
	);
	const pond = { x: x - rx * 0.27, z: z - rz * 0.27 };
	const hasPond = rng() < 0.6;
	if (hasPond) {
		ctx.statics.push(
			cyl(3.4, 3.4, 0.03, 14, 0xd8cdb8, pond.x, top, pond.z),
			cyl(3.0, 3.0, 0.05, 14, WATER_LIGHT, pond.x, top, pond.z),
		);
	}
	const ex = rx / 2 - 1.2;
	const ez = rz / 2 - 1.2;
	let planted = 0;
	for (let tries = 0; tries < 60 && planted < 12; tries++) {
		const px = x + (rng() < 0.5 ? -1 : 1) * rng.range(2.6, ex);
		const pz = z + (rng() < 0.5 ? -1 : 1) * rng.range(2.6, ez);
		if (hasPond && Math.hypot(px - pond.x, pz - pond.z) < 4.8) continue;
		treeAt(ctx, px, pz, rng.range(0.6, 0.85), top);
		planted++;
	}
	put(ctx, bench(), x, top, z + 3.9, Math.PI);
	put(ctx, bench(), x, top, z - 3.9);
	put(ctx, bench(), x + 3.9, top, z, -FRONT);
	put(ctx, bench(), x - 3.9, top, z, FRONT);
	const lamps = [-1, 1].flatMap((a) =>
		[-1, 1].map((c) =>
			place(lamp(), { x: x + a * 3.4, y: top, z: z + c * 3.4 }),
		),
	);
	ctx.statics.push(merge(lamps));
}

/** Open-deck parking garage: slabs on columns, parapets, parked cars. */
function garage(ctx: BuildContext, r: Rect): void {
	const { rng } = ctx;
	pave(ctx, r, 0x6d7178, 0.03);
	const w = Math.min(r.x1 - r.x0 - 2, 18);
	const d = Math.min(r.z1 - r.z0 - 2, 18);
	const gx = cxOf(r);
	const gz = czOf(r);
	const x0 = gx - w / 2;
	const x1 = gx + w / 2;
	const z0 = gz - d / 2;
	const z1 = gz + d / 2;
	const floors = rng.int(4, 5);
	const H = 3;
	const y0 = PAD + 0.03;
	const accent = rng.pick([0xd62828, 0x2f5f8f, 0x2f6b4f, 0xd9a03c]);
	const parts: BufferGeometry[] = [];
	// ground deck + columns
	parts.push(box(w, 0.05, d, 0x8b8f96, gx, y0 - 0.02, gz));
	for (let i = 0; i < 4; i++) {
		for (let j = 0; j < 4; j++) {
			parts.push(
				box(
					0.5,
					floors * H,
					0.5,
					0xa9a9a4,
					x0 + 0.4 + ((w - 0.8) * i) / 3,
					y0,
					z0 + 0.4 + ((d - 0.8) * j) / 3,
				),
			);
		}
	}
	for (let k = 1; k <= floors; k++) {
		const top = y0 + k * H;
		parts.push(box(w, 0.35, d, 0xb9b9b4, gx, top - 0.35, gz));
		parts.push(
			box(w, 0.9, 0.25, 0xc9c9c4, gx, top, z0 + 0.125),
			box(w, 0.9, 0.25, 0xc9c9c4, gx, top, z1 - 0.125),
			box(0.25, 0.9, d - 0.5, 0xc9c9c4, x0 + 0.125, top, gz),
			box(0.25, 0.9, d - 0.5, 0xc9c9c4, x1 - 0.125, top, gz),
		);
		parts.push(
			box(w + 0.1, 0.22, 0.12, accent, gx, top + 0.9, z1 + 0.02),
			box(0.12, 0.22, d + 0.1, accent, x1 + 0.02, top + 0.9, gz),
		);
	}
	// roof lights
	const roof = y0 + floors * H;
	for (const lx of [x0 + 1.2, x1 - 1.2])
		for (const lz of [z0 + 1.2, z1 - 1.2]) {
			parts.push(cyl(0.05, 0.06, 2.4, 6, 0x5a5d62, lx, roof, lz));
			parts.push(
				glow(box(0.4, 0.2, 0.4, 0xfff1c4, lx, roof + 2.4, lz), GLOW.night),
			);
		}
	// stair/lift core on the NE corner
	ctx.facades.push(
		facadeAt(3.4, 3.4, floors * H + 1.2, {
			x: x1 - 1.7,
			z: z0 + 1.7,
			upper: TILE.blankConcrete,
			floor: 3,
			seed: rng.int(1, 999),
		}),
	);
	parts.push(
		box(3.8, 0.3, 3.8, 0xc9c9c4, x1 - 1.7, y0 + floors * H + 1.2, z0 + 1.7),
	);
	// sign: blue plate with a white P
	parts.push(
		glow(box(1.7, 1.7, 0.18, 0x2f5f8f, gx, roof + 1.1, z1 + 0.15), GLOW.always),
		glow(
			box(0.28, 1.1, 0.06, WHITE, gx - 0.3, roof + 1.4, z1 + 0.28),
			GLOW.always,
		),
		glow(
			box(0.7, 0.28, 0.06, WHITE, gx + 0.0, roof + 2.2, z1 + 0.28),
			GLOW.always,
		),
		glow(
			box(0.28, 0.5, 0.06, WHITE, gx + 0.25, roof + 1.8, z1 + 0.28),
			GLOW.always,
		),
		glow(
			box(0.6, 0.26, 0.06, WHITE, gx - 0.0, roof + 1.6, z1 + 0.28),
			GLOW.always,
		),
	);
	ctx.statics.push(merge(parts));
	// cars on every deck, two bands each
	const lines: BufferGeometry[] = [];
	for (let k = 0; k <= floors; k++) {
		const top = k === 0 ? y0 + 0.03 : y0 + k * H;
		const fill = k === 0 ? 0.8 : 0.6;
		bayRow(ctx, x0 + 1.2, x1 - 1.2, z0 + 3.1, top, fill, lines);
		bayRow(ctx, x0 + 1.2, x1 - 1.2, z1 - 3.1, top, fill, lines);
	}
	ctx.statics.push(merge(lines));
}

/** Fountain plaza under a row of buildings; crowd spots are appended to `spots`. */
function plaza(ctx: BuildContext, r: Rect, spots: CrowdSpot[]): void {
	const { rng } = ctx;
	const bd = 8;
	const tall = rng() < 0.5;
	row("S", { ...r, z1: r.z0 + bd }, bd, tall ? 2 : 3, (lot) => {
		if (tall) office(ctx, lot, { floors: rng.int(8, 12) });
		else walkup(ctx, lot, { floors: rng.int(4, 6), shops: true });
	});
	const p: Rect = { ...r, z0: r.z0 + bd + 0.3 };
	const top = pave(ctx, p, STONE);
	const x = cxOf(p);
	const z = czOf(p);
	ctx.statics.push(
		merge([
			cyl(2.7, 2.9, 0.5, 14, STONE, x, top, z),
			cyl(2.3, 2.3, 0.12, 14, WATER_LIGHT, x, top + 0.4, z),
			cyl(0.35, 0.4, 1.3, 8, STONE, x, top + 0.4, z),
			cyl(0.12, 0.12, 2.1, 6, 0xdff3fb, x, top + 0.4, z),
		]),
	);
	put(ctx, bench(), x - 5.2, top, z, FRONT);
	put(ctx, bench(), x + 5.2, top, z, -FRONT);
	put(ctx, bench(), x, top, z + 4.3, Math.PI);
	for (const sx of [-1, 1])
		for (const sz of [-1, 1]) {
			treeAt(
				ctx,
				sx < 0 ? p.x0 + 1.4 : p.x1 - 1.4,
				sz < 0 ? p.z0 + 1.4 : p.z1 - 1.4,
				0.65,
				top,
			);
			put(ctx, lamp(), x + sx * 7.4, top, z + sz * 3.6);
		}
	put(ctx, kiosk(rng.pick(BRIGHTS)), p.x1 - 3.2, top, p.z0 + 1.2);
	for (let i = 0; i < 9; i++) {
		const a = (i / 9) * Math.PI * 2;
		spots.push({
			x: x + Math.cos(a) * 3.9,
			z: z + Math.sin(a) * 3.9,
			y: top,
			ry: a + Math.PI,
		});
	}
	spots.push(
		{ x: x - 5.2 + 0.8, z, y: top },
		{ x: x + 5.2 - 0.8, z, y: top },
		{ x: p.x1 - 3.2, z: p.z0 + 2.6, y: top },
		{ x: p.x1 - 3.8, z: p.z0 + 2.8, y: top },
	);
}

// ─────────────────────────────────── west specifics ───────────────────────────────────

/** Open water test promenade/marina share: south coast at z ≈ 25. */
const SEAWALL_Z = 25.25;

/** Waterfront block: set-back buildings, wide promenade with railing, benches, palms, cafes. */
function coastBlock(
	ctx: BuildContext,
	b: Block,
	r: Rect,
	spots: CrowdSpot[],
): void {
	const { rng } = ctx;
	const bd = 10;
	row("S", { ...r, z1: r.z0 + bd }, bd, 3, (lot) => {
		const k = rng();
		if (k < 0.2) apartment(ctx, lot, { floors: rng.int(6, 10) });
		else if (k < 0.35) office(ctx, lot, { floors: rng.int(6, 9) });
		else walkup(ctx, lot, { floors: rng.int(3, 6), shops: true });
	});
	const zEdge = b.maxZ + 1.45;
	const p: Rect = { x0: b.minX, x1: b.maxX, z0: r.z0 + bd + 0.3, z1: zEdge };
	const top = pave(ctx, p, 0xd8cdb8, 0.05, SIDEWALK_Y);
	const wallLen = b.maxX - b.minX + 3;
	ctx.statics.push(
		box(wallLen, 0.75, 0.5, CONCRETE, cxOf(p), -0.75, SEAWALL_Z),
		box(wallLen, 0.08, 0.7, 0xe2dccd, cxOf(p), top - 0.08, SEAWALL_Z),
	);
	// railing along the sea edge
	const rail: BufferGeometry[] = [];
	const rz = SEAWALL_Z + 0.05;
	for (let x = b.minX + 0.5; x <= b.maxX - 0.4; x += 2)
		rail.push(box(0.08, 1.0, 0.08, 0x3d4a57, x, top, rz));
	rail.push(
		box(b.maxX - b.minX - 1, 0.06, 0.06, 0x3d4a57, cxOf(p), top + 1.0, rz),
		box(b.maxX - b.minX - 1, 0.04, 0.04, 0x3d4a57, cxOf(p), top + 0.5, rz),
	);
	ctx.statics.push(merge(rail));
	// trees by the buildings, palms mid-promenade, benches facing the sea, lamps by the rail
	for (let x = b.minX + 2.5; x < b.maxX - 1; x += 5)
		treeAt(ctx, x, p.z0 + 1.1, 0.55, top);
	for (let x = b.minX + 3; x < b.maxX - 1; x += 8)
		put(ctx, place(palm(), { sx: 0.9, sy: 0.9, sz: 0.9 }), x, top, zEdge - 5.6);
	for (let x = b.minX + 6; x < b.maxX - 2; x += 8) {
		put(ctx, bench(), x, top, zEdge - 2.0);
		spots.push({ x: x + 0.3, z: zEdge - 1.5, y: top, ry: 0 });
	}
	const lamps: BufferGeometry[] = [];
	for (let x = b.minX + 2; x < b.maxX - 1; x += 8)
		lamps.push(place(lamp(), { x, y: top, z: zEdge - 1.2 }));
	ctx.statics.push(merge(lamps));
	// a café: counter with awning, tables and umbrellas
	const cx = cxOf(p) + rng.range(-4, 4);
	const cz = p.z0 + 4.2;
	const col = rng.pick(BRIGHTS);
	const cafe: BufferGeometry[] = [
		box(3.4, 1.1, 1.3, 0xd9c7a3, cx, top, cz),
		box(3.8, 0.1, 1.9, col, cx, top + 2.4, cz + 0.2),
		glow(box(2.2, 0.35, 0.06, 0xfff1a8, cx, top + 1.2, cz + 0.68), GLOW.always),
	];
	for (const px of [-1.7, 1.7])
		cafe.push(box(0.1, 2.4, 0.1, 0x555555, cx + px, top, cz + 1.0));
	for (const tx of [-2.4, 0, 2.4]) {
		const x = cx + tx;
		const z = cz + 3.2;
		cafe.push(
			cyl(0.5, 0.5, 0.06, 8, WHITE, x, top + 0.72, z),
			cyl(0.05, 0.05, 0.72, 6, 0x555555, x, top, z),
			cyl(0.03, 0.03, 1.9, 6, 0x777777, x, top, z),
			cone(1.3, 0.55, 8, rng.pick(BRIGHTS), x, top + 1.85, z),
		);
		spots.push({ x: x + 0.9, z: z + 0.2, y: top });
	}
	ctx.statics.push(merge(cafe));
}

function yacht(rng: Rng): BufferGeometry {
	const hull = rng.pick([0xf6f6f6, 0x2e5c8a, 0xc8281e, 0xe8e2d0, 0x2b2b2b]);
	const parts: BufferGeometry[] = [
		box(2.2, 0.9, 6.4, hull, 0, -0.55, 0),
		place(box(1.55, 0.9, 1.55, hull), { ry: Math.PI / 4, y: -0.55, z: 3.2 }),
		box(2.3, 0.1, 6.5, 0xd9d2c0, 0, 0.35, 0),
		box(1.5, 0.55, 2.6, 0xf6f6f6, 0, 0.45, -0.7),
		box(1.52, 0.2, 2.4, 0x2b3a4a, 0, 0.7, -0.7),
	];
	if (rng() < 0.6) {
		parts.push(
			cyl(0.05, 0.07, 7.5, 6, 0x888888, 0, 1.0, 0.9),
			box(0.05, 5.4, 2.3, 0xf4f1e8, 0, 1.4, -0.4),
			box(0.06, 0.06, 2.6, 0x888888, 0, 1.6, -0.4),
		);
	} else {
		parts.push(
			box(1.3, 0.5, 1.8, 0xf6f6f6, 0, 1.0, -0.7),
			cyl(0.04, 0.04, 1.2, 6, 0x888888, 0, 1.5, -0.7),
		);
	}
	return merge(parts);
}

/** Small marina: a jetty continuing the street at `x` into the sea, with static yachts. */
function marina(ctx: BuildContext, x: number): void {
	const { rng } = ctx;
	const deck = 0.45;
	const plank = 0x9c7b55;
	const z0 = 25.5;
	const z1 = 58;
	const parts: BufferGeometry[] = [
		box(2.6, 0.2, z1 - z0, plank, x, deck - 0.2, (z0 + z1) / 2),
		box(14, 0.2, 2.4, plank, x, deck - 0.2, z1 + 1.0),
	];
	for (let z = z0 + 1.5; z <= z1; z += 4) {
		for (const s of [-1, 1])
			parts.push(cyl(0.12, 0.12, 1.4, 6, 0x5b4630, x + s * 1.2, -0.95, z));
	}
	for (const px of [-6.5, 6.5])
		parts.push(cyl(0.12, 0.12, 1.4, 6, 0x5b4630, x + px, -0.95, z1 + 1.0));
	const boats: BufferGeometry[] = [];
	for (let i = 0; i < 7; i++) {
		const zf = 29 + i * 4.2;
		for (const s of [-1, 1]) {
			parts.push(box(8, 0.16, 0.7, plank, x + s * 5.3, deck - 0.16, zf));
			if (i < 6 && rng() < 0.75)
				boats.push(
					place(yacht(rng), {
						x: x + s * 4.9,
						z: zf + 2.1,
						ry: s * FRONT,
					}),
				);
		}
	}
	parts.push(
		place(lamp(), { x, y: deck, z: z0 + 1.5 }),
		place(lamp(), { x, y: deck, z: z1 + 1.0 }),
	);
	ctx.statics.push(merge(parts));
	if (boats.length) ctx.statics.push(merge(boats));
}

type WestKind =
	| "core"
	| "ring"
	| "officePair"
	| "mixed"
	| "lot"
	| "park"
	| "garage"
	| "plaza";

const WEST_SPECIAL: Record<string, WestKind> = {
	"-113,-26": "garage",
	"-173,-56": "garage",
	"-143,-26": "plaza",
	"-173,-83": "plaza",
	"-203,-26": "plaza",
	"-173,-26": "lot",
	"-233,-26": "lot",
	"-203,-113": "park",
	"-233,-56": "park",
	"-203,-83": "park",
};

/** Skyscraper (or office pair) block on pavement; height falls off with distance from downtown. */
function core(ctx: BuildContext, r: Rect, index: number): void {
	const { rng } = ctx;
	const dist = Math.hypot(cxOf(r) + 84, czOf(r) + 84);
	const h =
		Math.max(30, Math.min(60, 62 - (dist - 20) * 0.4)) + rng.range(-3, 3);
	if (index % 2 === 0) {
		const top = pave(ctx, r, STONE);
		skyscraper(
			ctx,
			{
				x: cxOf(r),
				z: czOf(r),
				w: 13.5,
				d: 13.5,
				ry: rng() < 0.5 ? 0 : FRONT,
			},
			{ height: h },
		);
		for (const sx of [-1, 1])
			for (const sz of [-1, 1])
				treeAt(
					ctx,
					cxOf(r) + sx * 8.9,
					czOf(r) + sz * 8.9,
					rng.range(0.6, 0.75),
					top,
				);
		put(ctx, bench(), cxOf(r) - 2.5, top, r.z1 - 0.9, Math.PI);
		put(ctx, bench(), cxOf(r) + 2.5, top, r.z1 - 0.9, Math.PI);
	} else {
		const f = Math.round(h / 3.2);
		officePair(ctx, r, Math.max(9, f - 3), Math.min(18, f + 2));
	}
}

export function buildOutskirtsWest(ctx: BuildContext): void {
	const { rng } = ctx;
	const spots: CrowdSpot[] = [];
	let coreIndex = 0;
	for (const b of OUTSKIRT_BLOCKS) {
		if (b.region !== "west") continue;
		const r = inner(b);
		if (b.coast === "south") {
			coastBlock(ctx, b, r, spots);
			streetLamps(ctx, b, ["E"]);
			continue;
		}
		const kind: WestKind =
			b.minZ < -50 && b.maxX > -150
				? "core"
				: (WEST_SPECIAL[`${Math.round(b.minX)},${Math.round(b.minZ)}`] ??
					weighted<WestKind>(rng, [
						["ring", 0.42],
						["mixed", 0.25],
						["officePair", 0.18],
						["lot", 0.07],
						["park", 0.08],
					]));
		switch (kind) {
			case "core":
				core(ctx, r, coreIndex++);
				break;
			case "ring":
				ring(ctx, r, { lo: 4, hi: 6, shops: true, tower: 0.25 });
				break;
			case "officePair":
				officePair(ctx, r, 6, 12);
				break;
			case "mixed":
				mixed(ctx, r, true);
				break;
			case "lot":
				retailLot(ctx, r, 0.8);
				break;
			case "park":
				pocketPark(ctx, r);
				break;
			case "garage":
				garage(ctx, r);
				break;
			case "plaza":
				plaza(ctx, r, spots);
				break;
		}
		streetLamps(ctx, b, ["E", "S"]);
	}
	marina(ctx, -177);
	createCrowd(ctx, spots, { count: 36, spread: 0.45 });
}

// ─────────────────────────────────── east specifics ───────────────────────────────────

/** Mid-rise apartments with balconies, lawn/garden or a street-side walk-up row. */
function apartmentBlock(
	ctx: BuildContext,
	r: Rect,
	lo: number,
	hi: number,
): void {
	const { rng } = ctx;
	if (rng() < 0.5) {
		// Two slabs at the back, planted front garden.
		const frontD = 5;
		const bz1 = r.z1 - frontD;
		const w = (r.x1 - r.x0) / 2 - 0.3;
		for (let i = 0; i < 2; i++) {
			apartment(
				ctx,
				{
					x: r.x0 + w / 2 + i * (w + 0.6),
					z: (r.z0 + bz1) / 2,
					w,
					d: bz1 - r.z0,
					ry: 0,
				},
				{ floors: rng.int(lo, hi) },
			);
		}
		const top = pave(ctx, { ...r, z0: bz1 }, LAWN);
		for (let x = r.x0 + 2.2; x < r.x1 - 1; x += 4.4)
			treeAt(ctx, x, r.z1 - 1.5, rng.range(0.5, 0.65), top);
		ctx.statics.push(
			box(1.6, 0.02, frontD, STONE, cxOf(r), top, bz1 + frontD / 2),
		);
	} else {
		// Slab facing the avenue (+X) with walk-ups on the far side and a garden between.
		apartment(
			ctx,
			{
				x: r.x1 - 4.5,
				z: czOf(r),
				w: r.z1 - r.z0 - 0.4,
				d: 9,
				ry: FRONT,
			},
			{ floors: rng.int(lo, hi) },
		);
		row("W", r, 6.5, 3, (lot) =>
			walkup(ctx, lot, { floors: rng.int(3, 5), shops: false }),
		);
		const garden: Rect = { x0: r.x0 + 6.8, x1: r.x1 - 9.2, z0: r.z0, z1: r.z1 };
		const top = pave(ctx, garden, LAWN);
		for (let z = r.z0 + 2.5; z < r.z1 - 1; z += 4.6)
			treeAt(ctx, cxOf(garden), z, rng.range(0.5, 0.65), top);
	}
}

/** Suburban rows of houses with front gardens. */
function houseRows(ctx: BuildContext, r: Rect): void {
	const { rng } = ctx;
	const rz = r.z1 - r.z0;
	const hd = Math.min(7, (rz - 0.3) / 2 - 3.4);
	const depth = hd + 3.4;
	const mk = (lot: Lot) => {
		const hl: Lot = { ...lot, w: Math.min(lot.w, 7.2), d: hd };
		house(ctx, hl, { floors: rng() < 0.5 ? 2 : 1, garage: false });
		frontGarden(ctx, { ...lot, d: depth });
	};
	row("S", r, depth, 3, mk);
	row("N", r, depth, 3, mk);
	const mid = { ...r, z0: r.z0 + depth, z1: r.z1 - depth };
	if (mid.z1 - mid.z0 > 0.5) pave(ctx, mid, LAWN);
}

/** Brick school: L-shaped building, fenced yard with court markings, play equipment, crowd of kids. */
function school(ctx: BuildContext, r: Rect, kids: CrowdSpot[]): void {
	const { rng } = ctx;
	const x = cxOf(r);
	const brick = {
		upper: TILE.brickRed,
		ground: TILE.brickRed,
		shops: false,
	} as const;
	row("S", { ...r, z1: r.z0 + 7 }, 7, 1, (lot) =>
		walkup(ctx, lot, { floors: 3, ...brick }),
	);
	row("E", r, 7, 1, (lot) => walkup(ctx, lot, { floors: 2, ...brick }), [
		r.z0 + 7.2,
		r.z0 + 17.2,
	]);
	// portico, bell tower, flag
	const pz = r.z0 + 7;
	ctx.statics.push(
		merge([
			box(4.4, 0.3, 2.4, 0xe9e4da, x, 3.4, pz + 1.2),
			box(0.35, 3.4, 0.35, 0xf2efe6, x - 1.9, Y, pz + 2.1),
			box(0.35, 3.4, 0.35, 0xf2efe6, x + 1.9, Y, pz + 2.1),
			glow(box(3.6, 0.7, 0.12, 0xf4f1ea, x, 4.2, pz + 0.12), GLOW.always),
			box(2.4, 3.2, 2.4, 0xa6483c, x - 7, 9.85, r.z0 + 3.5),
			cone(1.9, 2.6, 4, 0x5f6f87, 0, 0, 0)
				.rotateY(Math.PI / 4)
				.translate(x - 7, 13.05, r.z0 + 3.5),
			cyl(0.05, 0.07, 7, 6, 0xcfd2d6, x + 5.5, PAD, pz + 1.6),
			box(1.2, 0.7, 0.04, 0xd62828, x + 6.1, PAD + 6.2, pz + 1.6),
		]),
	);
	// yard
	const y1: Rect = { x0: r.x0, x1: r.x1 - 7.3, z0: r.z0 + 7.4, z1: r.z1 };
	const y2: Rect = { x0: r.x1 - 7.3, x1: r.x1, z0: r.z0 + 17.4, z1: r.z1 };
	const top = pave(ctx, y1, 0x5a5f66);
	pave(ctx, y2, 0x5a5f66);
	// basketball court
	const court: Rect = {
		x0: y1.x0 + 0.8,
		x1: y1.x0 + 6.8,
		z0: y1.z0 + 1.2,
		z1: y1.z0 + 11.2,
	};
	const ct = pave(ctx, court, 0x3f6f9f, 0.012, top);
	const lineY = ct;
	const line = (w: number, d: number, lx: number, lz: number) =>
		box(w, 0.012, d, WHITE, lx, lineY, lz);
	const ccx = cxOf(court);
	const ccz = czOf(court);
	ctx.statics.push(
		merge([
			line(6, 0.1, ccx, court.z0),
			line(6, 0.1, ccx, court.z1),
			line(0.1, 10, court.x0, ccz),
			line(0.1, 10, court.x1, ccz),
			line(6, 0.1, ccx, ccz),
			cyl(1.1, 1.1, 0.012, 16, WHITE, ccx, lineY, ccz),
			cyl(0.95, 0.95, 0.014, 16, 0x3f6f9f, ccx, lineY, ccz),
			cyl(0.06, 0.06, 3.0, 6, 0x555555, ccx, top, court.z0 - 0.3),
			box(1.2, 0.8, 0.06, WHITE, ccx, top + 2.4, court.z0 - 0.1),
			cyl(0.25, 0.25, 0.04, 8, 0xe8463c, ccx, top + 2.4, court.z0 + 0.25),
			cyl(0.06, 0.06, 3.0, 6, 0x555555, ccx, top, court.z1 + 0.3),
			box(1.2, 0.8, 0.06, WHITE, ccx, top + 2.4, court.z1 + 0.1),
			cyl(0.25, 0.25, 0.04, 8, 0xe8463c, ccx, top + 2.4, court.z1 - 0.25),
		]),
	);
	// hopscotch
	const hx = y1.x0 + 8.4;
	const hop: BufferGeometry[] = [];
	for (let i = 0; i < 5; i++)
		hop.push(
			box(
				0.8,
				0.012,
				0.8,
				BRIGHTS[i % BRIGHTS.length] as number,
				hx,
				top,
				y1.z0 + 1.5 + i * 0.9,
			),
		);
	// swings
	const sx = y1.x0 + 11.2;
	const sz = y1.z0 + 3;
	hop.push(box(3.6, 0.12, 0.12, 0xd62828, sx, top + 2.3, sz));
	for (const a of [-1.8, 1.8])
		for (const c of [-0.6, 0.6])
			hop.push(
				place(box(0.1, 2.4, 0.1, 0xd62828), {
					x: sx + a,
					y: top,
					z: sz + c,
					rz: a > 0 ? 0.12 : -0.12,
				}),
			);
	for (const a of [-0.7, 0.7]) {
		hop.push(box(0.03, 1.8, 0.03, 0x555555, sx + a, top + 0.5, sz));
		hop.push(box(0.5, 0.05, 0.3, 0x2f5f8f, sx + a, top + 0.45, sz));
	}
	// slide
	const slx = sx;
	const slz = y1.z0 + 8;
	hop.push(
		box(1.1, 0.1, 1.1, 0xf2c94c, slx, top + 1.5, slz),
		place(box(0.8, 0.06, 2.6, 0x3b7dd8), {
			x: slx,
			y: top + 1.55,
			z: slz + 1.8,
			rx: 0.58,
		}),
		box(0.1, 1.5, 0.1, 0x555555, slx - 0.5, top, slz - 0.5),
		box(0.1, 1.5, 0.1, 0x555555, slx + 0.5, top, slz - 0.5),
		box(0.1, 1.5, 0.1, 0x555555, slx - 0.5, top, slz + 0.5),
		box(0.1, 1.5, 0.1, 0x555555, slx + 0.5, top, slz + 0.5),
	);
	ctx.statics.push(merge(hop));
	// fence and trees
	fenceLine(ctx, r.x0 + 0.25, y1.z0, r.x0 + 0.25, r.z1 - 0.25, PAD);
	fenceLine(ctx, r.x0 + 0.25, r.z1 - 0.25, r.x1 - 0.25, r.z1 - 0.25, PAD);
	treeAt(ctx, r.x1 - 3.6, r.z1 - 1.6, 0.7, top);
	treeAt(ctx, y1.x1 - 1, y1.z0 + 0.9, 0.6, top);
	// kids
	for (let i = 0; i < 6; i++)
		kids.push({
			x: ccx + rng.range(-2.2, 2.2),
			z: ccz + rng.range(-4, 4),
			y: top,
		});
	for (let i = 0; i < 6; i++)
		kids.push({
			x: sx + rng.range(-2, 2),
			z: slz + rng.range(-2.5, 3),
			y: top,
		});
	for (let i = 0; i < 3; i++)
		kids.push({ x: hx + 0.6, z: y1.z0 + 2 + i, y: top });
	for (let i = 0; i < 3; i++)
		kids.push({ x: x + rng.range(-2, 2), z: pz + 3.2, y: PAD });
}

/** Stone church: nave with slate roof, bell tower and steeple, forecourt, graveyard. */
function church(ctx: BuildContext, r: Rect, spots: CrowdSpot[]): void {
	const { rng } = ctx;
	const x = cxOf(r);
	const lawn = pave(ctx, r, LAWN);
	const naveZ = r.z0 + 0.8 + 6;
	const wallH = 8.8;
	ctx.facades.push(
		facadeAt(9, 12, wallH, {
			x,
			z: naveZ,
			upper: TILE.stoneBeige,
			floor: 4.4,
			seed: rng.int(1, 999),
		}),
	);
	const towerZ = r.z0 + 13.2;
	const towerH = 17.6;
	ctx.facades.push(
		facadeAt(5.6, 5.6, towerH, {
			x,
			z: towerZ,
			upper: TILE.stoneBeige,
			ground: TILE.blankStone,
			floor: 4.4,
			seed: rng.int(1, 999),
		}),
	);
	const tf = towerZ + 2.8;
	const forecourt: Rect = { x0: r.x0, x1: r.x1, z0: tf + 0.2, z1: r.z1 };
	const ft = pave(ctx, forecourt, PAVEMENT, 0.03, lawn);
	ctx.statics.push(
		merge([
			prism(9.8, 4, 12.6, 0x5f6f87, x, wallH, naveZ),
			box(9.2, 0.3, 12.2, 0xcfc7b8, x, wallH - 0.3, naveZ),
			box(6.0, 0.3, 6.0, 0xcfc7b8, x, towerH - 0.2, towerZ),
			cone(4.1, 8.5, 4, 0x5f6f87, 0, 0, 0)
				.rotateY(Math.PI / 4)
				.translate(x, towerH + 0.1, towerZ),
			box(0.15, 1.5, 0.15, 0xe9c64a, x, towerH + 8.5, towerZ),
			box(0.8, 0.15, 0.15, 0xe9c64a, x, towerH + 9.3, towerZ),
			box(1.8, 2.8, 0.14, 0x6b3f2a, x, lawn, tf + 0.05),
			box(2.4, 0.3, 0.4, 0xcfc7b8, x, lawn + 2.9, tf + 0.1),
			glow(box(1.0, 2.2, 0.12, 0xe85d5d, x, lawn + 7.0, tf + 0.06), GLOW.night),
			glow(
				box(0.7, 1.6, 0.12, 0x4f8ef7, x - 1.6, lawn + 7.4, tf + 0.06),
				GLOW.night,
			),
			glow(
				box(0.7, 1.6, 0.12, 0xf7d64f, x + 1.6, lawn + 7.4, tf + 0.06),
				GLOW.night,
			),
			box(5, 0.2, 2.6, 0xe2dccd, x, ft, tf + 1.3),
		]),
	);
	// graveyard on the east side, trees on the west
	const stones: BufferGeometry[] = [];
	for (let i = 0; i < 3; i++)
		for (let j = 0; j < 4; j++)
			stones.push(
				box(
					0.5,
					0.9,
					0.15,
					0x9a9d9b,
					x + 6.6 + i * 1.3,
					lawn,
					r.z0 + 2 + j * 2.2,
				),
			);
	ctx.statics.push(merge(stones));
	fenceLine(
		ctx,
		x + 5.7,
		r.z0 + 0.8,
		x + 5.7,
		r.z0 + 11.5,
		lawn,
		0x2f3338,
		1.0,
	);
	for (const [tx, tz] of [
		[r.x0 + 2, r.z0 + 3],
		[r.x0 + 3, r.z0 + 9],
		[r.x1 - 1.5, r.z0 + 12.5],
		[r.x0 + 2, r.z1 - 1.5],
	] as const)
		treeAt(ctx, tx, tz, rng.range(0.7, 0.9), lawn);
	for (const lx of [x - 4, x + 4]) put(ctx, lamp(), lx, ft, r.z1 - 1.2);
	// wedding party in the forecourt
	for (let i = 0; i < 12; i++)
		spots.push({
			x: x + rng.range(-3.6, 3.6),
			z: tf + rng.range(1.5, Math.max(2, r.z1 - tf - 0.6)),
			y: ft,
			ry: rng.range(-0.5, 0.5),
		});
}

/** Supermarket with a big parking lot full of cars. */
function supermarket(ctx: BuildContext, r: Rect): void {
	const { rng } = ctx;
	const x = cxOf(r);
	const sd = 8;
	const w = r.x1 - r.x0 - 0.4;
	const sz = r.z0 + sd / 2;
	ctx.facades.push(
		facadeAt(w, sd, 5, {
			x,
			z: sz,
			upper: TILE.blankConcrete,
			floor: 5,
			seed: rng.int(1, 999),
		}),
		facadeAt(w - 2, 0.3, 3.4, {
			x,
			z: r.z0 + sd + 0.15,
			upper: TILE.storeGlass,
			floor: 3.4,
			seed: rng.int(1, 999),
		}),
	);
	const front = r.z0 + sd + 0.3;
	ctx.statics.push(
		merge([
			box(w + 0.4, 0.35, sd + 0.4, 0xd8dde2, x, 5, sz),
			box(w + 0.4, 0.5, 0.3, 0xd8dde2, x, 5.35, sz + sd / 2 + 0.1),
			box(3, 1.2, 2.5, 0x9aa3ab, x - 5, 5.35, sz - 1),
			box(2, 0.9, 2, 0x9aa3ab, x + 4, 5.35, sz),
			glow(box(9, 1.3, 0.2, 0xd62828, x - 3.5, 3.5, front + 0.35), GLOW.always),
			glow(box(6.4, 0.3, 0.22, WHITE, x - 3.5, 3.9, front + 0.36), GLOW.always),
			box(6, 0.2, 2.6, 0x444a52, x + 2.5, 3.3, front + 1.4),
			box(0.12, 3.3, 0.12, 0x444a52, x + 0.2, 0, front + 2.5),
			box(0.12, 3.3, 0.12, 0x444a52, x + 4.8, 0, front + 2.5),
		]),
	);
	const carts: BufferGeometry[] = [];
	for (let i = 0; i < 5; i++)
		carts.push(
			box(
				0.55,
				0.7,
				0.9,
				0x9aa3ab,
				r.x1 - 1.4,
				PAD + 0.04,
				front + 1 + i * 1.0,
			),
		);
	ctx.statics.push(merge(carts));
	const lot: Rect = { ...r, z0: r.z0 + sd + 0.4 };
	parkingLot(ctx, lot, 0.93);
	for (const tx of [r.x0 + 0.9, r.x1 - 0.9])
		treeAt(ctx, tx, czOf(lot), 0.55, PAD + 0.04);
}

/** Gas station with canopy lights, pumps, convenience shop and price pylon. */
function gasStation(ctx: BuildContext, r: Rect): void {
	const { rng } = ctx;
	const top = pave(ctx, r, 0x5d6169, 0.04);
	const x = cxOf(r);
	walkup(
		ctx,
		{ x, z: r.z0 + 3.2, w: 10, d: 6, ry: 0 },
		{ floors: 1, shops: true },
	);
	const zc = r.z0 + 13.2;
	const parts: BufferGeometry[] = [
		box(14.3, 0.25, 8.7, 0xd62828, x, 4.75, zc),
		box(14, 0.45, 8.4, WHITE, x, 4.9, zc),
		glow(box(12, 0.08, 0.5, 0xfff4d6, x, 4.82, zc - 1.9), GLOW.night),
		glow(box(12, 0.08, 0.5, 0xfff4d6, x, 4.82, zc + 1.9), GLOW.night),
		glow(box(14.4, 0.14, 0.1, 0xffe9a8, x, 4.78, zc + 4.35), GLOW.night),
	];
	for (const cxo of [-5.5, 5.5])
		for (const czo of [-3.4, 3.4])
			parts.push(box(0.5, 4.9, 0.5, 0xe8e8e8, x + cxo, top, zc + czo));
	for (const zi of [zc - 2, zc + 2]) {
		parts.push(box(9, 0.2, 1.0, 0xcfd2d6, x, top, zi));
		for (const px of [-2.5, 2.5]) {
			parts.push(
				box(0.55, 1.5, 0.5, 0xd62828, x + px, top + 0.2, zi),
				glow(
					box(0.35, 0.3, 0.06, 0x7fe0a0, x + px, top + 1.0, zi + 0.27),
					GLOW.night,
				),
			);
		}
	}
	// price pylon
	const px = r.x1 - 1.6;
	const pz = r.z1 - 1.3;
	parts.push(
		cyl(0.18, 0.22, 3.8, 8, 0x666a70, px, top, pz),
		box(2.0, 2.6, 0.3, WHITE, px, top + 3.8, pz),
		glow(box(2.0, 0.8, 0.32, 0xd62828, px, top + 5.6, pz), GLOW.always),
		glow(box(1.6, 0.4, 0.34, 0x58c27a, px, top + 4.9, pz), GLOW.always),
		glow(box(1.6, 0.4, 0.34, 0x58c27a, px, top + 4.2, pz), GLOW.always),
	);
	ctx.statics.push(merge(parts));
	carAt(ctx, x - 2.5, top, zc, FRONT);
	carAt(ctx, x + 3.8, top, zc + 3.65, FRONT);
	if (rng() < 0.8) carAt(ctx, x - 4, top, zc - 3.65, -FRONT);
	for (const tx of [r.x0 + 1, r.x1 - 5]) treeAt(ctx, tx, r.z1 - 0.9, 0.5, top);
	ctx.statics.push(
		box(r.x1 - r.x0 - 6, 0.5, 0.5, 0x4f9f4c, x - 1.5, top, r.z0 + 6.8),
	);
}

type EastKind =
	| "school"
	| "church"
	| "supermarket"
	| "gas"
	| "ring"
	| "apartments"
	| "officePair"
	| "mixed"
	| "lot"
	| "park"
	| "houses";

const EAST_SPECIAL: Record<string, EastKind> = {
	"121,4": "school",
	"121,34": "church",
	"151,-26": "supermarket",
	"91,34": "gas",
	"91,64": "park",
	"121,-56": "park",
	"151,34": "park",
	"181,-26": "park",
	"181,64": "park",
	"211,4": "park",
	"91,-83": "officePair",
	"91,-56": "officePair",
	"121,-83": "officePair",
};

export function buildOutskirtsEast(ctx: BuildContext): void {
	const { rng } = ctx;
	const kids: CrowdSpot[] = [];
	const wedding: CrowdSpot[] = [];
	for (const b of OUTSKIRT_BLOCKS) {
		if (b.region !== "east") continue;
		const r = inner(b);
		const dense = b.minX < 150;
		const kind: EastKind =
			EAST_SPECIAL[`${Math.round(b.minX)},${Math.round(b.minZ)}`] ??
			(dense
				? weighted<EastKind>(rng, [
						["ring", 0.38],
						["apartments", 0.28],
						["mixed", 0.2],
						["officePair", 0.08],
						["lot", 0.06],
					])
				: weighted<EastKind>(rng, [
						["houses", 0.3],
						["ring", 0.18],
						["apartments", 0.17],
						["lot", 0.12],
						["park", 0.1],
						["officePair", 0.08],
						["mixed", 0.05],
					]));
		switch (kind) {
			case "school":
				school(ctx, r, kids);
				break;
			case "church":
				church(ctx, r, wedding);
				break;
			case "supermarket":
				supermarket(ctx, r);
				break;
			case "gas":
				gasStation(ctx, r);
				break;
			case "ring":
				ring(
					ctx,
					r,
					dense
						? { lo: 3, hi: 5, shops: true, tower: 0.08 }
						: { lo: 2, hi: 4, shops: true, tower: 0 },
				);
				break;
			case "apartments":
				apartmentBlock(ctx, r, dense ? 5 : 4, dense ? 10 : 7);
				break;
			case "officePair":
				officePair(ctx, r, dense ? 5 : 3, dense ? 10 : 6);
				break;
			case "mixed":
				mixed(ctx, r, false);
				break;
			case "lot":
				retailLot(ctx, r, 0.75);
				break;
			case "park":
				pocketPark(ctx, r);
				break;
			case "houses":
				houseRows(ctx, r);
				break;
		}
		streetLamps(ctx, b, b.minX < 95 ? ["E", "S", "W"] : ["E", "S"]);
	}
	createCrowd(ctx, kids, { count: 20, spread: 0.35 });
	createCrowd(ctx, wedding, { count: 12, spread: 0.3 });
}
