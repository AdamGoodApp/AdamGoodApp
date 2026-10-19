import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";
import {
	box,
	cone,
	cyl,
	GLOW,
	glow,
	merge,
	paint,
	place,
	prism,
} from "../geometry";
import { TILE } from "../kit/atlas";
import { apartment, frontGarden, house, walkup } from "../kit/buildings";
import { facadeAt } from "../kit/facade";
import { CARS, PAVEMENT, WHITE } from "../palette";
import { bench, car, lamp, pine, roundTree } from "../prefabs";
import { type CrowdSpot, createCrowd } from "../sim/crowd";
import { Polyline } from "../sim/path";
import type { BuildContext } from "./context";
import { SIDEWALK_Y, WATER_Y } from "./layout";
import { type Block, OUTSKIRT_BLOCKS } from "./outskirts";
import { tintWhite } from "./tint";

/** Block pavement top; kit buildings start at y = 0 and the slab hides their base. */
const GY = SIDEWALK_Y + 0.02;
/** Top of a lawn laid on the pavement. */
const LY = GY + 0.03;

/** Marina: wall face x = -26.6 (beach.ts), boardwalk planks 0.2..0.3 above it. */
const QUAY_FACE = -26.6;
const DECK = 0.2;
const DECK_TOP = 0.3;
const RIM_X = -25.75;
const RAIL_X = -26.35;
const JETTY_X0 = -26.5;
const JETTY_X1 = -46;
const JETTY_W = 2.4;
const BOAT_BASE = WATER_Y - 0.4;
const QUAY_Z0 = 90;
const QUAY_Z1 = 236;

const WOOD_A = 0xc9a878;
const WOOD_B = 0xb99a68;
const ASPHALT = 0x5d6065;
const DRIVE = 0xb9b6b0;
const GLASS = 0x2b3a4a;
const LEAVES = [0x5fb257, 0x6dc062, 0x4f9f4d, 0x78c26a] as const;
const LAWNS = [0x8fd16a, 0x86c96c, 0x93d56f] as const;
const SHEDS = [0x9c7b55, 0xb5a58a, 0x6f7f93, 0xa65c4a] as const;
const HULLS = [
	0xffffff, 0x1f3a5f, 0xd8453a, 0x2f6b4f, 0xf2c94c, 0x3b7dd8,
] as const;
const SAILS = [0xffffff, 0xf3ead8, 0xcfe8ff] as const;
const UMBRELLAS = [0xd8453a, 0x3b7dd8, 0xf2c94c, 0x58c27a, 0xffffff] as const;

interface Rect {
	x0: number;
	x1: number;
	z0: number;
	z1: number;
}

type Kind =
	| "apartments"
	| "terrace"
	| "suburbL"
	| "suburbA"
	| "soccer"
	| "baseball";

/** Block layout by (column from the marina, row from the ring road); anything else is suburbL. */
const PLAN: Record<string, Kind> = {
	"1,0": "apartments",
	"2,0": "terrace",
	"3,0": "suburbL",
	"1,1": "terrace",
	"2,1": "suburbA",
	"3,1": "suburbL",
	"4,1": "suburbA",
	"1,2": "suburbL",
	"2,2": "soccer",
	"3,2": "suburbA",
	"4,2": "baseball",
	"5,2": "suburbL",
	"1,3": "suburbA",
	"2,3": "suburbL",
	"3,3": "suburbL",
	"4,3": "suburbA",
	"1,4": "suburbL",
	"2,4": "suburbA",
};

const rectOf = (b: Block): Rect => ({
	x0: b.minX,
	x1: b.maxX,
	z0: b.minZ,
	z1: b.maxZ,
});

// ---------------------------------------------------------------------------
// Shared small pieces
// ---------------------------------------------------------------------------

function lawn(
	ctx: BuildContext,
	r: Rect,
	hex: number = ctx.rng.pick(LAWNS),
): void {
	ctx.statics.push(
		box(
			r.x1 - r.x0,
			0.03,
			r.z1 - r.z0,
			hex,
			(r.x0 + r.x1) / 2,
			GY,
			(r.z0 + r.z1) / 2,
		),
	);
}

function parkedCar(
	ctx: BuildContext,
	x: number,
	y: number,
	z: number,
	ry: number,
): void {
	ctx.statics.push(
		place(tintWhite(car(), ctx.rng.pick(CARS)), { x, y, z, ry }),
	);
}

/** Thin straight wall/fence run from a to b (box z axis follows the segment). */
function run(
	ctx: BuildContext,
	[ax, az]: readonly [number, number],
	[bx, bz]: readonly [number, number],
	h: number,
	thick: number,
	hex: number,
	y: number,
): void {
	const len = Math.hypot(bx - ax, bz - az);
	ctx.statics.push(
		box(
			thick,
			h,
			len,
			hex,
			(ax + bx) / 2,
			y,
			(az + bz) / 2,
			Math.atan2(bx - ax, bz - az),
		),
	);
}

