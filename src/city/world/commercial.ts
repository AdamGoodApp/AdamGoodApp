import { Vector3 } from "three";
import { box, cone, cyl, place } from "../geometry";
import { TILE } from "../kit/atlas";
import { apartment, type Lot, office, walkup } from "../kit/buildings";
import { BRIGHTS, CARS, GRASS, LANE, ROAD, SIDEWALK, WHITE } from "../palette";
import { bench, car, lamp, roundTree } from "../prefabs";
import { type CrowdSpot, createCrowd } from "../sim/crowd";
import { Polyline } from "../sim/path";
import { buildCivicServices, SERVICES_WEST_EDGE } from "./civic-services";
import type { BuildContext } from "./context";
import { ROAD_Y, SIDEWALK_Y } from "./layout";
import { type SignSpec, signMesh } from "./signs";
import { tintWhite } from "./tint";

/** Inner edges of the cell, between the avenue/ring sidewalks. */
const IN_MIN_X = 34.5;
const IN_MAX_X = 82.5;
const IN_MIN_Z = -25.5;
const IN_MAX_Z = 25.5;
/** Sidewalk centrelines of the bordering avenues / ring road. */
const WEST_WALK = 33.75;
const EAST_WALK = 83.25;
const NORTH_WALK = -26.25;
const SOUTH_WALK = 26.25;

const NS_X = 58;
const STREET_W = 4;
const WALK = 1.5;
const WALK_OFFSET = STREET_W / 2 + WALK / 2;
/** Buildings start this far from the street centrelines (road half-width + sidewalk). */
const BUILD_OFFSET = STREET_W / 2 + WALK;
/** West buildings leave a thin strip for avenue-side trees. */
const WEST_EDGE = 35.4;
const WEST_BLOCK_END = NS_X - BUILD_OFFSET;
const EAST_BLOCK_START = NS_X + BUILD_OFFSET;

/** Centre height of the shop sign boards, and their offset in front of the wall. */
const SIGN_Y = 4.5;
const SIGN_OFFSET = 0.2;
const SIGN_W = 3.6;
const SIGN_H = 0.9;

const LABELS = [
	"TYPESCRIPT",
	"REACT",
	"PYTHON",
	"RUST",
	"AI LAB",
	"NODE",
	"GO",
	"THREE.JS",
] as const;

type Front = "south" | "north" | "east" | "west";
/** Rotation that turns a building's +Z front toward the named direction. */
const FRONT_RY: Record<Front, number> = {
	south: 0,
	north: Math.PI,
	east: Math.PI / 2,
	west: -Math.PI / 2,
};

interface Rect {
	x0: number;
	x1: number;
	z0: number;
	z1: number;
}

/** Shoulder-to-shoulder lots filling `r`, fronts facing `front`. */
function stripLots(r: Rect, front: Front, n: number): Lot[] {
	const alongX = front === "south" || front === "north";
	const w = (alongX ? r.x1 - r.x0 : r.z1 - r.z0) / n;
	const d = alongX ? r.z1 - r.z0 : r.x1 - r.x0;
	const ry = FRONT_RY[front];
	const lots: Lot[] = [];
	for (let i = 0; i < n; i++) {
		const t = (i + 0.5) * w;
		lots.push(
			alongX
				? { x: r.x0 + t, z: (r.z0 + r.z1) / 2, w, d, ry }
				: { x: (r.x0 + r.x1) / 2, z: r.z0 + t, w, d, ry },
		);
	}
	return lots;
}

function rectLot(r: Rect, front: Front): Lot {
	return {
		x: (r.x0 + r.x1) / 2,
		z: (r.z0 + r.z1) / 2,
		w: front === "south" || front === "north" ? r.x1 - r.x0 : r.z1 - r.z0,
		d: front === "south" || front === "north" ? r.z1 - r.z0 : r.x1 - r.x0,
		ry: FRONT_RY[front],
	};
}

function mountSign(
	ctx: BuildContext,
	signs: SignSpec[],
	lot: Lot,
	label: string,
): void {
	const ry = lot.ry ?? 0;
	const off = lot.d / 2 + SIGN_OFFSET;
	signs.push({
		label,
		width: SIGN_W,
		height: SIGN_H,
		position: [lot.x + Math.sin(ry) * off, SIGN_Y, lot.z + Math.cos(ry) * off],
		ry,
	});
	ctx.statics.push(
		place(box(SIGN_W + 0.3, 1.1, 0.12, 0x1b1b1f, 0, 3.95, lot.d / 2 + 0.1), {
			x: lot.x,
			z: lot.z,
			ry,
		}),
	);
}

