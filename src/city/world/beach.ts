import {
	BoxGeometry,
	BufferGeometry,
	Float32BufferAttribute,
	IcosahedronGeometry,
	Mesh,
	Vector3,
} from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
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
import { apartment, type Lot, walkup } from "../kit/buildings";
import { FLOOR_H } from "../kit/facade";
import {
	BRIGHTS,
	darken,
	FOAM,
	PAVEMENT,
	ROCK,
	SAND,
	SHIRTS,
} from "../palette";
import { bench, lamp, palm, personLying } from "../prefabs";
import { mulberry32, type Rng, WORLD_SEED } from "../rng";
import type { Agent } from "../sim/agent";
import { createBoats } from "../sim/boats";
import { type CrowdSpot, createCrowd } from "../sim/crowd";
import { Polyline } from "../sim/path";
import type { BuildContext } from "./context";
import { CELL_Y, LAND_HALF, SIDEWALK_Y } from "./layout";
import { tintWhite } from "./tint";

/** Beach cell interior between the ring sidewalk (x = -82.5) and avenue sidewalk (x = -34.5). */
const BEACH_X0 = -82.5;
const BEACH_X1 = -34.5;
const BEACH_Z0 = 34.5;
const BEACH_Z1 = 82.5;

/** The boardwalk L runs in front of the hotels: z = 45..49 along the north row, x = -49..-45 along the east row. */
const BOARD_W = 4;
const BOARD_Z = 47;
const BOARD_X = -47;
const PLAZA_Z = 45;
const WOOD = 0xc9a878;

const HOTEL_D = 9;
const HOTEL_Z = 40;
const HOTEL_X = -40;

interface Slot {
	w: number;
	gap: number;
}
const NORTH_START_X = -82.3;
const NORTH_SLOTS: readonly Slot[] = [
	{ w: 8.6, gap: 2 },
	{ w: 9.4, gap: 0.4 },
	{ w: 9.2, gap: 0.4 },
	{ w: 8.6, gap: 2 },
	{ w: 6.2, gap: 0 },
];
const NORTH_ALLEYS = [-72.7, -42.7];
const EAST_START_Z = 45.2;
const EAST_SLOTS: readonly Slot[] = [
	{ w: 9.6, gap: 0.4 },
	{ w: 8.2, gap: 2 },
	{ w: 8.8, gap: 0.4 },
	{ w: 7.9, gap: 0 },
];
const EAST_ALLEY = 64.4;

/** Sand rectangles [x0, x1, z0, z1] kept free of towels (bars, kiosk, court, towers). */
const BLOCKED: readonly (readonly [number, number, number, number])[] = [
	[-80.5, -73.5, 50.5, 58],
	[-70, -63, 50.5, 58],
	[-59, -50, 59.5, 67],
	[-58, -50, 72.5, 79],
	[-74.5, -56.5, 71, 82],
	[-83, -78, 59, 65],
	[-83, -78, 74, 80],
	[-65, -59, 63, 69],
	// Added beach life: resort pool, soccer pitch, surf school, kayaks, lounger rows, castles.
	[-61.9, -51.8, 51.5, 58.9],
	[-77.7, -65.3, 59.3, 67.7],
	[-81.8, -78.2, 66.8, 71],
	[-78.8, -77, 70.6, 74.2],
	[-81.8, -79.5, 52.2, 59.6],
	[-79, -63, 56.2, 58.2],
	[-76.5, -65.5, 68.2, 70.6],
	[-58, -51.7, 66.4, 71.8],
	[-63.6, -61.2, 59.7, 62.1],
	[-58.2, -55.8, 59.2, 61.6],
	[-77, -74.6, 72.8, 75.2],
	[-77, -74.6, 78, 80.4],
	[-71.2, -68.8, 80.4, 82.6],
	[-61.7, -59.3, 80.4, 82.6],
];

const PIER_Z = 70;
const PIER_TOP = 1.2;
const PIER_WOOD = 0x9c7b55;
const PIER_RAIL = 0xf2efe6;

const ISLET = { x: -124, z: PIER_Z };

const SHORE_LEN = 7;
const SHORE_DROP = 0.7;
const FOAM_NEAR = 2.9;
const FOAM_FAR = 3.5;

type Point = [number, number, number];

/** Planar quad a-b-c-d with its triangles wound to face up. */
function slope(
	hex: number,
	a: Point,
	b: Point,
	c: Point,
	d: Point,
): BufferGeometry {
	const normalY = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
	const order = normalY >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
	const geo = new BufferGeometry();
	geo.setAttribute("position", new Float32BufferAttribute(order.flat(), 3));
	return paint(geo, hex);
}

class BeaconAgent implements Agent {
	constructor(private readonly beam: Mesh) {}

	update(dt: number): void {
		this.beam.rotation.y += 1.2 * dt;
	}
}

/** Edges of the western strip: the sea starts at z = 25 for x < -90 and at x = -25 for z > 90. */
const COAST_Z = 25;
const COAST_X = -25;
const WORLD_EDGE = 250;
const QUAY_W = 1.6;
const QUAY_FACE = COAST_X - QUAY_W;
const QUAY_STONE = 0xa9a69f;

/** Deterministic 0..1 noise so the shore never consumes the shared rng stream. */
function hash01(i: number): number {
	const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
	return v - Math.floor(v);
}

/**
 * The real coast, in four pieces (land is everywhere else):
 *  1. x = -90, z 25..90: sand ramp + foam (the beach's west edge).
 *  2. z = 90, x -90..-25: sand ramp + foam (beach and theme-park south edge).
 *  3. z = 25, x -250..-90: rock revetment + boulders + foam below the west outskirts.
 *  4. x = -25, z 90..250: vertical stone quay wall + foam for the marina.
 * Pieces 1/3 meet in a mitre at (-90, 25); pieces 2/4 meet at (-25, 90) where the quay starts.
 */