/** Lamp posts and street trees on the south and east sidewalks of a block. */
function streetside(ctx: BuildContext, r: Rect): void {
	const { rng, statics } = ctx;
	const w = r.x1 - r.x0;
	const d = r.z1 - r.z0;
	for (const f of [0.28, 0.72]) {
		statics.push(
			place(lamp(), { x: r.x0 + w * f, y: SIDEWALK_Y, z: r.z1 + 0.75 }),
		);
		statics.push(
			place(lamp(), { x: r.x1 + 0.75, y: SIDEWALK_Y, z: r.z0 + d * f }),
		);
	}
	for (const f of [0.08, 0.5, 0.92]) {
		if (rng() < 0.8) {
			statics.push(
				place(roundTree(rng.range(0.55, 0.7), rng.pick(LEAVES)), {
					x: r.x0 + w * f,
					y: SIDEWALK_Y,
					z: r.z1 + 0.75,
				}),
			);
		}
		if (rng() < 0.8) {
			statics.push(
				place(roundTree(rng.range(0.55, 0.7), rng.pick(LEAVES)), {
					x: r.x1 + 0.75,
					y: SIDEWALK_Y,
					z: r.z0 + d * f,
				}),
			);
		}
	}
}

/** Asphalt pad with painted stalls (cars point along x). */
function parking(ctx: BuildContext, r: Rect, fill = 0.6): void {
	const { rng, statics } = ctx;
	const w = r.x1 - r.x0;
	const cx = (r.x0 + r.x1) / 2;
	statics.push(box(w, 0.03, r.z1 - r.z0, ASPHALT, cx, GY, (r.z0 + r.z1) / 2));
	for (let z = r.z0 + 1.2; z <= r.z1 - 1; z += 2.4) {
		statics.push(
			box(Math.min(w - 0.4, 4.6), 0.01, 0.08, WHITE, cx, LY, z - 1.2),
		);
		if (rng() < fill)
			parkedCar(ctx, cx, LY, z, rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
	}
}

/** Patio table with a parasol (base y). */
function table(ctx: BuildContext, x: number, y: number, z: number): void {
	const hex = ctx.rng.pick(UMBRELLAS);
	ctx.statics.push(
		merge([
			cyl(0.05, 0.05, 0.75, 6, 0x666666, 0, 0, 0),
			cyl(0.5, 0.5, 0.06, 8, WHITE, 0, 0.75, 0),
			cyl(0.03, 0.03, 1.9, 6, 0x888888, 0, 0, 0),
			cone(1.25, 0.5, 8, hex, 0, 1.9, 0),
			box(0.4, 0.4, 0.4, 0x8a5a3c, 0.8, 0, 0),
			box(0.4, 0.4, 0.4, 0x8a5a3c, -0.8, 0, 0),
		]),
	);
	const last = ctx.statics[ctx.statics.length - 1] as BufferGeometry;
	place(last, { x, y, z });
}

// ---------------------------------------------------------------------------
// Suburbs: rows of kit houses with garages / front gardens, back yards
// ---------------------------------------------------------------------------

const HOUSE_D = 6;
/** Edge of the lot to the house centre (porch + setback + half depth). */
const FRONT = HOUSE_D / 2 + 2;
const GARAGE_W = 3.6;
/** Garage houses sit this much further back so a car fits on the driveway. */
const GARAGE_SHIFT = 2.8;
const MIN_GAP = 1.2;

interface RowSpec {
	/** Front direction (unit axis vector). */
	fx: number;
	fz: number;
	/** Front-edge coordinate along the front direction (q = fx·x + fz·z). */
	frontQ: number;
	/** Range along the row (s = fz·x − fx·z, increases along the house's local x). */
	s0: number;
	s1: number;
	garages: boolean;
}

/** One row of houses along a block edge. Returns the depth the row occupies (0 if empty). */
function houseRow(ctx: BuildContext, spec: RowSpec): number {
	const { rng, statics } = ctx;
	const { fx, fz } = spec;
	const len = spec.s1 - spec.s0;
	const slots: { w: number; garage: boolean }[] = [];
	let used = 0;
	for (;;) {
		const w = rng.range(5.8, 7.2);
		const garage = spec.garages && rng() < 0.6;
		const need = garage ? w + GARAGE_W : w;
		const n = slots.length + 1;
		if (used + need + n * MIN_GAP <= len) {
			slots.push({ w, garage });
			used += need;
		} else if (garage && used + w + n * MIN_GAP <= len) {
			slots.push({ w, garage: false });
			used += w;
		} else break;
	}
	if (slots.length === 0) return 0;

	const gap = (len - used) / slots.length;
	const ry = Math.atan2(fx, fz);
	let depth = FRONT + HOUSE_D / 2;
	let s = spec.s0;
	slots.forEach((slot, index) => {
		const slotLen = slot.w + (slot.garage ? GARAGE_W : 0);
		const shift = slot.garage ? GARAGE_SHIFT : 0;
		const sc = s + gap / 2 + slot.w / 2;
		const qc = spec.frontQ - FRONT - shift;
		const cx = fz * sc + fx * qc;
		const cz = -fx * sc + fz * qc;
		depth = Math.max(depth, FRONT + shift + HOUSE_D / 2);
		house(
			ctx,
			{ x: cx, z: cz, w: slot.w, d: HOUSE_D, ry },
			{ garage: slot.garage },
		);

		if (slot.garage) {
			const lx = slot.w / 2 + 1.8;
			const dl = FRONT + shift - HOUSE_D / 2;
			const lz = HOUSE_D / 2 + dl / 2;
			statics.push(
				place(
					merge([
						box(3.4, 0.02, dl, DRIVE, lx, LY, lz),
						place(tintWhite(car(), rng.pick(CARS)), {
							x: lx,
							y: LY + 0.02,
							z: lz,
							ry: rng() < 0.4 ? Math.PI : 0,
						}),
					]),
					{ x: cx, z: cz, ry },
				),
			);
		} else {
			frontGarden(ctx, {
				x: cx,
				z: cz,
				w: slot.w + 0.6,
				d: 2 * (FRONT - 0.15 + 0.3),
				ry,
			});
		}

		if (index < slots.length - 1) {
			const sg = s + slotLen + gap;
			const q = spec.frontQ - 0.9;
			statics.push(
				place(
					rng() < 0.3
						? pine(0.7)
						: roundTree(rng.range(0.7, 0.9), rng.pick(LEAVES)),
					{ x: fz * sg + fx * q, y: LY, z: -fx * sg + fz * q },
				),
			);
		}
		s += slotLen + gap;
	});
	return depth;
}

type YardKind = "pool" | "trampoline" | "shed" | "tree" | "pine";
const YARD_RADIUS: Record<YardKind, number> = {
	pool: 1.9,
	trampoline: 1.5,
	shed: 1.3,
	tree: 0.8,
	pine: 0.7,
};

/** Back yards: a pool or trampoline, a shed and plenty of trees scattered in `r`. */
function yard(ctx: BuildContext, r: Rect): void {
	const { rng, statics } = ctx;
	if (r.x1 - r.x0 < 2.5 || r.z1 - r.z0 < 1.5) return;
	const kinds: YardKind[] = [
		rng() < 0.55 ? "pool" : "trampoline",
		"shed",
		"tree",
		"tree",
		"pine",
		"tree",
		"pine",
		"tree",
	];
	const placed: { x: number; z: number; r: number }[] = [];
	for (const kind of kinds) {
		const rad = YARD_RADIUS[kind];
		const hx = Math.min(rad, (r.x1 - r.x0) / 2);
		const hz = Math.min(rad, (r.z1 - r.z0) / 2);
		for (let attempt = 0; attempt < 24; attempt++) {
			const x = rng.range(r.x0 + hx, r.x1 - hx);
			const z = rng.range(r.z0 + hz, r.z1 - hz);
			if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < (p.r + rad) * 0.85))
				continue;
			placed.push({ x, z, r: rad });
			if (kind === "pool") {
				statics.push(
					place(
						merge([
							box(3.4, 0.1, 2.4, 0xe9e6df),
							box(3.0, 0.115, 2.0, 0x4cc3f2),
						]),
						{ x, y: LY, z, ry: rng() < 0.5 ? 0 : Math.PI / 2 },
					),
				);
			} else if (kind === "trampoline") {
				const legs = [-0.7, 0.7].flatMap((lx) =>
					[-0.7, 0.7].map((lz) => box(0.06, 0.7, 0.06, 0x777777, lx, 0, lz)),
				);
				statics.push(
					place(
						merge([
							...legs,
							cyl(1.25, 1.25, 0.08, 12, 0x2d62d6, 0, 0.7),
							cyl(1.05, 1.05, 0.1, 12, 0x15151a, 0, 0.7),
						]),
						{ x, y: LY, z },
					),
				);
			} else if (kind === "shed") {
				statics.push(
					place(
						merge([
							box(1.8, 1.7, 1.5, rng.pick(SHEDS)),
							prism(2.1, 0.6, 1.8, 0x5a4a42, 0, 1.7),
						]),
						{ x, y: LY, z, ry: rng.int(0, 3) * (Math.PI / 2) },
					),
				);
			} else if (kind === "pine") {
				statics.push(place(pine(rng.range(0.8, 1.1)), { x, y: LY, z }));
			} else {
				statics.push(
					place(roundTree(rng.range(0.9, 1.15), rng.pick(LEAVES)), {
						x,
						y: LY,
						z,
					}),
				);
			}
			break;
		}
	}
}

