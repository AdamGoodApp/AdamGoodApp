import {
	type BufferGeometry,
	Float32BufferAttribute,
	BufferGeometry as Geo,
	SphereGeometry,
} from "three";
import { box, cone, cyl, GLOW, glow, merge, paint, place } from "../geometry";
import { TILE, type Tile } from "../kit/atlas";
import { FLOOR_H, facadeBox } from "../kit/facade";
import type { BuildContext } from "./context";

/**
 * Civic buildings in the same local frame as the kit (footprint centred on the
 * origin, front facing +Z, ground at y = 0); `at.ry = π/2` turns the front to +X.
 */
export interface Placement {
	x: number;
	z: number;
	ry?: number;
}

const BRICK = 0xa8503f;
const TRIM = 0xf3efe4;
const STEP = 0xd7d1c2;
const TYMPANUM = 0xd9d3c3;
const GREEN_ROOF = 0x4a8f7a;
const SLATE = 0x5f6f87;
const GOLD = 0xe0b84a;
const WINDOW_GLASS = 0xa9b8c8;
const CLOCK_FACE = 0xfff2c0;
const DOOR = 0x4a3a2c;
const DARK = 0x222222;

function emit(
	ctx: BuildContext,
	at: Placement,
	statics: BufferGeometry[],
	facades: BufferGeometry[],
): void {
	const t = { x: at.x, z: at.z, ry: at.ry ?? 0 };
	ctx.statics.push(place(merge(statics), t));
	for (const f of facades) ctx.facades.push(place(f, t));
}

/** Hip roof over a w×d rectangle (w ≥ d); the ridge runs along x. Base at y. */
export function hipRoof(
	w: number,
	d: number,
	h: number,
	hex: number,
	y = 0,
): BufferGeometry {
	const hw = w / 2;
	const hd = d / 2;
	const r = Math.max(0, hw - hd);
	const A = [-hw, 0, -hd];
	const B = [hw, 0, -hd];
	const C = [hw, 0, hd];
	const D = [-hw, 0, hd];
	const R1 = [-r, h, 0];
	const R2 = [r, h, 0];
	const tris = [
		[D, C, R2],
		[D, R2, R1],
		[B, A, R1],
		[B, R1, R2],
		[C, B, R2],
		[A, D, R1],
	];
	const g = new Geo();
	g.setAttribute("position", new Float32BufferAttribute(tris.flat(2), 3));
	g.computeVertexNormals();
	return paint(g, hex).translate(0, y, 0);
}

function dome(
	r: number,
	squash: number,
	seg: number,
	hex: number,
	y: number,
): BufferGeometry {
	const g = paint(
		new SphereGeometry(r, seg, 8, 0, Math.PI * 2, 0, Math.PI / 2),
		hex,
	);
	return place(g, { y, sy: squash });
}

interface PorticoSpec {
	/** Width across the columns. */
	width: number;
	/** z of the wall the portico leans on. */
	z0: number;
	depth: number;
	columns: number;
	/** Column height. */
	height: number;
	/** Raised floor height. */
	floor: number;
	/** Pediment rise. */
	pediment: number;
}

/** Columned porch with entablature, pediment and steps, projecting toward +Z. */
function portico(out: BufferGeometry[], s: PorticoSpec): void {
	const { width, z0, depth, columns, height, floor, pediment } = s;
	const zc = z0 + depth / 2;
	out.push(box(width + 0.8, floor, depth, STEP, 0, 0, zc));
	for (let i = 0; i < columns; i++) {
		const x = -width / 2 + 0.4 + (i * (width - 0.8)) / (columns - 1);
		out.push(
			cyl(0.36, 0.42, height, 10, TRIM, x, floor, z0 + depth - 0.55),
			cyl(0.3, 0.34, height, 8, TRIM, x, floor, z0 + 0.55),
		);
	}
	out.push(
		box(width + 0.7, 0.55, depth + 0.2, TRIM, 0, floor + height, zc),
		paint(prismGeo(width + 0.9, pediment, depth + 0.3), TRIM).translate(
			0,
			floor + height + 0.55,
			zc,
		),
		paint(prismGeo(width - 0.5, pediment - 0.6, 0.1), TYMPANUM).translate(
			0,
			floor + height + 0.7,
			z0 + depth + 0.14,
		),
	);
	for (let j = 1; j <= 2; j++) {
		out.push(
			box(
				width + 0.4,
				(floor * (3 - j)) / 3,
				0.45,
				STEP,
				0,
				0,
				z0 + depth + 0.2 + (j - 1) * 0.45,
			),
		);
	}
}