function buildShore(ctx: BuildContext): void {
	const s = ctx.statics;
	const edge = LAND_HALF;
	const far = edge + SHORE_LEN;
	const foamY = (d: number): number => -(SHORE_DROP / SHORE_LEN) * d + 0.015;

	s.push(
		// 1. West beach ramp, z 25..90; its north end is cut on the diagonal shared with the revetment.
		slope(
			SAND,
			[-edge, 0, COAST_Z],
			[-far, -SHORE_DROP, COAST_Z + SHORE_LEN],
			[-far, -SHORE_DROP, far],
			[-edge, 0, edge],
		),
		// 2. South beach ramp, x -90..-25, mitred with the west ramp at (-90, 90).
		slope(
			SAND,
			[-edge, 0, edge],
			[COAST_X, 0, edge],
			[COAST_X, -SHORE_DROP, far],
			[-far, -SHORE_DROP, far],
		),
		// 3. Revetment under the west outskirts, same slope as the sand so the corner is an exact 45° mitre.
		slope(
			ROCK,
			[-WORLD_EDGE, 0, COAST_Z],
			[-edge, 0, COAST_Z],
			[-far, -SHORE_DROP, COAST_Z + SHORE_LEN],
			[-WORLD_EDGE, -SHORE_DROP, COAST_Z + SHORE_LEN],
		),
		// Foam: west beach (north end on the mitre) ...
		slope(
			FOAM,
			[-edge - FOAM_NEAR, foamY(FOAM_NEAR), COAST_Z + FOAM_NEAR],
			[-edge - FOAM_FAR, foamY(FOAM_FAR), COAST_Z + FOAM_FAR],
			[-edge - FOAM_FAR, foamY(FOAM_FAR), edge + FOAM_FAR],
			[-edge - FOAM_NEAR, foamY(FOAM_NEAR), edge + FOAM_NEAR],
		),
		// ... south beach, stopping where the quay foam begins ...
		slope(
			FOAM,
			[-edge - FOAM_NEAR, foamY(FOAM_NEAR), edge + FOAM_NEAR],
			[QUAY_FACE - 1.4, foamY(FOAM_NEAR), edge + FOAM_NEAR],
			[QUAY_FACE - 1.4, foamY(FOAM_FAR), edge + FOAM_FAR],
			[-edge - FOAM_FAR, foamY(FOAM_FAR), edge + FOAM_FAR],
		),
		// ... and the revetment (west end of its band is the mitre).
		slope(
			FOAM,
			[-WORLD_EDGE, foamY(FOAM_NEAR), COAST_Z + FOAM_NEAR],
			[-edge - FOAM_NEAR, foamY(FOAM_NEAR), COAST_Z + FOAM_NEAR],
			[-edge - FOAM_FAR, foamY(FOAM_FAR), COAST_Z + FOAM_FAR],
			[-WORLD_EDGE, foamY(FOAM_FAR), COAST_Z + FOAM_FAR],
		),
	);

	// Boulders along the revetment (flattened low-poly rocks half sunk in the slope).
	const shades = [ROCK, darken(ROCK, 0.85), darken(ROCK, 1.08)];
	for (
		let i = 0, x = -WORLD_EDGE + 3;
		x < -edge - 4;
		i++, x += 3.5 + hash01(i) * 2
	) {
		const d = 0.8 + hash01(i * 3 + 1) * 4.2;
		const r = 0.5 + hash01(i * 5 + 2) * 0.7;
		s.push(
			place(paint(new IcosahedronGeometry(r, 0), shades[i % 3] as number), {
				x,
				y: -(SHORE_DROP / SHORE_LEN) * d + r * 0.2,
				z: COAST_Z + d,
				ry: hash01(i * 7 + 3) * Math.PI,
				sy: 0.6,
			}),
		);
	}

	// 4. Quay wall: the land slab's west face is hidden behind a stone wall with a lighter plinth line.
	const len = WORLD_EDGE - edge;
	const mid = (edge + WORLD_EDGE) / 2;
	s.push(
		box(QUAY_W, 1.65, len, QUAY_STONE, COAST_X - QUAY_W / 2, -1.4, mid),
		box(0.12, 0.3, len, darken(QUAY_STONE, 0.8), QUAY_FACE - 0.05, -0.55, mid),
		box(
			1.4,
			0.02,
			len - FOAM_NEAR,
			FOAM,
			QUAY_FACE - 0.7,
			-0.31,
			(edge + FOAM_NEAR + WORLD_EDGE) / 2,
		),
	);
}