/** South row (fronts +Z) plus east row (fronts +X), the camera-facing L; back yard in the corner. */
function suburbL(ctx: BuildContext, r: Rect): void {
	lawn(ctx, r);
	const sd = houseRow(ctx, {
		fx: 0,
		fz: 1,
		frontQ: r.z1,
		s0: r.x0,
		s1: r.x1,
		garages: true,
	});
	const ed = houseRow(ctx, {
		fx: 1,
		fz: 0,
		frontQ: r.x1,
		s0: -(r.z1 - sd - 0.5),
		s1: -r.z0,
		garages: true,
	});
	yard(ctx, {
		x0: r.x0 + 0.4,
		x1: r.x1 - ed - 0.4,
		z0: r.z0 + 0.4,
		z1: r.z1 - sd - 0.4,
	});
}

/** South row with front gardens and a north row (fronts -Z) back to back with a shared back yard. */
function suburbA(ctx: BuildContext, r: Rect): void {
	lawn(ctx, r);
	const sd = houseRow(ctx, {
		fx: 0,
		fz: 1,
		frontQ: r.z1,
		s0: r.x0,
		s1: r.x1,
		garages: false,
	});
	const nd = houseRow(ctx, {
		fx: 0,
		fz: -1,
		frontQ: -r.z0,
		s0: -r.x1,
		s1: -r.x0,
		garages: true,
	});
	yard(ctx, {
		x0: r.x0 + 0.4,
		x1: r.x1 - 0.4,
		z0: r.z0 + nd + 0.3,
		z1: r.z1 - sd - 0.3,
	});
}

// ---------------------------------------------------------------------------
// Urban blocks next to the ring road
// ---------------------------------------------------------------------------