/** Unpainted gable prism (ridge along z); caller paints it. */
function prismGeo(w: number, h: number, d: number): BufferGeometry {
	const hw = w / 2;
	const hd = d / 2;
	const A = [-hw, 0, -hd];
	const B = [hw, 0, -hd];
	const C = [0, h, -hd];
	const A2 = [-hw, 0, hd];
	const B2 = [hw, 0, hd];
	const C2 = [0, h, hd];
	const tris = [
		[A2, B2, C2],
		[B, A, C],
		[A, A2, C2],
		[A, C2, C],
		[B, C, C2],
		[B, C2, B2],
		[A, B, B2],
		[A, B2, A2],
	];
	const g = new Geo();
	g.setAttribute("position", new Float32BufferAttribute(tris.flat(2), 3));
	g.computeVertexNormals();
	return g;
}

/**
 * Red-brick two-storey town hall: green hip roof, white portico with pediment
 * on the +Z front, clock tower with glowing faces and a green spire.
 * Footprint 22 × 12; front steps reach z ≈ 10.
 */
export function townHall(ctx: BuildContext, at: Placement): void {
	const w = 22;
	const d = 12;
	const floor = 3.6;
	const h = floor * 2;
	const statics: BufferGeometry[] = [];
	const facades: BufferGeometry[] = [
		facadeBox(w, d, h, {
			upper: TILE.brickRed,
			ground: TILE.brickRed,
			floor,
			seed: ctx.rng.int(1, 9999),
		}),
	];

	statics.push(
		box(w + 0.5, 0.9, d + 0.5, STEP),
		box(w + 0.3, 0.3, d + 0.3, TRIM, 0, floor - 0.15),
		box(w + 0.7, 0.45, d + 0.7, TRIM, 0, h - 0.15),
		hipRoof(w + 1.4, d + 1.4, 3.2, GREEN_ROOF, h + 0.3),
		box(1.8, 3.2, 0.12, DOOR, 0, 0.9, d / 2 + 0.03),
		box(2.4, 0.4, 0.14, TRIM, 0, 4.1, d / 2 + 0.03),
	);
	for (const side of [-1, 1]) {
		statics.push(
			box(0.9, 2.2, 0.8, 0x8a4a3c, side * 4.5, h + 1.4, -2.2),
			box(1.1, 0.25, 1.0, TRIM, side * 4.5, h + 3.6, -2.2),
		);
	}
	portico(statics, {
		width: 9,
		z0: d / 2,
		depth: 3.2,
		columns: 6,
		height: 5.4,
		floor: 0.8,
		pediment: 2.3,
	});

	const tz = -0.4;
	const tBase = h + 1.6;
	const tH = 6;
	facades.push(
		place(
			facadeBox(4.4, 4.4, tH, {
				upper: TILE.brickRed,
				floor: 3,
				base: tBase,
				seed: ctx.rng.int(1, 9999),
			}),
			{ z: tz },
		),
	);
	const top = tBase + tH;
	const stage = top + 0.4;
	const faceY = stage + 0.6;
	statics.push(
		box(5, 0.4, 5, TRIM, 0, top, tz),
		box(3.6, 3.2, 3.6, TRIM, 0, stage, tz),
		glow(box(2, 2, 0.1, CLOCK_FACE, 0, faceY, tz + 1.8), GLOW.night),
		glow(box(0.1, 2, 2, CLOCK_FACE, 1.8, faceY, tz), GLOW.night),
		glow(box(0.1, 2, 2, CLOCK_FACE, -1.8, faceY, tz), GLOW.night),
		glow(box(2, 2, 0.1, CLOCK_FACE, 0, faceY, tz - 1.8), GLOW.night),
		box(0.1, 0.8, 0.06, DARK, 0, faceY + 1, tz + 1.88),
		box(0.6, 0.1, 0.06, DARK, 0.25, faceY + 0.95, tz + 1.88),
		box(0.06, 0.8, 0.1, DARK, 1.88, faceY + 1, tz),
		box(0.06, 0.1, 0.6, DARK, 1.88, faceY + 0.95, tz + 0.25),
		box(4, 0.4, 4, TRIM, 0, stage + 3.2, tz),
		cyl(1.5, 1.7, 1.5, 8, TRIM, 0, stage + 3.6, tz),
		cone(1.9, 3.6, 8, GREEN_ROOF, 0, stage + 5.1, tz),
		cyl(0.07, 0.07, 1.4, 5, GOLD, 0, stage + 8.5, tz),
		box(0.28, 0.28, 0.28, GOLD, 0, stage + 8.2, tz),
	);

	emit(ctx, at, statics, facades);
}