function buildBoardwalk(ctx: BuildContext): void {
	const s = ctx.statics;
	const y = CELL_Y;
	const walkX1 = BOARD_X + BOARD_W / 2;
	s.push(
		// Pavement under the north hotel row, the east hotel row and the alleys between them.
		box(
			BEACH_X1 - BEACH_X0,
			0.08,
			PLAZA_Z - BEACH_Z0,
			PAVEMENT,
			(BEACH_X0 + BEACH_X1) / 2,
			y,
			(BEACH_Z0 + PLAZA_Z) / 2,
		),
		box(
			BEACH_X1 - walkX1,
			0.08,
			BEACH_Z1 - PLAZA_Z,
			PAVEMENT,
			(BEACH_X1 + walkX1) / 2,
			y,
			(PLAZA_Z + BEACH_Z1) / 2,
		),
		// Timber boardwalk in front of the hotels, an L around the sand.
		box(
			walkX1 - BEACH_X0,
			0.08,
			BOARD_W,
			WOOD,
			(BEACH_X0 + walkX1) / 2,
			y,
			BOARD_Z,
		),
		box(
			BOARD_W,
			0.08,
			BEACH_Z1 - (BOARD_Z + BOARD_W / 2),
			WOOD,
			BOARD_X,
			y,
			(BOARD_Z + BOARD_W / 2 + BEACH_Z1) / 2,
		),
	);

	const v = SIDEWALK_Y;
	ctx.sidewalks.push(
		new Polyline(
			[
				new Vector3(BEACH_X0, v, BOARD_Z),
				new Vector3(BOARD_X, v, BOARD_Z),
				new Vector3(BOARD_X, v, BEACH_Z1),
			],
			false,
		),
	);
	for (const x of NORTH_ALLEYS) {
		ctx.sidewalks.push(
			new Polyline(
				[new Vector3(x, v, BEACH_Z0 - 0.2), new Vector3(x, v, BOARD_Z)],
				false,
			),
		);
	}
	ctx.sidewalks.push(
		new Polyline(
			[
				new Vector3(BEACH_X1 + 0.3, v, EAST_ALLEY),
				new Vector3(BOARD_X, v, EAST_ALLEY),
			],
			false,
		),
	);

	for (const x of [-81.5, -71.8, -60.5, -55.5]) {
		s.push(
			place(palm(), {
				x,
				y: CELL_Y,
				z: BOARD_Z + 3.3,
				ry: ctx.rng.range(0, Math.PI * 2),
			}),
		);
	}
	for (const z of [53.5, 58, 69, 72.5, 80.5]) {
		s.push(
			place(palm(), {
				x: BOARD_X - 3.3,
				y: CELL_Y,
				z,
				ry: ctx.rng.range(0, Math.PI * 2),
			}),
		);
	}
	for (const x of [-77, -66.5, -58]) {
		s.push(
			place(bench(), { x, y: SIDEWALK_Y, z: BOARD_Z - 1.4 }),
			place(lamp(), { x: x + 2.5, y: SIDEWALK_Y, z: BOARD_Z - 1.6 }),
		);
	}
	for (const z of [57, 68, 79]) {
		s.push(
			place(bench(), {
				x: BOARD_X + 1.4,
				y: SIDEWALK_Y,
				z,
				ry: -Math.PI / 2,
			}),
			place(lamp(), { x: BOARD_X - 1.6, y: SIDEWALK_Y, z: z + 4 }),
		);
	}
}

function roofExtras(ctx: BuildContext, lot: Lot, floors: number, i: number) {
	const { rng } = ctx;
	const h = floors * FLOOR_H;
	const parts: BufferGeometry[] = [];
	const pw = lot.w * 0.26;
	const pd = lot.d * 0.34;
	const px = lot.w * 0.31;
	const pz = -lot.d * 0.08;
	parts.push(
		box(pw + 0.3, 0.16, pd + 0.3, 0xf4f1ea, px, h + 0.25, pz),
		glow(box(pw, 0.1, pd, 0x4cc9f0, px, h + 0.4, pz), GLOW.night),
		cone(0.7, 0.35, 8, rng.pick(BRIGHTS), px + pw / 2 + 0.7, h + 1.9, pz),
		cyl(0.04, 0.04, 1.7, 6, 0xeeeeee, px + pw / 2 + 0.7, h + 0.25, pz),
	);
	if (i % 3 !== 1) {
		parts.push(
			glow(
				box(
					Math.min(lot.w * 0.5, 5),
					0.8,
					0.2,
					rng.pick(BRIGHTS),
					0,
					h + 0.7,
					lot.d / 2 - 0.3,
				),
				GLOW.always,
			),
		);
	}
	ctx.statics.push(
		place(merge(parts), { x: lot.x, z: lot.z, ry: lot.ry ?? 0 }),
	);
}

function hotel(ctx: BuildContext, lot: Lot, i: number, floors: number): void {
	if (i % 2 === 0 && lot.w > 7) apartment(ctx, lot, { floors });
	else
		walkup(ctx, lot, {
			floors,
			upper: ctx.rng.pick([TILE.stuccoCream, TILE.stoneWhite]),
			shops: true,
		});
	roofExtras(ctx, lot, floors, i);
}

/** Seafront hotels: a north row facing the sand (+Z) and an east row facing west (-X). */
function buildHotels(ctx: BuildContext): void {
	const { rng } = ctx;
	let x = NORTH_START_X;
	NORTH_SLOTS.forEach((slot, i) => {
		hotel(
			ctx,
			{ x: x + slot.w / 2, z: HOTEL_Z, w: slot.w, d: HOTEL_D, ry: 0 },
			i,
			rng.int(5, 8),
		);
		x += slot.w + slot.gap;
	});
	let z = EAST_START_Z;
	EAST_SLOTS.forEach((slot, i) => {
		hotel(
			ctx,
			{
				x: HOTEL_X,
				z: z + slot.w / 2,
				w: slot.w,
				d: HOTEL_D,
				ry: -Math.PI / 2,
			},
			i + NORTH_SLOTS.length,
			rng.int(4, 5),
		);
		z += slot.w + slot.gap;
	});
}