/** Two low apartment blocks on the street side, a row of corner shops facing the ring road. */
function apartmentsBlock(ctx: BuildContext, r: Rect): void {
	const { rng, statics } = ctx;
	const aw = 9.4;
	const ad = 8.6;
	const az = r.z1 - 1.4 - ad / 2;
	for (const ax of [r.x0 + 0.6 + aw / 2, r.x1 - 0.6 - aw / 2]) {
		apartment(ctx, { x: ax, z: az, w: aw, d: ad }, { floors: rng.int(3, 4) });
		for (const dx of [-3.2, 0, 3.2]) {
			statics.push(
				place(cone(0.45, 0.8, 6, 0x4f8f45), {
					x: ax + dx,
					y: GY,
					z: r.z1 - 0.7,
				}),
			);
		}
	}
	statics.push(
		place(roundTree(1, rng.pick(LEAVES)), {
			x: (r.x0 + r.x1) / 2,
			y: GY,
			z: r.z1 - 1.8,
		}),
	);
	for (let k = 0; k < 3; k++) {
		walkup(
			ctx,
			{
				x: r.x0 + 3.7 + k * 7.2,
				z: r.z0 + 0.8 + 3.6,
				w: 6.4,
				d: 7.2,
				ry: Math.PI,
			},
			{ floors: rng.int(2, 3) },
		);
	}
	// Service alley between the shops and the apartments.
	const z0 = r.z0 + 8;
	const z1 = r.z1 - 1.4 - ad;
	statics.push(
		box(
			r.x1 - r.x0,
			0.03,
			z1 - z0,
			ASPHALT,
			(r.x0 + r.x1) / 2,
			GY,
			(z0 + z1) / 2,
		),
	);
	for (let k = 0; k < 4; k++) {
		if (rng() < 0.65)
			parkedCar(ctx, r.x0 + 2.5 + k * 5.4, LY, (z0 + z1) / 2, Math.PI / 2);
	}
}

/** A south row of brick townhouses with a corner shop, a north row facing -Z and back gardens between. */
function terraceBlock(ctx: BuildContext, r: Rect): void {
	const { rng, statics } = ctx;
	lawn(ctx, r);
	const widths = [5.2, 5.2, 5.2, 6.2];
	let x = r.x0 + 0.1;
	widths.forEach((w, i) => {
		const shop = i === widths.length - 1;
		walkup(
			ctx,
			{ x: x + w / 2, z: r.z1 - 1.2 - 4, w, d: 8 },
			{ floors: shop ? 2 : rng.int(2, 3), shops: shop },
		);
		if (!shop) {
			statics.push(
				place(cone(0.45, 0.8, 6, 0x4f8f45), {
					x: x + w * 0.2,
					y: GY,
					z: r.z1 - 0.6,
				}),
			);
		}
		x += w;
	});
	for (let k = 0; k < 3; k++) {
		walkup(
			ctx,
			{
				x: r.x0 + 0.6 + 3.4 + k * 7.6,
				z: r.z0 + 0.8 + 3.5,
				w: 6.8,
				d: 7,
				ry: Math.PI,
			},
			{ floors: rng.int(2, 3), shops: false },
		);
	}
	yard(ctx, { x0: r.x0 + 0.5, x1: r.x1 - 0.5, z0: r.z0 + 8.5, z1: r.z1 - 9.5 });
}

// ---------------------------------------------------------------------------
// Sports fields (fill the crowd spots)
// ---------------------------------------------------------------------------

function soccerBlock(ctx: BuildContext, r: Rect, spots: CrowdSpot[]): void {
	const { rng, statics } = ctx;
	lawn(ctx, r, 0x7cc06b);
	const cx = (r.x0 + r.x1) / 2;
	const cz = (r.z0 + r.z1) / 2;
	const L = 19;
	const W = 13;
	for (let i = 0; i < 6; i++) {
		statics.push(
			box(
				L / 6,
				0.02,
				W,
				i % 2 ? 0x58a548 : 0x62b152,
				cx - L / 2 + ((i + 0.5) * L) / 6,
				LY,
				cz,
			),
		);
	}
	const ly = LY + 0.02;
	const line = (w: number, d: number, x: number, z: number, ry = 0) =>
		statics.push(box(w, 0.012, d, WHITE, x, ly, z, ry));
	for (const s of [-1, 1]) {
		line(L, 0.12, cx, cz + (s * W) / 2);
		line(0.12, W, cx + (s * L) / 2, cz);
		line(0.12, 6.4, cx + s * (L / 2 - 2.8), cz);
		for (const t of [-1, 1])
			line(2.8, 0.12, cx + s * (L / 2 - 1.4), cz + t * 3.2);
		const x = cx + (s * L) / 2;
		for (const t of [-1, 1])
			statics.push(box(0.1, 2, 0.1, WHITE, x, LY, cz + t * 1.8));
		statics.push(
			box(0.1, 0.1, 3.7, WHITE, x, LY + 2, cz),
			box(0.03, 1.9, 3.6, 0xdadada, x + s * 1, LY, cz),
			box(1, 0.03, 3.6, 0xdadada, x + s * 0.5, LY + 1.95, cz),
		);
	}
	line(0.12, W, cx, cz);
	for (let k = 0; k < 12; k++) {
		const a = (k * Math.PI) / 6;
		line(0.12, 1.05, cx + 2 * Math.cos(a), cz + 2 * Math.sin(a), -a);
	}
	// Hedges on the south, west and east edges; bleachers on the north (spectators face the pitch).
	statics.push(
		box(r.x1 - r.x0 - 1.4, 0.9, 0.6, 0x4f9f4d, cx, LY, r.z1 - 0.6),
		box(0.6, 0.9, r.z1 - r.z0 - 1.4, 0x4f9f4d, r.x0 + 0.6, LY, cz),
		box(0.6, 0.9, r.z1 - r.z0 - 1.4, 0x4f9f4d, r.x1 - 0.6, LY, cz),
	);
	for (let i = 0; i < 3; i++) {
		statics.push(
			box(
				11,
				0.35 * (i + 1),
				0.8,
				0xb8bcc2,
				cx,
				LY,
				cz - W / 2 - 0.9 - i * 0.8,
			),
		);
	}
	for (const dx of [-8.5, 8.5]) {
		statics.push(
			place(roundTree(1.1, rng.pick(LEAVES)), {
				x: cx + dx,
				y: LY,
				z: r.z1 - 2.2,
			}),
		);
	}
	for (let i = 0; i < 14; i++) {
		spots.push({
			x: rng.range(cx - L / 2 + 1.5, cx + L / 2 - 1.5),
			z: rng.range(cz - W / 2 + 1, cz + W / 2 - 1),
			y: ly,
		});
	}
	for (let i = 0; i < 9; i++) {
		const k = i % 3;
		spots.push({
			x: cx - 4.4 + i * 1.1,
			z: cz - W / 2 - 0.9 - k * 0.8,
			y: LY + 0.35 * (k + 1),
			ry: 0,
		});
	}
}