function busStop(ctx: BuildContext, z: number): void {
	const x = 35.4;
	const y = SIDEWALK_Y;
	ctx.statics.push(
		box(1.2, 0.1, 3, 0x5a5d62, x, y + 2.4, z),
		cyl(0.05, 0.05, 2.4, 6, 0x555555, x + 0.5, y, z - 1.3),
		cyl(0.05, 0.05, 2.4, 6, 0x555555, x + 0.5, y, z + 1.3),
		box(0.06, 1.8, 2.8, 0x9fc4d8, x + 0.55, y + 0.4, z),
		box(0.45, 0.08, 2.2, 0x8a5a3c, x + 0.15, y + 0.5, z),
		box(0.4, 0.4, 0.08, 0x444444, x + 0.15, y, z - 0.9),
		box(0.4, 0.4, 0.08, 0x444444, x + 0.15, y, z + 0.9),
	);
}

const TREES_EW_NORTH = [38, 45.5, 52, 63.5, 70.5, 80] as const;
const LAMPS_EW_NORTH = [41.5, 49, 66.5, 75.5] as const;
const TREES_EW_SOUTH = [39, 47, 53.5, 63.5, 71, 78] as const;
const LAMPS_EW_SOUTH = [43, 51, 67, 75] as const;
const TREES_NS = [-21, -14, -7.5, 7.5, 14, 21] as const;
const LAMPS_NS = [-17.5, -10.5, 10.5, 17.5] as const;
const AVENUE_TREES_Z = [-22, -9, 9, 22] as const;

const CAFE_TABLES_X = [39.2, 41.5, 43.8] as const;
const CAFE_TABLES_Z = [14.2, 17.2, 20.2] as const;

function streets(ctx: BuildContext): void {
	const { statics } = ctx;
	const ewLen = IN_MAX_X - IN_MIN_X;
	const ewMid = (IN_MIN_X + IN_MAX_X) / 2;
	statics.push(
		box(ewLen, ROAD_Y, STREET_W, ROAD, ewMid, 0, 0),
		box(STREET_W, ROAD_Y, IN_MAX_Z - IN_MIN_Z, ROAD, NS_X, 0, 0),
	);
	for (let x = IN_MIN_X + 2; x < IN_MAX_X; x += 4) {
		if (Math.abs(x - NS_X) < 5) continue;
		statics.push(box(1.6, 0.02, 0.2, LANE, x, ROAD_Y, 0));
	}
	for (let z = IN_MIN_Z + 2; z < IN_MAX_Z; z += 4) {
		if (Math.abs(z) < 5) continue;
		statics.push(box(0.2, 0.02, 1.6, LANE, NS_X, ROAD_Y, z));
	}
	// Zebra crossings on the four arms of the intersection.
	for (const k of [-1, 0, 1]) {
		const o = k * 0.5;
		const edge = NS_X - STREET_W / 2 - WALK / 2;
		const edgeE = NS_X + STREET_W / 2 + WALK / 2;
		statics.push(
			box(0.3, 0.02, STREET_W - 0.4, LANE, edge + o, ROAD_Y, 0),
			box(0.3, 0.02, STREET_W - 0.4, LANE, edgeE + o, ROAD_Y, 0),
			box(STREET_W - 0.4, 0.02, 0.3, LANE, NS_X, ROAD_Y, -WALK_OFFSET + o),
			box(STREET_W - 0.4, 0.02, 0.3, LANE, NS_X, ROAD_Y, WALK_OFFSET + o),
		);
	}
	// One pavement slab per block (the sidewalks run along its street edges).
	const west: [number, number] = [IN_MIN_X, NS_X - STREET_W / 2];
	const east: [number, number] = [NS_X + STREET_W / 2, IN_MAX_X];
	const north: [number, number] = [IN_MIN_Z, -STREET_W / 2];
	const south: [number, number] = [STREET_W / 2, IN_MAX_Z];
	for (const [x0, x1] of [west, east]) {
		for (const [z0, z1] of [north, south]) {
			statics.push(
				box(
					x1 - x0,
					SIDEWALK_Y,
					z1 - z0,
					SIDEWALK,
					(x0 + x1) / 2,
					0,
					(z0 + z1) / 2,
				),
			);
		}
	}
}