/** Tiki bar facing +Z in its local frame, placed at (x, z) rotated by ry. */
function tikiBar(
	ctx: BuildContext,
	x: number,
	z: number,
	ry: number,
	trim: number,
): void {
	const parts: BufferGeometry[] = [
		box(4.6, 0.15, 3.2, 0x9c7b55),
		box(4.2, 2.2, 0.15, 0xd9a066, 0, 0.15, -1.4),
		box(3.6, 1, 0.7, 0xf4efe4, 0, 0.15, 0.9),
		box(3.9, 0.1, 1, trim, 0, 1.15, 0.9),
		cone(3.3, 1.5, 8, 0xc9a45a, 0, 2.65),
		glow(box(2.2, 0.45, 0.1, trim, 0, 1.75, 1.5), GLOW.always),
	];
	for (const sx of [-1, 1]) {
		for (const sz of [-1, 1]) {
			parts.push(box(0.18, 2.5, 0.18, 0x7a5230, sx * 2.1, 0.15, sz * 1.4));
		}
	}
	for (let i = 0; i < 5; i++) {
		parts.push(
			glow(box(0.14, 0.14, 0.14, 0xfff1c4, -2 + i, 2.4, 1.55), GLOW.night),
		);
	}
	for (const sx of [-1.2, 0, 1.2]) {
		parts.push(cyl(0.22, 0.22, 0.55, 6, ctx.rng.pick(BRIGHTS), sx, 0.15, 2.1));
	}
	ctx.statics.push(place(merge(parts), { x, y: CELL_Y, z, ry }));
}

function lifeguardTower(ctx: BuildContext, x: number, z: number): void {
	const parts: BufferGeometry[] = [];
	for (const sx of [-0.7, 0.7]) {
		for (const sz of [-0.7, 0.7]) {
			parts.push(box(0.14, 2, 0.14, 0xf4f4f4, sx, 0, sz));
		}
	}
	parts.push(
		box(1.9, 0.12, 1.9, 0x9c7b55, 0, 2, 0),
		box(1.5, 1.2, 1.5, 0xf4f4f4, 0, 2.12, -0.1),
		box(1.56, 0.3, 1.56, 0xe8463c, 0, 2.6, -0.1),
		box(1, 0.5, 0.05, 0x2b3a4a, 0, 2.7, 0.68),
		box(1.9, 0.12, 1.9, 0xe8463c, 0, 3.32, -0.1),
		cyl(0.03, 0.03, 1.4, 6, 0x555555, 0.8, 3.44, -0.85),
		box(0.6, 0.35, 0.03, 0xf2c94c, 1.1, 4.5, -0.85),
	);
	const lean = Math.atan2(0.95, 2);
	for (const sx of [-0.3, 0.3]) {
		parts.push(
			place(box(0.06, Math.hypot(0.95, 2), 0.06, 0xf4f4f4), {
				rx: -lean,
				x: sx,
				z: 1.9,
			}),
		);
	}
	for (let i = 1; i <= 4; i++) {
		const yy = i * 0.45;
		parts.push(box(0.66, 0.05, 0.06, 0xf4f4f4, 0, yy, 1.9 - 0.475 * yy));
	}
	ctx.statics.push(place(merge(parts), { x, y: CELL_Y, z }));
}

function volleyball(ctx: BuildContext, x: number, z: number): void {
	const s = ctx.statics;
	const line = 0xffffff;
	s.push(
		box(16, 0.03, 8, 0xe7cf92, x, CELL_Y, z),
		box(16, 0.01, 0.1, line, x, CELL_Y + 0.03, z - 3.95),
		box(16, 0.01, 0.1, line, x, CELL_Y + 0.03, z + 3.95),
		box(0.1, 0.01, 8, line, x - 7.95, CELL_Y + 0.03, z),
		box(0.1, 0.01, 8, line, x + 7.95, CELL_Y + 0.03, z),
		box(0.04, 0.9, 8, 0xf4f4f4, x, CELL_Y + 1.45, z),
		box(0.07, 0.08, 8.1, 0xe8463c, x, CELL_Y + 2.35, z),
		cyl(0.06, 0.06, 2.4, 6, 0x555555, x, CELL_Y, z - 4.05),
		cyl(0.06, 0.06, 2.4, 6, 0x555555, x, CELL_Y, z + 4.05),
	);
}

function iceCreamKiosk(ctx: BuildContext, x: number, z: number): void {
	const parts: BufferGeometry[] = [
		box(1.9, 2.2, 2.4, 0xf6c9d8),
		box(2.2, 0.15, 2.7, 0xffffff, 0, 2.2),
		prism(2.6, 0.7, 2.8, 0xf4f4f4, 0, 2.35),
		box(0.1, 1, 2, 0x2b3a4a, 0.97, 0.9, 0),
		box(0.6, 0.1, 2.2, 0xe8463c, 1.2, 1.6, 0),
		glow(box(0.1, 0.5, 1.4, 0xff5fa8, 0.99, 2.0, 0), GLOW.always),
		place(cone(0.5, 1.2, 8, 0xd9a066), { rx: Math.PI, y: 4.35 }),
		place(paint(new IcosahedronGeometry(0.58, 0), 0xf6a8c8), { y: 4.7 }),
		place(paint(new IcosahedronGeometry(0.42, 0), 0xfff1c4), { y: 5.25 }),
	];
	ctx.statics.push(place(merge(parts), { x, y: CELL_Y, z, ry: Math.PI }));
}