function baseballBlock(ctx: BuildContext, r: Rect, spots: CrowdSpot[]): void {
	const { rng, statics } = ctx;
	lawn(ctx, r, 0x73bb62);
	const cx = (r.x0 + r.x1) / 2;
	const cz = (r.z0 + r.z1) / 2;
	const hx = cx;
	const hz = cz + 6.5;
	const side = 7.5;
	const k = side * Math.SQRT1_2;
	const bases: [number, number][] = [
		[hx + k, hz - k],
		[hx, hz - 2 * k],
		[hx - k, hz - k],
	];
	const mid: [number, number] = [hx, hz - k];
	const dirt = 0xc9a06a;
	const ly = LY + 0.02;
	statics.push(
		box(side + 2, 0.02, side + 2, dirt, mid[0], LY, mid[1], Math.PI / 4),
		box(
			side - 1.4,
			0.03,
			side - 1.4,
			0x6fbf5a,
			mid[0],
			LY,
			mid[1],
			Math.PI / 4,
		),
		cyl(1.5, 1.5, 0.03, 10, dirt, hx, LY, hz),
		cyl(0.9, 1.1, 0.08, 10, dirt, mid[0], LY, mid[1]),
		box(0.5, 0.06, 0.5, WHITE, hx, ly, hz, Math.PI / 4),
		box(
			0.12,
			0.012,
			13,
			WHITE,
			hx + Math.SQRT1_2 * 6.5,
			ly,
			hz - Math.SQRT1_2 * 6.5,
			(3 * Math.PI) / 4,
		),
		box(
			0.12,
			0.012,
			13,
			WHITE,
			hx - Math.SQRT1_2 * 6.5,
			ly,
			hz - Math.SQRT1_2 * 6.5,
			(-3 * Math.PI) / 4,
		),
	);
	for (const [bx, bz] of bases)
		statics.push(box(0.6, 0.08, 0.6, WHITE, bx, ly, bz, Math.PI / 4));
	// Outfield fence on an arc round home plate.
	const R = 13;
	let prev: [number, number] | null = null;
	for (let i = 0; i <= 12; i++) {
		const a = ((-50 + (100 * i) / 12) * Math.PI) / 180;
		const p: [number, number] = [hx + R * Math.sin(a), hz - R * Math.cos(a)];
		if (prev) run(ctx, prev, p, 1.2, 0.12, 0x2f6f4f, LY);
		prev = p;
	}
	// Backstop and dugouts.
	run(ctx, [hx - 3.5, hz + 2.6], [hx + 3.5, hz + 2.6], 1.2, 0.08, 0x6b6f75, LY);
	for (const s of [-1, 1]) {
		const dx = hx + s * 6.4;
		const dz = hz + 3.4;
		statics.push(
			box(2.6, 0.1, 1.3, 0x2f4f6f, dx, LY + 1.7, dz),
			box(0.1, 1.7, 0.1, 0x555555, dx - 1.2, LY, dz + 0.5),
			box(0.1, 1.7, 0.1, 0x555555, dx + 1.2, LY, dz + 0.5),
			box(2.4, 0.4, 0.4, 0x8a5a3c, dx, LY, dz - 0.2),
		);
		spots.push({ x: dx, z: dz - 0.2, y: LY + 0.4, ry: Math.PI });
		spots.push({ x: dx + 0.8, z: dz - 0.2, y: LY + 0.4, ry: Math.PI });
	}
	for (const dx of [-9.5, 9.5]) {
		statics.push(
			place(roundTree(1.1, rng.pick(LEAVES)), {
				x: cx + dx,
				y: LY,
				z: r.z1 - 1.6,
			}),
		);
	}
	const face = (px: number, pz: number) => Math.atan2(hx - px, hz - pz);
	const field: [number, number][] = [
		[mid[0], mid[1]],
		[hx, hz + 1.1],
		...bases,
		[hx + 3.2, hz - 4.4],
		[hx - 3.2, hz - 4.4],
		[hx - 6, hz - 9],
		[hx, hz - 11],
		[hx + 6, hz - 9],
	];
	for (const [px, pz] of field)
		spots.push({ x: px, z: pz, y: ly, ry: face(px, pz) });
}

