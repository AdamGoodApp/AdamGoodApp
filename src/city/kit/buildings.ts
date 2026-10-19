import type { BufferGeometry } from "three";
import { box, cone, cyl, GLOW, glow, merge, place, prism } from "../geometry";
import { BRIGHTS, darken, WHITE } from "../palette";
import type { Rng } from "../rng";
import { TILE, type Tile } from "./atlas";
import { FLOOR_H, facadeBox } from "./facade";

/**
 * Parametric SimCity-style buildings. Every function builds in a local frame
 * (footprint centred on the origin, front facing +Z, ground at y = 0) and then
 * places the result on `lot` (rotated by `lot.ry` about its centre). Walls go
 * to `sink.facades` (textured, lit windows at night), everything else to
 * `sink.statics` (vertex-coloured).
 */
export interface Sink {
	readonly rng: Rng;
	readonly statics: BufferGeometry[];
	readonly facades: BufferGeometry[];
}

export interface Lot {
	x: number;
	z: number;
	/** Width along local x (the street front). */
	w: number;
	/** Depth along local z. */
	d: number;
	/** Rotation about Y; 0 = front faces +Z, π/2 = front faces +X. */
	ry?: number;
}

const ROOF = 0x6f7378;
const DARK = 0x3a3d42;
const METAL = 0x8c9196;

function emit(
	sink: Sink,
	lot: Lot,
	statics: BufferGeometry[],
	facades: BufferGeometry[],
): void {
	const t = { x: lot.x, z: lot.z, ry: lot.ry ?? 0 };
	if (statics.length) sink.statics.push(place(merge(statics), t));
	if (facades.length) sink.facades.push(...facades.map((f) => place(f, t)));
}

/** Flat roof with parapet/cornice at height h. */
function flatRoof(
	w: number,
	d: number,
	h: number,
	edge: number,
	out: BufferGeometry[],
): void {
	out.push(box(w, 0.25, d, ROOF, 0, h));
	out.push(box(w + 0.5, 0.55, d + 0.5, edge, 0, h - 0.3));
	out.push(box(w + 0.2, 0.5, 0.25, edge, 0, h + 0.2, d / 2 - 0.05));
	out.push(box(w + 0.2, 0.5, 0.25, edge, 0, h + 0.2, -d / 2 + 0.05));
	out.push(box(0.25, 0.5, d, edge, w / 2 - 0.05, h + 0.2));
	out.push(box(0.25, 0.5, d, edge, -w / 2 + 0.05, h + 0.2));
}

/** AC units, vents and a stair bulkhead scattered on a roof. */
function rooftop(
	rng: Rng,
	w: number,
	d: number,
	h: number,
	out: BufferGeometry[],
): void {
	const n = rng.int(1, 3);
	for (let i = 0; i < n; i++) {
		const x = rng.range(-w / 2 + 1.2, w / 2 - 1.2);
		const z = rng.range(-d / 2 + 1.2, d / 2 - 1.2);
		out.push(box(1.2, 0.8, 1, 0xb9bdc1, x, h + 0.25, z));
		out.push(cyl(0.3, 0.3, 0.15, 8, DARK, x, h + 1.05, z));
	}
	if (w > 6 && d > 6)
		out.push(box(2, 2.2, 2.4, darken(ROOF, 1.2), -w / 4, h + 0.25, -d / 4));
}

function waterTank(
	x: number,
	z: number,
	h: number,
	out: BufferGeometry[],
): void {
	for (const [dx, dz] of [
		[-0.6, -0.6],
		[0.6, -0.6],
		[-0.6, 0.6],
		[0.6, 0.6],
	] as const) {
		out.push(box(0.12, 1.4, 0.12, DARK, x + dx, h, z + dz));
	}
	out.push(cyl(1, 1, 1.8, 10, 0x8a6a4a, x, h + 1.4, z));
	out.push(cone(1.1, 0.7, 10, 0x5d4a3a, x, h + 3.2, z));
}

/** Zig-zag fire escape on the wall at local x = `face` (positive side). */
function fireEscape(
	face: number,
	d: number,
	floors: number,
	out: BufferGeometry[],
): void {
	const x = face + 0.45;
	for (let f = 1; f < floors; f++) {
		const y = f * FLOOR_H;
		out.push(box(0.9, 0.08, Math.min(4, d * 0.6), DARK, x, y));
		out.push(box(0.05, 0.9, Math.min(4, d * 0.6), DARK, x + 0.45, y));
		out.push(
			place(box(0.5, 0.06, FLOOR_H * 1.2, DARK), {
				x,
				y: y + FLOOR_H / 2,
				rx: f % 2 ? 0.75 : -0.75,
			}),
		);
	}
}