function parkingLot(ctx: BuildContext, rect: Rect): void {
	const { rng, statics } = ctx;
	const w = rect.x1 - rect.x0;
	const d = rect.z1 - rect.z0;
	const cx = (rect.x0 + rect.x1) / 2;
	const top = SIDEWALK_Y + 0.03;
	statics.push(
		box(w, 0.03, d, 0x585b61, cx, SIDEWALK_Y, (rect.z0 + rect.z1) / 2),
	);
	const slots = 5;
	const pitch = d / slots;
	const rows = [
		{ x: rect.x0 + 2.4, ry: Math.PI / 2 },
		{ x: rect.x1 - 2.6, ry: -Math.PI / 2 },
	];
	for (const row of rows) {
		for (let k = 0; k <= slots; k++) {
			statics.push(box(4.4, 0.01, 0.1, LANE, row.x, top, rect.z0 + k * pitch));
		}
		for (let k = 0; k < slots; k++) {
			if (rng() < 0.3) continue;
			statics.push(
				place(tintWhite(car(), rng.pick(CARS)), {
					x: row.x,
					y: top,
					z: rect.z0 + (k + 0.5) * pitch,
					ry: row.ry,
				}),
			);
		}
	}
	statics.push(
		box(
			0.6,
			0.7,
			d,
			0x4f8f4a,
			rect.x1 - 0.2,
			SIDEWALK_Y,
			(rect.z0 + rect.z1) / 2,
		),
		place(lamp(), { x: cx, y: SIDEWALK_Y, z: rect.z1 - 0.3 }),
	);
}

function cafeTerrace(ctx: BuildContext): void {
	const { rng, statics } = ctx;
	statics.push(box(7.9, 0.05, 11, 0xc9a27a, 41.45, SIDEWALK_Y, 17.5));
	const deckY = SIDEWALK_Y + 0.05;
	for (const tx of CAFE_TABLES_X) {
		for (const tz of CAFE_TABLES_Z) {
			statics.push(
				cyl(0.05, 0.05, 0.75, 6, 0x555555, tx, deckY, tz),
				cyl(0.5, 0.5, 0.1, 10, WHITE, tx, deckY + 0.75, tz),
				cyl(0.04, 0.04, 2.2, 6, 0x777777, tx, deckY, tz),
				cone(1.05, 0.5, 8, rng.pick(BRIGHTS), tx, deckY + 2.2, tz),
				box(0.35, 0.45, 0.35, 0x8a5a3c, tx - 0.85, deckY, tz),
				box(0.35, 0.45, 0.35, 0x8a5a3c, tx + 0.85, deckY, tz),
			);
		}
	}
	for (const x of [38.5, 43.5]) {
		statics.push(place(roundTree(0.55), { x, y: SIDEWALK_Y, z: 24.3 }));
	}
	statics.push(place(lamp(), { x: 37, y: SIDEWALK_Y, z: 24.3 }));
}

function pocketGarden(ctx: BuildContext): void {
	const y = SIDEWALK_Y + 0.04;
	ctx.statics.push(
		box(10.1, 0.04, 4, GRASS, 40.45, SIDEWALK_Y, -14.5),
		place(roundTree(0.6), { x: 38.5, y, z: -14.5 }),
		place(roundTree(0.6), { x: 43, y, z: -14.2 }),
		place(bench(), { x: 40.8, y, z: -16.1 }),
		place(lamp(), { x: 44.8, y, z: -14.5 }),
	);
}

function streetFurniture(ctx: BuildContext): void {
	const { rng, statics } = ctx;
	const y = SIDEWALK_Y;
	const curb = STREET_W / 2 + 0.1;
	for (const x of TREES_EW_NORTH) {
		statics.push(place(roundTree(rng.range(0.5, 0.6)), { x, y, z: -curb }));
	}
	for (const x of TREES_EW_SOUTH) {
		statics.push(place(roundTree(rng.range(0.5, 0.6)), { x, y, z: curb }));
	}
	for (const x of LAMPS_EW_NORTH)
		statics.push(place(lamp(), { x, y, z: -curb }));
	for (const x of LAMPS_EW_SOUTH)
		statics.push(place(lamp(), { x, y, z: curb }));
	for (const side of [-1, 1]) {
		const x = NS_X + side * curb;
		for (const z of TREES_NS) {
			statics.push(place(roundTree(rng.range(0.5, 0.6)), { x, y, z }));
		}
		for (const z of LAMPS_NS) statics.push(place(lamp(), { x, y, z }));
	}
	for (const z of AVENUE_TREES_Z) {
		statics.push(place(roundTree(0.5), { x: WEST_EDGE - 0.45, y, z }));
	}
	statics.push(
		place(bench(), { x: 55.1, y, z: -9, ry: Math.PI / 2 }),
		place(bench(), { x: 61, y, z: -8, ry: -Math.PI / 2 }),
		place(bench(), { x: 55.1, y, z: 9, ry: Math.PI / 2 }),
		place(bench(), { x: 61, y, z: 9, ry: -Math.PI / 2 }),
	);
}