// ---------------------------------------------------------------------------
// Marina: boats, jetties, boardwalk
// ---------------------------------------------------------------------------

type BoatKind = "yacht" | "sloop" | "cruiser";
const BOAT_KINDS: readonly BoatKind[] = [
	"yacht",
	"sloop",
	"cruiser",
	"sloop",
	"yacht",
];
const BOAT_HALF_W: Record<BoatKind, number> = {
	yacht: 1.45,
	sloop: 1.1,
	cruiser: 1.05,
};

/** Triangular sail visible from both sides (static material is single-sided). */
function sail(
	hex: number,
	a: number[],
	b: number[],
	c: number[],
): BufferGeometry {
	const g = new BufferGeometry();
	g.setAttribute(
		"position",
		new Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...b], 3),
	);
	return paint(g, hex);
}

/** Box hull plus a wedge bow; bow +Z, centred on z = 0, base y = 0. */
function hullParts(
	w: number,
	len: number,
	h: number,
	hex: number,
): BufferGeometry[] {
	const bow = len * 0.28;
	const body = len - bow;
	return [
		box(w, h, body, hex, 0, 0, -len / 2 + body / 2),
		place(prism(w, bow, h, hex), {
			rx: Math.PI / 2,
			y: h / 2,
			z: len / 2 - bow,
		}),
	];
}

function boat(kind: BoatKind, hull: number, sailHex: number): BufferGeometry {
	if (kind === "yacht") {
		const w = 2.9;
		const len = 9;
		const h = 0.9;
		return merge([
			...hullParts(w, len, h, hull),
			box(
				w + 0.04,
				0.12,
				len * 0.72,
				0x2b3a4a,
				0,
				h * 0.55,
				-len / 2 + (len * 0.72) / 2,
			),
			box(w * 0.78, 0.9, len * 0.36, 0xf4f4f4, 0, h, -len * 0.14),
			box(w * 0.8, 0.3, len * 0.34, GLASS, 0, h + 0.32, -len * 0.14),
			box(w * 0.56, 0.5, len * 0.2, 0xf4f4f4, 0, h + 0.9, -len * 0.16),
			box(0.05, 1, 0.05, 0x555555, 0, h + 1.4, -len * 0.16),
		]);
	}
	if (kind === "sloop") {
		const w = 2.2;
		const len = 7.5;
		const h = 0.7;
		const zm = len * 0.08;
		return merge([
			...hullParts(w, len, h, hull),
			box(1.4, 0.4, 2, 0xe8e2d0, 0, h, -len * 0.1),
			cyl(0.06, 0.06, 7.6, 6, 0xb8b8b8, 0, h, zm),
			box(0.07, 0.07, 3.2, 0xb8b8b8, 0, h + 1, zm - 1.7),
			sail(
				sailHex,
				[0, h + 1.1, zm - 0.1],
				[0, h + 7.4, zm - 0.1],
				[0, h + 1.1, zm - 3.3],
			),
			sail(
				sailHex,
				[0, h + 6.4, zm + 0.1],
				[0, h + 0.9, len / 2 - 0.3],
				[0, h + 1.1, zm + 0.2],
			),
		]);
	}
	const w = 2.1;
	const len = 5.5;
	const h = 0.65;
	return merge([
		...hullParts(w, len, h, hull),
		box(1.5, 0.5, 0.9, 0xf4f4f4, 0, h, 0.4),
		box(1.5, 0.35, 0.08, GLASS, 0, h + 0.5, 0.9),
		box(1.5, 0.3, 1, 0xe8e2d0, 0, h, -1),
		box(0.35, 0.8, 0.5, 0x333333, 0, h - 0.7, -len / 2 - 0.15),
	]);
}

function moored(
	ctx: BuildContext,
	kind: BoatKind,
	x: number,
	z: number,
	ry: number,
): void {
	const { rng } = ctx;
	ctx.statics.push(
		place(boat(kind, rng.pick(HULLS), rng.pick(SAILS)), {
			x,
			y: BOAT_BASE,
			z,
			ry,
		}),
	);
}

/** A finger jetty (x −26.5 → −46) centred on z with boats alongside both edges. */
function jetty(ctx: BuildContext, z: number, spots: CrowdSpot[]): void {
	const { rng, statics } = ctx;
	const len = JETTY_X0 - JETTY_X1;
	for (let i = 0; i < len; i++) {
		statics.push(
			box(
				1,
				0.1,
				JETTY_W,
				i % 2 ? WOOD_B : WOOD_A,
				JETTY_X0 - i - 0.5,
				DECK,
				z,
			),
		);
	}
	for (let x = JETTY_X0 - 1; x >= JETTY_X1 + 0.5; x -= 4) {
		for (const s of [-1, 1]) {
			statics.push(
				cyl(
					0.14,
					0.14,
					2.5,
					6,
					0x5a4330,
					x,
					-1.9,
					z + s * (JETTY_W / 2 + 0.15),
				),
			);
		}
	}
	statics.push(
		place(lamp(), { x: JETTY_X1 + 0.6, y: DECK_TOP, z }),
		glow(box(0.3, 0.3, 0.3, 0xffe2a0, JETTY_X1 - 0.1, 3.3, z), GLOW.night),
	);
	for (const s of [-1, 1]) {
		for (let slot = 0; slot < 2; slot++) {
			if (rng() < 0.12) continue;
			const kind = rng.pick(BOAT_KINDS);
			const bx = -33 - slot * 9.5 + rng.range(-0.6, 0.6);
			moored(
				ctx,
				kind,
				bx,
				z + s * (JETTY_W / 2 + 0.35 + BOAT_HALF_W[kind]),
				-Math.PI / 2,
			);
		}
	}
	for (const x of [-31, -37, -43])
		spots.push({
			x,
			z: z + rng.range(-0.5, 0.5),
			y: DECK_TOP,
			ry: rng.range(0, Math.PI * 2),
		});
}