function awning(
	w: number,
	d: number,
	color: number,
	out: BufferGeometry[],
): void {
	out.push(
		place(box(w * 0.85, 0.12, 1.4, color), {
			y: 2.75,
			z: d / 2 + 0.65,
			rx: 0.25,
		}),
	);
}

function neonSign(
	rng: Rng,
	w: number,
	d: number,
	y: number,
	out: BufferGeometry[],
): void {
	const color = rng.pick(BRIGHTS);
	out.push(
		glow(
			box(
				Math.min(w * 0.55, 4),
				0.7,
				0.14,
				color,
				rng.range(-w / 6, w / 6),
				y,
				d / 2 + 0.08,
			),
			GLOW.always,
		),
	);
}

const BRICKS: readonly Tile[] = [
	TILE.brickRed,
	TILE.brickBrown,
	TILE.brickDark,
	TILE.brickOrange,
	TILE.stoneBeige,
	TILE.stuccoCream,
];
const STORES: readonly Tile[] = [
	TILE.storeGlass,
	TILE.storeBrick,
	TILE.storeDark,
];
const AWNINGS = [0x2f6b4f, 0xb5544a, 0x2f5f8f, 0xd9a03c, 0x6b3f7a] as const;

/** 2–6 storey brick/stone walk-up with shops, awning, neon, cornice, fire escape, water tank. */
export function walkup(
	sink: Sink,
	lot: Lot,
	o: { floors?: number; upper?: Tile; ground?: Tile; shops?: boolean } = {},
): void {
	const { rng } = sink;
	const floors = o.floors ?? rng.int(2, 6);
	const h = floors * FLOOR_H;
	const upper = o.upper ?? rng.pick(BRICKS);
	const shops = o.shops ?? true;
	const facades = [
		facadeBox(lot.w, lot.d, h, {
			upper,
			ground: shops ? (o.ground ?? rng.pick(STORES)) : upper,
			seed: rng.int(1, 9999),
		}),
	];
	const s: BufferGeometry[] = [];
	flatRoof(lot.w, lot.d, h, darken(0xc9bca8, rng.range(0.75, 1)), s);
	if (floors >= 3)
		s.push(box(lot.w + 0.3, 0.35, lot.d + 0.3, 0xd8cdbb, 0, FLOOR_H - 0.1));
	if (shops) {
		awning(lot.w, lot.d, rng.pick(AWNINGS), s);
		if (rng() < 0.6) neonSign(rng, lot.w, lot.d, 3.3, s);
	}
	if (floors >= 3 && rng() < 0.45) fireEscape(lot.w / 2, lot.d, floors, s);
	if (floors >= 4 && rng() < 0.5)
		waterTank(rng.range(-lot.w / 4, lot.w / 4), -lot.d / 5, h + 0.25, s);
	else rooftop(rng, lot.w, lot.d, h, s);
	emit(sink, lot, s, facades);
}

const OFFICE: readonly Tile[] = [
	TILE.glassBlue,
	TILE.glassTeal,
	TILE.glassDark,
	TILE.officeBand,
	TILE.officeWhite,
	TILE.stoneGrey,
];

/** Mid-rise office block: glass or banded facade, lobby, setback, roof plant. */
export function office(
	sink: Sink,
	lot: Lot,
	o: { floors?: number; upper?: Tile; setback?: boolean } = {},
): void {
	const { rng } = sink;
	const floors = o.floors ?? rng.int(6, 12);
	const upper = o.upper ?? rng.pick(OFFICE);
	const seed = rng.int(1, 9999);
	const setback = o.setback ?? (floors >= 8 && rng() < 0.5);
	const lowFloors = setback ? Math.ceil(floors * 0.65) : floors;
	const h0 = lowFloors * FLOOR_H;
	const facades = [
		facadeBox(lot.w, lot.d, h0, { upper, ground: TILE.lobby, seed }),
	];
	const s: BufferGeometry[] = [];
	const edge = 0xc3c7cb;
	flatRoof(lot.w, lot.d, h0, edge, s);
	let top = h0;
	let tw = lot.w;
	let td = lot.d;
	if (setback) {
		tw = lot.w * 0.72;
		td = lot.d * 0.72;
		top = floors * FLOOR_H;
		facades.push(
			facadeBox(tw, td, top - h0, { upper, base: h0, seed: seed + 1 }),
		);
		flatRoof(tw, td, top, edge, s);
		s.push(box(lot.w * 0.9, 0.06, lot.d * 0.9, 0x7fae6a, 0, h0 + 0.25));
	}
	rooftop(rng, tw, td, top, s);
	s.push(box(lot.w + 0.2, 0.3, 0.6, 0x2d3136, 0, 3.0, lot.d / 2 + 0.3));
	emit(sink, lot, s, facades);
}