function shopperSpots(): CrowdSpot[] {
	const spots: CrowdSpot[] = [];
	const y = SIDEWALK_Y;
	for (const x of [38, 43, 49, 52, 64, 69, 74, 79]) {
		spots.push({ x, z: -2.95, y });
	}
	for (const x of [40, 46, 52, 64, 67, 73, 79]) {
		spots.push({ x, z: 2.95, y });
	}
	for (const z of [-22, -18, -14, 6, 12, 18, 22]) {
		spots.push({ x: 55, z, y });
	}
	for (const z of [-20, -8, 8, 16, 22]) {
		spots.push({ x: 61, z, y });
	}
	const deckY = SIDEWALK_Y + 0.05;
	for (const [x, z] of [
		[40.3, 15.7],
		[42.7, 15.7],
		[40.3, 18.7],
		[43.8, 18.7],
		[39.2, 21.7],
		[42.7, 21.7],
	] as const) {
		spots.push({ x, z, y: deckY });
	}
	spots.push({ x: 74.5, z: 23, y }, { x: 78.5, z: 23, y });
	return spots;
}

export function buildCommercial(ctx: BuildContext): void {
	const { rng } = ctx;
	const signs: SignSpec[] = [];
	const labels = [...LABELS];

	streets(ctx);

	// NW block: shop row on the E–W street, shop row on the N–S street, apartment tower at the back.
	const nwRowA = stripLots(
		{ x0: WEST_EDGE, x1: WEST_BLOCK_END, z0: -12.5, z1: -BUILD_OFFSET },
		"south",
		3,
	);
	const nwRowB = stripLots(
		{ x0: 45.5, x1: WEST_BLOCK_END, z0: IN_MIN_Z, z1: -12.5 },
		"east",
		2,
	);
	for (const lot of [...nwRowA, ...nwRowB]) {
		walkup(ctx, lot, { floors: rng.int(3, 5) });
		const label = labels.shift();
		if (label) mountSign(ctx, signs, lot, label);
	}
	apartment(
		ctx,
		rectLot({ x0: WEST_EDGE, x1: 45.5, z0: IN_MIN_Z, z1: -16.5 }, "south"),
		{ floors: 8 },
	);
	pocketGarden(ctx);
	busStop(ctx, -14.5);

	// NE block: shops on the E–W street stepping down toward the ring road, office tower, rear lot.
	const neRowA = stripLots(
		{ x0: EAST_BLOCK_START, x1: IN_MAX_X, z0: -12.5, z1: -BUILD_OFFSET },
		"south",
		3,
	);
	const neFloors = [4, 3, 3];
	neRowA.forEach((lot, i) => {
		walkup(ctx, lot, { floors: neFloors[i] });
		const label = labels.shift();
		if (label) mountSign(ctx, signs, lot, label);
	});
	office(
		ctx,
		rectLot(
			{ x0: EAST_BLOCK_START, x1: 72.5, z0: IN_MIN_Z, z1: -13.5 },
			"south",
		),
		{ floors: 10, setback: true },
	);
	parkingLot(ctx, { x0: 72.5, x1: IN_MAX_X, z0: IN_MIN_Z, z1: -13.5 });

	// SW block: corner café with a terrace, a wide department store, shops on the N–S street.
	const cafe = rectLot(
		{ x0: WEST_EDGE, x1: 45.5, z0: BUILD_OFFSET, z1: 11.5 },
		"south",
	);
	walkup(ctx, cafe, { floors: 2, ground: TILE.storeGlass });
	mountSign(ctx, signs, cafe, "CAFE");
	walkup(
		ctx,
		rectLot(
			{ x0: 45.5, x1: WEST_BLOCK_END, z0: BUILD_OFFSET, z1: 12.5 },
			"north",
		),
		{ floors: 4 },
	);
	for (const lot of stripLots(
		{ x0: 45.5, x1: WEST_BLOCK_END, z0: 12.5, z1: IN_MAX_Z },
		"east",
		2,
	)) {
		walkup(ctx, lot, { floors: rng.int(3, 4) });
	}
	cafeTerrace(ctx);
	busStop(ctx, 15);

	// SE block: civic services at the ring/avenue corner, shops on the N–S street.
	const seFloors = [4, 3, 3];
	stripLots(
		{
			x0: EAST_BLOCK_START,
			x1: SERVICES_WEST_EDGE,
			z0: BUILD_OFFSET,
			z1: IN_MAX_Z,
		},
		"west",
		3,
	).forEach((lot, i) => {
		walkup(ctx, lot, { floors: seFloors[i] });
	});
	buildCivicServices(ctx, signs);

	streetFurniture(ctx);
	createCrowd(ctx, shopperSpots(), { count: 40, spread: 0.4 });
	ctx.group.add(signMesh(signs));

	// Pedestrian network.
	const y = SIDEWALK_Y;
	for (const side of [-1, 1]) {
		const sz = side * WALK_OFFSET;
		ctx.sidewalks.push(
			new Polyline(
				[new Vector3(WEST_WALK, y, sz), new Vector3(EAST_WALK, y, sz)],
				false,
			),
			new Polyline(
				[
					new Vector3(NS_X + sz, y, NORTH_WALK),
					new Vector3(NS_X + sz, y, SOUTH_WALK),
				],
				false,
			),
		);
	}
}