/** Boardwalk rim over the quay, railing with gaps at the jetties, quay-side boats. */
function quayFront(ctx: BuildContext, jettyZs: number[]): void {
	const { rng, statics } = ctx;
	for (let z = QUAY_Z0; z < QUAY_Z1; z += 2) {
		statics.push(
			box(1.5, 0.1, 2, (z / 2) % 2 ? WOOD_B : WOOD_A, RIM_X, DECK, z + 1),
		);
	}
	// Railing, split at each jetty entrance.
	const cuts = [
		QUAY_Z0 + 1,
		...jettyZs.flatMap((z) => [z - 1.7, z + 1.7]),
		QUAY_Z1 - 1,
	];
	for (let i = 0; i < cuts.length; i += 2) {
		const a = cuts[i] as number;
		const b = cuts[i + 1] as number;
		statics.push(
			box(0.07, 0.07, b - a, WHITE, RAIL_X, DECK_TOP + 0.95, (a + b) / 2),
			box(0.05, 0.05, b - a, WHITE, RAIL_X, DECK_TOP + 0.5, (a + b) / 2),
		);
		const n = Math.max(1, Math.round((b - a) / 3));
		for (let k = 0; k <= n; k++) {
			statics.push(
				box(0.09, 1, 0.09, WHITE, RAIL_X, DECK_TOP, a + ((b - a) * k) / n),
			);
		}
	}
	// Boats lying along the quay wall between the jetties.
	for (let z = 117; z < QUAY_Z1; z += 30) {
		const kind = rng.pick(BOAT_KINDS);
		moored(
			ctx,
			kind,
			QUAY_FACE - BOAT_HALF_W[kind] - 0.25,
			z + rng.range(-2, 2),
			rng() < 0.5 ? 0 : Math.PI,
		);
	}
}

/** One waterfront block: boardwalk deck, street furniture and the buildings behind it. */
function marinaBlock(
	ctx: BuildContext,
	r: Rect,
	row: number,
	spots: CrowdSpot[],
): void {
	const { rng, statics } = ctx;
	const zc = (r.z0 + r.z1) / 2;
	statics.push(box(3.5, 0.1, r.z1 - r.z0 + 3, WOOD_A, -23.25, DECK, zc));
	for (const dz of [-6, 6]) {
		statics.push(place(lamp(), { x: -25.1, y: DECK_TOP, z: zc + dz }));
		spots.push({
			x: -23.5 + rng.range(-0.8, 0.8),
			z: zc + dz + rng.range(-2, 2),
			y: DECK_TOP,
		});
	}
	statics.push(
		place(bench(), { x: -22.4, y: DECK_TOP, z: zc - 3, ry: -Math.PI / 2 }),
	);
	statics.push(
		place(bench(), { x: -22.4, y: DECK_TOP, z: zc + 3, ry: -Math.PI / 2 }),
	);

	if (row === 0) {
		// Yacht club: stone-white hall with a navy gable roof, flags, a terrace and a car park.
		const bx = -16;
		ctx.facades.push(
			facadeAt(10, 17, 6.4, {
				upper: TILE.stoneWhite,
				ground: TILE.storeGlass,
				x: bx,
				z: zc,
				seed: 4242,
			}),
		);
		statics.push(
			prism(11, 2.4, 18, 0x2f4f6f, bx, 6.4, zc),
			box(10.4, 0.3, 17.4, 0xe9e4da, bx, 6.1, zc),
			box(0.2, 1.1, 8, 0x1f3a5f, bx + 5.1, 4.8, zc),
			glow(box(0.1, 0.4, 6.4, 0xf4f4f4, bx + 5.2, 5.15, zc), GLOW.night),
			box(0.6, 0.15, 5, 0xe9e4da, bx + 5.3, 3.4, zc),
		);
		for (const dz of [-6.5, 0, 6.5]) {
			statics.push(
				cyl(0.07, 0.07, 9, 6, 0xdddddd, -11.2, 0.2, zc + dz),
				box(
					0.05,
					1,
					1.6,
					rng.pick([0xd8453a, 0x1f3a5f, 0xf4f4f4]),
					-11.2,
					8.1,
					zc + dz + 0.85,
				),
			);
		}
		for (const dz of [-6, -2, 2, 6]) table(ctx, -23.6, DECK_TOP, zc + dz);
		parking(ctx, { x0: -10.2, x1: -4.3, z0: r.z0 + 0.5, z1: r.z1 - 0.5 });
		for (let i = 0; i < 5; i++)
			spots.push({ x: -9 + rng.range(-1, 1), z: r.z0 + 2 + i * 4, y: LY });
	} else if (row === 1 || row === 4) {
		// Chandlery, cafés and ice-cream bars facing the car park.
		for (let k = 0; k < 3; k++) {
			walkup(
				ctx,
				{ x: -17, z: r.z0 + 3.7 + k * 7.3, w: 6.4, d: 8, ry: Math.PI / 2 },
				{ floors: row === 1 ? 2 : rng.int(2, 3) },
			);
		}
		parking(ctx, { x0: -10.2, x1: -4.3, z0: r.z0 + 0.5, z1: r.z1 - 0.5 }, 0.5);
		table(ctx, -23.6, DECK_TOP, zc - 8);
		table(ctx, -23.6, DECK_TOP, zc + 8);
	} else if (row === 2) {
		// Boatyard: hangar, dry-stacked boats on stands, a quay crane.
		ctx.facades.push(
			facadeAt(9, 14, 5.2, {
				upper: TILE.blankConcrete,
				tint: 0xdfe6ee,
				x: -16.5,
				z: zc,
				seed: 777,
			}),
		);
		statics.push(
			prism(9.8, 2.2, 14.8, 0x9fb7c9, -16.5, 5.2, zc),
			box(0.12, 3.6, 7, 0x2f4f6f, -11.94, 0.2, zc),
		);
		for (const dz of [-6, 0, 6]) {
			const stand = box(1.8, 0.5, 3.6, 0x555555, -7.6, GY, zc + dz);
			statics.push(
				stand,
				place(boat("cruiser", rng.pick(HULLS), 0xffffff), {
					x: -7.6,
					y: GY + 0.5,
					z: zc + dz,
					ry: rng() < 0.5 ? 0 : Math.PI,
				}),
			);
		}
		statics.push(
			cyl(0.25, 0.3, 5.5, 8, 0xd8453a, -24.6, DECK_TOP, zc + 9),
			place(box(6.5, 0.22, 0.22, 0xd8453a, 0, -0.11, 0), {
				x: -27.4,
				y: 6.1,
				z: zc + 9,
				rz: 0.2,
			}),
			box(0.03, 3, 0.03, 0x333333, -30.4, 2.9, zc + 9),
		);
		parking(ctx, { x0: -10.2, x1: -4.3, z0: r.z0 + 0.5, z1: r.z0 + 5.5 }, 0.8);
	} else {
		// Waterfront flats.
		for (const az of [r.z0 + 5.5, r.z1 - 5.5]) {
			apartment(
				ctx,
				{ x: -16.5, z: az, w: 9, d: 9, ry: Math.PI / 2 },
				{ floors: rng.int(3, 4) },
			);
		}
		parking(ctx, { x0: -10.2, x1: -4.3, z0: r.z0 + 0.5, z1: r.z1 - 0.5 }, 0.5);
	}
	for (const dz of [-8, 0, 8]) {
		statics.push(
			place(roundTree(0.7, rng.pick(LEAVES)), { x: -4.9, y: GY, z: zc + dz }),
		);
	}
}