/** Landmark tower: tiered art-deco stone or glass shaft with crown and glowing spire. */
export function skyscraper(
	sink: Sink,
	lot: Lot,
	o: { height: number; style?: "deco" | "glass" | "modern" },
): void {
	const { rng } = sink;
	const style = o.style ?? rng.pick(["deco", "glass", "modern"] as const);
	const floorsTotal = Math.max(8, Math.round(o.height / FLOOR_H));
	const seed = rng.int(1, 9999);
	const tile: Tile =
		style === "deco"
			? rng.pick([TILE.stoneGrey, TILE.stoneBeige, TILE.stoneWhite])
			: style === "glass"
				? rng.pick([TILE.glassBlue, TILE.glassTeal])
				: rng.pick([TILE.glassDark, TILE.officeBand]);
	const tiers =
		style === "deco"
			? [0.55, 0.28, 0.17]
			: style === "glass"
				? [0.8, 0.2]
				: [1];
	const shrink = style === "deco" ? 0.78 : 0.85;
	const facades: BufferGeometry[] = [];
	const s: BufferGeometry[] = [];
	let base = 0;
	let w = lot.w;
	let d = lot.d;
	let used = 0;
	tiers.forEach((frac, i) => {
		const floors =
			i === tiers.length - 1
				? floorsTotal - used
				: Math.round(floorsTotal * frac);
		used += floors;
		const h = floors * FLOOR_H;
		facades.push(
			facadeBox(w, d, h, {
				upper: tile,
				ground: i === 0 ? TILE.lobby : tile,
				base,
				seed: seed + i,
			}),
		);
		const top = base + h;
		s.push(
			box(
				w + 0.4,
				0.6,
				d + 0.4,
				style === "deco" ? 0xd8d0bf : 0xb7c0c8,
				0,
				top - 0.3,
			),
		);
		s.push(box(w, 0.25, d, ROOF, 0, top));
		base = top;
		w *= shrink;
		d *= shrink;
	});
	if (style === "deco") {
		s.push(cone(Math.min(w, d) * 0.75, 6, 4, 0xc9c1ad, 0, base));
		s.push(cyl(0.12, 0.2, 7, 6, METAL, 0, base + 5));
	} else if (style === "glass") {
		s.push(box(w * 0.7, 2.5, d * 0.7, 0x9fb0be, 0, base + 0.25));
		s.push(cyl(0.1, 0.15, 6, 6, METAL, w * 0.2, base + 2.5));
	} else {
		s.push(
			cyl(
				Math.min(w, d) * 0.3,
				Math.min(w, d) * 0.3,
				0.2,
				16,
				0xe9c64a,
				0,
				base + 0.25,
			),
		);
		s.push(
			box(w * 0.3, 2, d * 0.25, 0x9aa3ab, w * 0.25, base + 0.25, -d * 0.3),
		);
	}
	const spireTop =
		style === "deco" ? base + 12 : style === "glass" ? base + 8.5 : base + 2.5;
	s.push(glow(box(0.35, 0.35, 0.35, 0xff3b30, 0, spireTop), GLOW.always));
	emit(sink, lot, s, facades);
}

/** Residential block with balconies, ground lobby and a rooftop garden. */
export function apartment(
	sink: Sink,
	lot: Lot,
	o: { floors?: number } = {},
): void {
	const { rng } = sink;
	const floors = o.floors ?? rng.int(4, 8);
	const h = floors * FLOOR_H;
	const facades = [
		facadeBox(lot.w, lot.d, h, {
			upper: TILE.apartment,
			ground: rng() < 0.5 ? TILE.lobby : TILE.storeGlass,
			seed: rng.int(1, 9999),
			tint: rng.pick([0xffffff, 0xf3ece2, 0xe6ecf2]),
		}),
	];
	const s: BufferGeometry[] = [];
	flatRoof(lot.w, lot.d, h, 0xbfbab1, s);
	s.push(box(lot.w * 0.6, 0.3, lot.d * 0.5, 0x6fa85a, -lot.w * 0.1, h + 0.25));
	for (let i = 0; i < 3; i++) {
		s.push(
			place(cone(0.5, 1.1, 6, 0x4f8f45), {
				x: rng.range(-lot.w / 3, lot.w / 3),
				y: h + 0.5,
				z: rng.range(-lot.d / 4, lot.d / 4),
			}),
		);
	}
	rooftop(rng, lot.w, lot.d, h, s);
	emit(sink, lot, s, facades);
}