/**
 * Brick rotunda: pilastered drum with glowing windows, white dome, lantern and
 * a columned portico on the +Z front. Front steps reach z ≈ radius + 3.7.
 */
export function rotunda(ctx: BuildContext, at: Placement, radius = 6): void {
	const R = radius;
	const drumH = 8.5;
	const statics: BufferGeometry[] = [
		cyl(R + 0.3, R + 0.3, 0.9, 20, STEP),
		cyl(R, R, drumH, 20, BRICK),
		cyl(R + 0.5, R + 0.5, 0.6, 20, TRIM, 0, drumH),
		cyl(R + 0.2, R + 0.2, 0.4, 20, STEP, 0, drumH - 0.4),
		cyl(R - 0.1, R - 0.1, 0.5, 20, TRIM, 0, drumH + 0.55),
		dome(R - 0.2, 0.85, 20, TRIM, drumH + 0.8),
	];
	const domeTop = drumH + 0.8 + (R - 0.2) * 0.85;
	statics.push(
		cyl(0.9, 1.1, 1.6, 8, TRIM, 0, domeTop - 0.2),
		glow(cyl(0.95, 0.95, 0.9, 8, WINDOW_GLASS, 0, domeTop + 0.1), GLOW.always),
		cone(1.25, 1.4, 8, GREEN_ROOF, 0, domeTop + 1.4),
		cyl(0.06, 0.06, 1.2, 5, GOLD, 0, domeTop + 2.7),
	);

	const n = 14;
	for (let i = 0; i < n; i++) {
		const a = (i / n) * Math.PI * 2;
		const front = Math.cos(a) > 0.2 && Math.abs(R * Math.sin(a)) < 5.2;
		if (front) continue;
		statics.push(
			box(
				0.55,
				drumH - 0.6,
				0.45,
				TRIM,
				(R + 0.05) * Math.sin(a),
				0.9,
				(R + 0.05) * Math.cos(a),
				a,
			),
		);
		const mid = a + Math.PI / n;
		if (Math.cos(mid) > 0.2 && Math.abs(R * Math.sin(mid)) < 5.2) continue;
		statics.push(
			glow(
				box(
					0.95,
					4.4,
					0.16,
					WINDOW_GLASS,
					(R + 0.02) * Math.sin(mid),
					2.5,
					(R + 0.02) * Math.cos(mid),
					mid,
				),
				GLOW.always,
			),
			box(
				1.15,
				0.25,
				0.2,
				TRIM,
				(R + 0.04) * Math.sin(mid),
				6.9,
				(R + 0.04) * Math.cos(mid),
				mid,
			),
		);
	}

	statics.push(box(1.7, 3.2, 0.12, DOOR, 0, 0.9, R - 0.05));
	portico(statics, {
		width: 8,
		z0: R - 1.6,
		depth: 4,
		columns: 6,
		height: 7,
		floor: 0.9,
		pediment: 2.4,
	});

	emit(ctx, at, statics, []);
}

const HALL_TILES: readonly Tile[] = [
	TILE.brickRed,
	TILE.brickBrown,
	TILE.brickOrange,
];

/**
 * Brick campus hall: white plinth, string course and cornice, hip roof,
 * a small columned entrance on the +Z front and a cupola on the ridge.
 * Requires w ≥ d.
 */