/** Footpath and trees on the strip between the south blocks and the eastern blocks (x 84.5..89.5). */
function greenway(ctx: BuildContext): void {
	const { rng, statics } = ctx;
	const z0 = 90;
	const z1 = 204.5;
	statics.push(box(1.6, 0.04, z1 - z0, PAVEMENT, 87, 0, (z0 + z1) / 2));
	ctx.sidewalks.push(
		new Polyline(
			[new Vector3(87, 0.04, z0 + 1), new Vector3(87, 0.04, z1 - 1)],
			false,
		),
	);
	let side = 1;
	for (let z = z0 + 3; z < z1 - 1; z += 5) {
		statics.push(
			place(
				rng() < 0.3
					? pine(1)
					: roundTree(rng.range(0.9, 1.2), rng.pick(LEAVES)),
				{ x: 87 + side * 2, y: 0, z },
			),
		);
		side = -side;
	}
	for (let z = z0 + 14; z < z1 - 6; z += 22) {
		statics.push(
			place(bench(), { x: 85.9, y: 0, z, ry: Math.PI / 2 }),
			place(lamp(), { x: 88.2, y: 0, z: z + 3 }),
		);
	}
}

/**
 * South outskirts (screen bottom-left): the marina on the sea-side column, apartments, townhouses
 * and corner shops beside the ring road, suburbs with garages and back yards, a soccer pitch and
 * a baseball diamond. Adds one Pool (a shared crowd of players, spectators and promenaders).
 */
export function buildOutskirtsSouth(ctx: BuildContext): void {
	const blocks = OUTSKIRT_BLOCKS.filter((b) => b.region === "south");
	const spots: CrowdSpot[] = [];
	const jettyZs: number[] = [];

	for (const b of blocks) {
		const r = rectOf(b);
		streetside(ctx, r);
		if (b.coast === "west") {
			const row = Math.round((b.minZ - 91) / 30);
			marinaBlock(ctx, r, row, spots);
			jetty(ctx, (r.z0 + r.z1) / 2, spots);
			jettyZs.push((r.z0 + r.z1) / 2);
			continue;
		}
		const col = Math.round((b.minX - 4) / 30) + 1;
		const row = Math.round((b.minZ - 91) / 30);
		const kind = PLAN[`${col},${row}`] ?? "suburbL";
		if (kind === "apartments") apartmentsBlock(ctx, r);
		else if (kind === "terrace") terraceBlock(ctx, r);
		else if (kind === "suburbA") suburbA(ctx, r);
		else if (kind === "soccer") soccerBlock(ctx, r, spots);
		else if (kind === "baseball") baseballBlock(ctx, r, spots);
		else suburbL(ctx, r);
	}

	quayFront(ctx, jettyZs);
	greenway(ctx);
	ctx.sidewalks.push(
		new Polyline(
			[
				new Vector3(-23.3, DECK_TOP, QUAY_Z0 + 2),
				new Vector3(-23.3, DECK_TOP, 233),
			],
			false,
		),
	);
	createCrowd(ctx, spots, { count: spots.length, spread: 0.35 });
}