const SIDINGS: readonly Tile[] = [
	TILE.sidingWhite,
	TILE.sidingBlue,
	TILE.sidingYellow,
	TILE.houseBrick,
	TILE.stuccoCream,
];
const HOUSE_ROOFS = [0x5a4a42, 0x7a3b30, 0x3f4a5a, 0x6b6f75, 0x8a5a3c] as const;

/** Suburban house: siding/brick walls, gable or hip roof, porch, chimney, optional garage. */
export function house(
	sink: Sink,
	lot: Lot,
	o: { floors?: number; garage?: boolean; upper?: Tile; roof?: number } = {},
): void {
	const { rng } = sink;
	const floors = o.floors ?? (rng() < 0.6 ? 2 : 1);
	const fh = 3;
	const h = floors * fh;
	const w = Math.min(lot.w, 9);
	const d = Math.min(lot.d, 8);
	const upper = o.upper ?? rng.pick(SIDINGS);
	const roof = o.roof ?? rng.pick(HOUSE_ROOFS);
	const facades = [
		facadeBox(w, d, h, { upper, floor: fh, seed: rng.int(1, 9999) }),
	];
	const s: BufferGeometry[] = [];
	if (rng() < 0.55) {
		s.push(prism(w + 0.8, 2.4, d + 0.8, roof, 0, h));
	} else {
		// Hip roof: a 4-sided cone squared up to the footprint (rotate first, then scale).
		const hip = cone(Math.SQRT2, 2.6, 4, roof).rotateY(Math.PI / 4);
		s.push(hip.scale(w / 2 + 0.4, 1, d / 2 + 0.4).translate(0, h, 0));
	}
	s.push(box(w + 0.1, 0.2, d + 0.1, 0xe9e4da, 0, h - 0.1));
	s.push(box(0.7, 2.2, 0.7, 0x8a6b5a, w * 0.28, h, -d * 0.15));
	// Porch with roof, columns, door and step.
	s.push(box(w * 0.45, 0.25, 1.6, 0xd8d2c6, -w * 0.15, 0, d / 2 + 0.8));
	s.push(box(w * 0.5, 0.15, 1.8, roof, -w * 0.15, 2.7, d / 2 + 0.8));
	for (const cx of [-w * 0.38, w * 0.08])
		s.push(box(0.15, 2.5, 0.15, WHITE, cx, 0.25, d / 2 + 1.5));
	s.push(
		box(
			1,
			2.1,
			0.08,
			rng.pick([0x7a2f2a, 0x2f4f6f, 0x2f5f3f, 0x333333]),
			-w * 0.15,
			0.25,
			d / 2 + 0.04,
		),
	);
	s.push(
		glow(
			box(0.25, 0.3, 0.1, 0xffe2a0, -w * 0.15 + 0.8, 1.9, d / 2 + 0.08),
			GLOW.night,
		),
	);
	if (o.garage ?? rng() < 0.5) {
		facades.push(
			place(
				facadeBox(3.6, 5, 3, { upper: TILE.garageWhite, floor: 3, seed: 1 }),
				{ x: w / 2 + 1.8, z: d / 2 - 2.5 },
			),
		);
		s.push(box(4, 0.3, 5.4, roof, w / 2 + 1.8, 3, d / 2 - 2.5));
	}
	emit(sink, lot, s, facades);
}

/** Small window box shrubs and a picket fence along the front of a house lot. */
export function frontGarden(sink: Sink, lot: Lot): void {
	const s: BufferGeometry[] = [];
	const fz = lot.d / 2 - 0.3;
	for (let x = -lot.w / 2 + 0.5; x <= lot.w / 2 - 0.5; x += 1) {
		if (Math.abs(x + lot.w * 0.08) < 1) continue;
		s.push(box(0.1, 0.8, 0.1, 0xf4f1ea, x, 0, fz));
	}
	s.push(box(lot.w - 1, 0.08, 0.06, 0xf4f1ea, 0, 0.6, fz));
	for (let i = 0; i < 4; i++) {
		s.push(
			place(cone(0.45, 0.8, 6, 0x4f8f45), {
				x: sink.rng.range(-lot.w / 2 + 1, lot.w / 2 - 1),
				z: fz - 1,
				y: 0,
			}),
		);
	}
	emit(sink, lot, s, []);
}