function buildSand(ctx: BuildContext): CrowdSpot[] {
	const { rng, statics } = ctx;
	const spots: CrowdSpot[] = [];

	tikiBar(ctx, -77, 53, 0, 0xe8463c);
	tikiBar(ctx, -66.5, 53, 0, 0x3b7dd8);
	tikiBar(ctx, -53.3, 63, -Math.PI / 2, 0xf28c28);
	lifeguardTower(ctx, -80.5, 62);
	lifeguardTower(ctx, -80.5, 77);
	lifeguardTower(ctx, -62, 66);
	volleyball(ctx, -65.5, 76.5);
	iceCreamKiosk(ctx, -53.3, 76);

	const lampsAt: [number, number][] = [
		[-80, 55],
		[-58, 56],
		[-55.5, 81],
	];
	for (const [x, z] of lampsAt)
		statics.push(place(lamp(), { x, y: CELL_Y, z }));

	for (const x of [-77, -66.5])
		for (const dx of [-1, 0, 1])
			spots.push({ x: x + dx * 1.2, z: 55.4, y: CELL_Y });
	for (const dz of [-1, 0, 1])
		spots.push({ x: -56, z: 63 + dz * 1.2, y: CELL_Y });
	for (const dz of [-0.8, 0.8]) spots.push({ x: -56.2, z: 76 + dz, y: CELL_Y });
	for (const [x, z] of [
		[-70, 74.5],
		[-69, 78.5],
		[-61.5, 74.5],
		[-62, 78.5],
		[-66, 81.7],
		[-64, 81.7],
	] as const)
		spots.push({ x, z, y: CELL_Y + 0.03 });
	for (let x = -80; x <= -51; x += 5) {
		spots.push({ x, z: BOARD_Z + rng.range(-1, 1), y: SIDEWALK_Y });
	}
	for (let z = 53; z <= 81; z += 5) {
		spots.push({ x: BOARD_X + rng.range(-1, 1), z, y: SIDEWALK_Y });
	}

	const spaced: { x: number; z: number }[] = [];
	for (let attempt = 0; attempt < 4000 && spaced.length < 38; attempt++) {
		const x = rng.range(-81, -51.5);
		const z = rng.range(51.5, 81.5);
		if (
			BLOCKED.some(
				([x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1,
			)
		)
			continue;
		if (spaced.some((p) => Math.hypot(p.x - x, p.z - z) < 2.5)) continue;
		spaced.push({ x, z });
	}

	spaced.forEach(({ x, z }, i) => {
		const ry = rng.range(0, Math.PI * 2);
		statics.push(
			place(box(1, 0.05, 2, rng.pick(BRIGHTS)), {
				x,
				y: CELL_Y,
				z,
				ry,
			}),
		);
		if (i < 30) {
			const body = tintWhite(personLying(), rng.pick(SHIRTS));
			statics.push(place(body, { x, y: CELL_Y + 0.05, z, ry }));
		} else {
			spots.push({ x: x + 1.1, z: z + 0.4, y: CELL_Y });
		}
		// Parasol pole stands beside the towel's head, canopy overhanging it.
		const px = x + 0.9 * Math.cos(ry) - 0.5 * Math.sin(ry);
		const pz = z - 0.9 * Math.sin(ry) - 0.5 * Math.cos(ry);
		statics.push(
			cyl(0.04, 0.04, 1.8, 6, 0xeeeeee, px, CELL_Y, pz),
			cone(1.2, 0.5, 8, rng.pick(BRIGHTS), px, CELL_Y + 1.8, pz),
		);
	});
	return spots;
}

/** Sun lounger, head end toward -Z (to match `personLying`), origin on the sand. */
function lounger(x: number, z: number, cushion: number): BufferGeometry[] {
	return [
		box(0.66, 0.2, 1.25, cushion, x, CELL_Y, z + 0.3),
		place(box(0.66, 0.1, 0.8, cushion), {
			rx: 0.6,
			x,
			y: CELL_Y + 0.28,
			z: z - 0.45,
		}),
		box(0.5, 0.04, 0.06, 0xf4f4f4, x, CELL_Y + 0.2, z + 0.85),
	];
}

function parasol(
	x: number,
	z: number,
	y: number,
	col: number,
): BufferGeometry[] {
	return [
		cyl(0.04, 0.04, 2, 6, 0xeeeeee, x, y, z),
		cone(1.25, 0.55, 8, col, x, y + 2, z),
	];
}

/** A row of loungers at `z0` with a person lying on two of every three and a parasol per pair. */
function loungerRow(
	ctx: BuildContext,
	rnd: Rng,
	xs: readonly number[],
	z0: number,
): void {
	xs.forEach((x, i) => {
		ctx.statics.push(...lounger(x, z0, rnd.pick(BRIGHTS)));
		if (i % 3 !== 2) {
			ctx.statics.push(
				place(tintWhite(personLying(), rnd.pick(SHIRTS)), {
					x,
					y: CELL_Y + 0.2,
					z: z0 + 0.25,
				}),
			);
		}
		if (i % 2 === 1) {
			const prev = xs[i - 1] as number;
			ctx.statics.push(
				...parasol((x + prev) / 2, z0 - 0.45, CELL_Y, rnd.pick(BRIGHTS)),
			);
		}
	});
}

function sandcastle(ctx: BuildContext, x: number, z: number, s: number): void {
	const sand = 0xe3c58a;
	const parts: BufferGeometry[] = [
		box(1.6 * s, 0.4 * s, 1.6 * s, sand, 0, 0, 0),
		box(0.8 * s, 0.7 * s, 0.8 * s, 0xe9cd94, 0, 0.4 * s, 0),
		cone(0.36 * s, 0.5 * s, 6, 0xe8463c, 0, 1.1 * s, 0),
		cyl(0.02, 0.02, 0.5 * s, 4, 0xeeeeee, 0, 1.6 * s, 0),
		box(0.3 * s, 0.18 * s, 0.02, 0xf2c94c, 0.17 * s, 1.95 * s, 0),
	];
	for (const sx of [-1, 1]) {
		for (const sz of [-1, 1]) {
			parts.push(
				cyl(
					0.2 * s,
					0.22 * s,
					0.9 * s,
					6,
					0xdcbd80,
					sx * 0.7 * s,
					0,
					sz * 0.7 * s,
				),
				cone(
					0.26 * s,
					0.3 * s,
					6,
					0xc9a45a,
					sx * 0.7 * s,
					0.9 * s,
					sz * 0.7 * s,
				),
			);
		}
	}
	ctx.statics.push(place(merge(parts), { x, y: CELL_Y, z }));
}

/** Beach-soccer pitch (long axis X) with goals and a ball. */
function soccerPitch(ctx: BuildContext, cx: number, cz: number): void {
	const w = 12.2;
	const d = 8.2;
	const y = CELL_Y;
	const line = 0xffffff;
	const parts: BufferGeometry[] = [
		box(w, 0.03, d, 0xe3c98a, cx, y, cz),
		box(w, 0.01, 0.1, line, cx, y + 0.03, cz - d / 2 + 0.1),
		box(w, 0.01, 0.1, line, cx, y + 0.03, cz + d / 2 - 0.1),
		box(0.1, 0.01, d, line, cx - w / 2 + 0.1, y + 0.03, cz),
		box(0.1, 0.01, d, line, cx + w / 2 - 0.1, y + 0.03, cz),
		box(0.1, 0.01, d, line, cx, y + 0.03, cz),
		paint(new IcosahedronGeometry(0.16, 0), 0xffffff).translate(
			cx + 0.8,
			y + 0.2,
			cz - 0.6,
		),
	];
	for (const side of [-1, 1]) {
		const gx = cx + side * (w / 2 - 0.1);
		parts.push(
			cyl(0.05, 0.05, 1.5, 6, line, gx, y, cz - 1.5),
			cyl(0.05, 0.05, 1.5, 6, line, gx, y, cz + 1.5),
			box(0.08, 0.08, 3.1, line, gx, y + 1.5, cz),
			box(0.04, 1.4, 3, 0xe8e8e8, gx + side * 0.9, y, cz),
			box(0.9, 0.04, 3, 0xe8e8e8, gx + side * 0.45, y + 1.45, cz),
			box(0.9, 1.4, 0.04, 0xe8e8e8, gx + side * 0.45, y, cz - 1.5),
			box(0.9, 1.4, 0.04, 0xe8e8e8, gx + side * 0.45, y, cz + 1.5),
		);
	}
	ctx.statics.push(...parts);
}

/** Surf-school hut facing +X plus a rack of upright boards. */
function surfSchool(ctx: BuildContext, rnd: Rng): void {
	const parts: BufferGeometry[] = [
		box(3.6, 2.4, 3, 0x45b8c9, 0, 0, 0),
		prism(4.2, 1.1, 3.4, 0xf2c94c, 0, 2.4, 0),
		box(2, 0.9, 0.1, 0x1f2a33, 0, 1.1, 1.52),
		box(2.4, 0.12, 0.6, 0xd9a066, 0, 1, 1.8),
		box(1.4, 0.12, 1, 0xe8463c, -0.7, 2.2, 2),
		box(1.4, 0.12, 1, 0xffffff, 0.7, 2.2, 2),
		glow(box(2.6, 0.1, 0.1, 0x4cf0ff, 0, 2.2, 1.55), GLOW.always),
	];
	for (const [i, sx] of [-1, 1].entries()) {
		for (let k = 0; k < 3; k++) {
			parts.push(
				place(box(0.06, 2.2, 0.5, rnd.pick(BRIGHTS)), {
					rz: sx * 0.08,
					x: sx * (1.95 + k * 0.1),
					z: -0.9 + k * 0.9 + i * 0.2,
				}),
			);
		}
	}
	ctx.statics.push(
		place(merge(parts), { x: -80, y: CELL_Y, z: 68.8, ry: Math.PI / 2 }),
	);

	const rack: BufferGeometry[] = [
		box(0.1, 2, 0.1, 0x8a5a3c, -1.7, 0, 0.2),
		box(0.1, 2, 0.1, 0x8a5a3c, 1.7, 0, 0.2),
		box(3.4, 0.08, 0.1, 0x8a5a3c, 0, 0.5, 0.15),
		box(3.4, 0.08, 0.1, 0x8a5a3c, 0, 1.5, 0.15),
	];
	for (let i = 0; i < 8; i++) {
		rack.push(
			place(box(0.42, 2.1, 0.06, rnd.pick([...BRIGHTS, 0xffffff, 0x4cf0ff])), {
				rx: -0.08,
				x: -1.4 + i * 0.4,
				y: 0.1,
			}),
		);
	}
	ctx.statics.push(
		place(merge(rack), { x: -77.9, y: CELL_Y, z: 72.4, ry: Math.PI / 2 }),
	);
}

function kayak(ctx: BuildContext, x: number, z: number, col: number): void {
	ctx.statics.push(
		place(
			merge([
				box(0.62, 0.22, 2.8, col, 0, 0, 0),
				box(0.44, 0.2, 0.4, col, 0, 0.01, 1.5),
				box(0.44, 0.2, 0.4, col, 0, 0.01, -1.5),
				box(0.34, 0.1, 0.8, 0x2b3a4a, 0, 0.22, 0.1),
				box(2, 0.04, 0.08, 0xeeeeee, 0, 0.32, 0.1),
				box(0.1, 0.05, 0.3, 0x2b2b2b, 0.95, 0.31, 0.1),
				box(0.1, 0.05, 0.3, 0x2b2b2b, -0.95, 0.31, 0.1),
			]),
			{ x, y: CELL_Y, z },
		),
	);
}

/** Pool deck with coping, a hot tub, loungers and parasols beside the hotels. */
function resortPool(ctx: BuildContext, rnd: Rng): void {
	const y = CELL_Y;
	const top = y + 0.12;
	const px = -56.8;
	const pz = 54.2;
	const parts: BufferGeometry[] = [
		box(9.6, 0.12, 7, 0xe8e2d0, -56.8, y, 55.2),
		box(5.8, 0.14, 0.2, 0xffffff, px, top, pz - 1.5),
		box(5.8, 0.14, 0.2, 0xffffff, px, top, pz + 1.5),
		box(0.2, 0.14, 3.2, 0xffffff, px - 2.9, top, pz),
		box(0.2, 0.14, 3.2, 0xffffff, px + 2.9, top, pz),
		box(5.6, 0.08, 2.8, 0x4cc9f0, px, top, pz),
		cyl(1, 1, 0.25, 10, 0xf4f4f4, -52.9, top, 53.2),
		cyl(0.85, 0.85, 0.27, 10, 0x4cc9f0, -52.9, top, 53.2),
		// Pool ladder and a little diving board.
		box(0.06, 0.5, 0.06, 0xc9ccd1, px + 2.2, top, pz - 1.35),
		box(0.9, 0.08, 0.35, 0xf2c94c, px - 2.2, top + 0.3, pz + 1.9),
	];
	for (const x of [-60.4, -59, -57.6, -56.2, -54.8, -53.4]) {
		parts.push(
			...lounger(x, 57.1, rnd.pick(BRIGHTS)).map((g) =>
				g.translate(0, 0.12, 0),
			),
		);
	}
	for (const x of [-59.7, -56.9, -54.1]) {
		parts.push(...parasol(x, 56.75, top, rnd.pick(BRIGHTS)));
	}
	for (const [i, x] of [-60.4, -59, -56.2, -54.8].entries()) {
		parts.push(
			place(
				tintWhite(personLying(), SHIRTS[(i * 2 + 1) % SHIRTS.length] as number),
				{
					x,
					y: top + 0.2,
					z: 57.35,
				},
			),
		);
	}
	ctx.statics.push(...parts);
	for (const [x, z] of [
		[-62.4, 52.6],
		[-62.4, 58.4],
	] as const) {
		ctx.statics.push(place(palm(), { x, y, z, ry: rnd.range(0, Math.PI * 2) }));
	}
}

/** Cafe table with a parasol and two chairs on the boardwalk. */
function cafeSet(
	x: number,
	z: number,
	col: number,
	alongZ = false,
): BufferGeometry {
	return merge([
		cyl(0.4, 0.4, 0.05, 10, 0xf4f4f4, x, SIDEWALK_Y + 0.72, z),
		cyl(0.05, 0.05, 0.72, 5, 0x777777, x, SIDEWALK_Y, z),
		cyl(0.03, 0.03, 2.2, 5, 0xeeeeee, x, SIDEWALK_Y, z),
		cone(1.25, 0.5, 8, col, x, SIDEWALK_Y + 2.2, z),
		box(
			0.32,
			0.45,
			0.32,
			0x8a5a3c,
			x + (alongZ ? 0 : 0.62),
			SIDEWALK_Y,
			z + (alongZ ? 0.62 : 0),
		),
		box(
			0.32,
			0.45,
			0.32,
			0x8a5a3c,
			x - (alongZ ? 0 : 0.62),
			SIDEWALK_Y,
			z - (alongZ ? 0.62 : 0),
		),
	]);
}

/** Everything added to the open sand and the hotel frontage; returns standing-crowd spots. */
function buildBeachLife(ctx: BuildContext): CrowdSpot[] {
	const rnd = mulberry32(WORLD_SEED ^ 0xbeac4);
	const s = ctx.statics;
	const y = CELL_Y;
	const spots: CrowdSpot[] = [];

	resortPool(ctx, rnd);
	soccerPitch(ctx, -71.5, 63.5);
	surfSchool(ctx, rnd);
	for (const x of [-81, -80]) {
		kayak(ctx, x, 54, rnd.pick(BRIGHTS));
		kayak(ctx, x, 57.8, rnd.pick(BRIGHTS));
	}
	loungerRow(
		ctx,
		rnd,
		[-78.2, -76.35, -74.5, -72.65, -70.8, -68.95, -67.1, -65.25, -63.4],
		57,
	);
	loungerRow(ctx, rnd, [-75.6, -73.75, -71.9, -70.05, -68.2, -66.35], 69);
	for (const z0 of [67, 69.9]) {
		loungerRow(ctx, rnd, [-57.2, -55.5, -53.8, -52.1], z0);
	}
	for (const [x, z, k] of [
		[-62.4, 60.9, 1],
		[-57, 60.4, 0.9],
		[-75.8, 74, 1],
		[-75.8, 79.2, 0.9],
		[-70, 81.5, 1],
		[-60.5, 81.5, 1.1],
	] as const) {
		sandcastle(ctx, x, z, k);
		spots.push({ x: x + 1.3, z: z + 0.4, y }, { x: x - 1.2, z: z + 0.9, y });
	}

	// More palms: west edge, south edge, boardwalk side and around the pitch.
	for (const [x, z] of [
		[-81.8, 64.4],
		[-81.8, 81],
		[-77.5, 81.9],
		[-66.5, 81.9],
		[-57.3, 81.9],
		[-50.3, 63],
		[-50.3, 66.5],
		[-50.3, 76.6],
		[-78.6, 58.8],
		[-64.4, 58.9],
	] as const) {
		s.push(place(palm(), { x, y, z, ry: rnd.range(0, Math.PI * 2) }));
	}

	// Hotel terraces: cafe sets on the boardwalk in front of both hotel rows.
	const terrace: BufferGeometry[] = [];
	for (const cx of [-80.2, -71, -62.5, -52.5]) {
		for (const dx of [-0.8, 0.8]) {
			terrace.push(cafeSet(cx + dx, 45.75, rnd.pick(BRIGHTS)));
			spots.push({
				x: cx + dx + 0.62,
				z: 45.8,
				y: SIDEWALK_Y,
				ry: -Math.PI / 2,
			});
		}
	}
	for (const cz of [52.5, 63, 73]) {
		for (const dz of [-0.9, 0.9]) {
			terrace.push(cafeSet(-45.8, cz + dz, rnd.pick(BRIGHTS), true));
			spots.push({ x: -45.8, z: cz + dz + 0.62, y: SIDEWALK_Y });
		}
	}
	s.push(...terrace);

	// Standing beach-goers: pitch players, surf class, pool deck, lounger rows.
	for (const [x, z] of [
		[-75.5, 61.5],
		[-73, 65.5],
		[-71.5, 62.5],
		[-69.5, 64.5],
		[-67.5, 61],
		[-70.5, 66.5],
		[-74.5, 63.5],
		[-66.8, 65.8],
	] as const) {
		spots.push({ x, z, y: y + 0.03 });
	}
	for (const [x, z] of [
		[-77.4, 68],
		[-77.1, 69.2],
		[-77.5, 70.2],
		[-78.2, 75.4],
	] as const) {
		spots.push({ x, z, y, ry: Math.PI / 2 });
	}
	for (const [x, z] of [
		[-60.6, 54.2],
		[-58.4, 51.9],
		[-55.2, 51.9],
		[-53.2, 55.2],
		[-52.6, 51.9],
	] as const) {
		spots.push({ x, z, y: y + 0.12 });
	}
	for (const x of [-77, -73.5, -70, -66.5]) spots.push({ x, z: 58.9, y });
	for (const x of [-74.5, -71, -67.5]) spots.push({ x, z: 71.4, y });
	return spots;
}

function buildPier(ctx: BuildContext): void {
	const s = ctx.statics;
	const rampRun = 8;
	const flatStart = -LAND_HALF - rampRun;
	const flatEnd = -119;
	const flatLen = flatStart - flatEnd;
	const flatMid = (flatStart + flatEnd) / 2;
	const angle = Math.atan2(PIER_TOP - 0.2, rampRun);
	const rampLen = Math.hypot(rampRun, PIER_TOP - 0.2);

	// Ramp from the island edge (deck top 0.2) up to the main deck (top 1.2).
	s.push(
		place(box(rampLen, 0.3, 4, PIER_WOOD, 0, -0.3, 0), {
			rz: -angle,
			x: -LAND_HALF - rampRun / 2,
			y: (0.2 + PIER_TOP) / 2,
			z: PIER_Z,
		}),
		box(flatLen, 0.3, 4, PIER_WOOD, flatMid, PIER_TOP - 0.3, PIER_Z),
	);

	for (const side of [-1, 1]) {
		const z = PIER_Z + side * 1.85;
		s.push(
			box(flatLen, 0.08, 0.1, PIER_RAIL, flatMid, PIER_TOP + 0.85, z),
			box(flatLen, 0.06, 0.06, PIER_RAIL, flatMid, PIER_TOP + 0.45, z),
		);
		for (let x = flatStart - 0.5; x >= flatEnd + 0.5; x -= 4) {
			s.push(
				cyl(
					0.25,
					0.25,
					PIER_TOP - 0.3 + 2,
					6,
					0x6b4f33,
					x,
					-2,
					PIER_Z + side * 1.7,
				),
				box(0.1, 0.9, 0.1, PIER_RAIL, x, PIER_TOP, z),
			);
		}
	}
	s.push(
		place(lamp(), { x: flatEnd + 0.8, y: PIER_TOP, z: PIER_Z - 1.6 }),
		place(lamp(), { x: flatEnd + 0.8, y: PIER_TOP, z: PIER_Z + 1.6 }),
	);
}

function buildLighthouse(ctx: BuildContext): void {
	const s = ctx.statics;
	const { x, z } = ISLET;
	const rockTop = 1;
	const height = 8;
	const bands = 6;

	s.push(
		cyl(3, 3.5, 1.5, 8, ROCK, x, -0.5, z),
		cyl(1.5, 2, 1, 6, darken(ROCK, 0.9), x + 2.5, -0.5, z + 2),
	);
	const tower = cyl(1.2, 1.4, height, 8, 0xffffff, x, rockTop, z);
	s.push(
		paintBy(tower, (_x, y) =>
			Math.floor(((y - rockTop) / height) * bands) % 2 === 0
				? 0xd8453a
				: 0xffffff,
		),
	);
	const top = rockTop + height;
	s.push(
		box(2.4, 0.3, 2.4, 0x333333, x, top, z),
		box(1.6, 1.2, 1.6, 0xfff1a8, x, top + 0.3, z),
		cone(1.4, 1.1, 8, 0xd8453a, x, top + 1.5, z),
	);

	const beam = new Mesh(
		new BoxGeometry(14, 0.3, 0.6),
		new MeshBasicNodeMaterial({
			color: 0xfff1a8,
			transparent: true,
			opacity: 0.45,
			depthWrite: false,
		}),
	);
	beam.position.set(x, top + 0.9, z);
	ctx.group.add(beam);
	ctx.agents.push(new BeaconAgent(beam));
}

/**
 * Beach cell: seafront hotel row, boardwalk, bars, lifeguards, volleyball, a crowd, plus the
 * island shoreline, pier + lighthouse and the boats that sail around them.
 * Also creates the sailboat and ferry pools (`createBoats`), so do not call that separately.
 */
export function buildBeach(ctx: BuildContext): void {
	buildShore(ctx);
	buildBoardwalk(ctx);
	buildHotels(ctx);
	const spots = buildSand(ctx);
	spots.push(...buildBeachLife(ctx));
	buildPier(ctx);
	buildLighthouse(ctx);
	createBoats(ctx);
	[-103, -106.5, -110, -113.5, -116.5].forEach((x, i) => {
		spots.push({
			x,
			z: PIER_Z + (i % 2 === 0 ? 1.4 : -1.4),
			y: PIER_TOP,
			ry: Math.PI / 2,
		});
	});
	createCrowd(ctx, spots, { count: 112, spread: 0.45 });
}