export function campusHall(
	ctx: BuildContext,
	lot: Placement & { w: number; d: number },
	o: { floors?: number; tile?: Tile; entrance?: boolean } = {},
): void {
	const { rng } = ctx;
	const { w, d } = lot;
	const floors = o.floors ?? 3;
	const h = floors * FLOOR_H;
	const tile = o.tile ?? rng.pick(HALL_TILES);
	const facades = [
		facadeBox(w, d, h, { upper: tile, ground: tile, seed: rng.int(1, 9999) }),
	];
	const roofH = Math.min(2.6, 1.6 + d * 0.12);
	const statics: BufferGeometry[] = [
		box(w + 0.4, 0.7, d + 0.4, STEP),
		box(w + 0.25, 0.25, d + 0.25, TRIM, 0, FLOOR_H - 0.1),
		box(w + 0.6, 0.45, d + 0.6, TRIM, 0, h - 0.15),
		hipRoof(w + 1.4, d + 1.4, roofH, rng() < 0.5 ? SLATE : GREEN_ROOF, h + 0.3),
		box(1.4, 2.4, 0.12, DOOR, 0, 0.7, d / 2 + 0.03),
		box(0.8, 1.9, 0.8, TRIM, w * 0.28, h + roofH * 0.5, d * 0.2),
		box(0.8, 1.9, 0.8, TRIM, -w * 0.28, h + roofH * 0.5, d * 0.2),
		box(1.6, 1.0, 1.6, TRIM, 0, h + roofH * 0.8, 0),
		cone(1.2, 1.6, 8, GREEN_ROOF, 0, h + roofH * 0.8 + 1.0),
		cyl(0.05, 0.05, 0.9, 5, GOLD, 0, h + roofH * 0.8 + 2.6),
	];
	if (o.entrance ?? true) {
		portico(statics, {
			width: 4.2,
			z0: d / 2,
			depth: 1.8,
			columns: 4,
			height: 3.4,
			floor: 0.5,
			pediment: 1.3,
		});
	}
	emit(ctx, lot, statics, facades);
}

/**
 * Stone public library: tall arched-window facade, wide columned portico with
 * pediment, copper hip roof and a reading-room dome behind the ridge.
 * Requires w ≥ d; front steps reach z ≈ d/2 + 2.7.
 */
export function library(
	ctx: BuildContext,
	lot: Placement & { w: number; d: number },
	o: { floors?: number } = {},
): void {
	const { rng } = ctx;
	const { w, d } = lot;
	const floors = o.floors ?? 3;
	const h = floors * FLOOR_H;
	const facades = [
		facadeBox(w, d, h, {
			upper: TILE.stoneBeige,
			ground: TILE.stoneBeige,
			seed: rng.int(1, 9999),
		}),
	];
	const roofH = Math.min(2.2, 1.4 + d * 0.1);
	const statics: BufferGeometry[] = [
		box(w + 0.4, 0.7, d + 0.4, STEP),
		box(w + 0.25, 0.25, d + 0.25, TRIM, 0, FLOOR_H - 0.1),
		box(w + 0.6, 0.45, d + 0.6, TRIM, 0, h - 0.15),
		hipRoof(w + 1.2, d + 1.2, roofH, GREEN_ROOF, h + 0.3),
		dome(d * 0.28, 0.9, 12, TRIM, h + 0.3),
		dome(d * 0.2, 1.1, 10, GREEN_ROOF, h + 0.3 + d * 0.25),
		cyl(0.05, 0.05, 0.8, 5, GOLD, 0, h + 0.3 + d * 0.25 + d * 0.22),
		box(1.5, 2.4, 0.12, DOOR, 0, 0.7, d / 2 + 0.03),
		box(w * 0.5, 0.5, 0.1, BRICK, 0, h - 1.1, d / 2 + 0.06),
	];
	portico(statics, {
		width: Math.min(w - 1.5, 6.4),
		z0: d / 2,
		depth: 1.8,
		columns: 4,
		height: 3.4,
		floor: 0.5,
		pediment: 1.4,
	});
	emit(ctx, lot, statics, facades);
}
