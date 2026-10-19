import { type BufferGeometry, Vector3 } from "three";
import { box, cone, cyl, merge, place } from "../geometry";
import { TILE } from "../kit/atlas";
import { apartment, type Lot, office, walkup } from "../kit/buildings";
import { FLOOR_H } from "../kit/facade";
import {
	BRIGHTS,
	CARS,
	darken,
	GRASS,
	LANE,
	ROAD,
	SHIRTS,
	SIDEWALK,
	WHITE,
} from "../palette";
import { bench, car, lamp, person, roundTree } from "../prefabs";
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
			const sz = rect.z0 + (k + 0.5) * pitch;
			if (row === rows[1] && k === slots - 1) {
				foodTruck(ctx, row.x, top, sz, 0xf28c28, 0xe8463c);
				continue;
			}
			if (rng() < 0.15) continue;
			statics.push(
				place(tintWhite(car(), rng.pick(CARS)), {
					x: row.x,
					y: top,
					z: sz,
					ry: row.ry,
				}),
			);
		}
	}
	for (const z of [-23.5, -20, -16.5]) {
		statics.push(
			place(roundTree(0.45), { x: rect.x1 - 0.2, y: SIDEWALK_Y + 0.7, z }),
		);
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
		place(roundTree(0.35), { x: 36.9, y, z: -16 }),
		place(roundTree(0.35), { x: 44.2, y, z: -12.9 }),
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

const WOOD = 0x8a5a3c;
const DARK = 0x2b2d31;
const HEDGE = 0x3f8a4a;

/** Which way a pavement strip runs and where shop-front fixtures sit on it. */
interface Walk {
	/** Coordinate (z for E–W strips, x for N–S) hugged by wall-side fixtures. */
	wall: number;
	/** Strip centreline coordinate, where bikes are parked. */
	mid: number;
	alongZ: boolean;
}

type Kind = "bin" | "pl" | "news" | "rack";
type Entry = readonly [Kind, number];

function bin(ctx: BuildContext, x: number, z: number): void {
	const y = SIDEWALK_Y;
	ctx.statics.push(
		cyl(
			0.22,
			0.2,
			0.8,
			8,
			ctx.rng.pick([0x3f6f4a, 0x3a5f8a, 0x555a60]),
			x,
			y,
			z,
		),
		cyl(0.24, 0.24, 0.08, 8, DARK, x, y + 0.8, z),
	);
}

function planter(
	ctx: BuildContext,
	x: number,
	z: number,
	alongZ: boolean,
): void {
	const y = SIDEWALK_Y;
	const w = alongZ ? 0.45 : 1;
	const d = alongZ ? 1 : 0.45;
	ctx.statics.push(
		box(w, 0.4, d, WOOD, x, y, z),
		box(w - 0.1, 0.18, d - 0.1, HEDGE, x, y + 0.4, z),
	);
	for (const k of [-0.3, 0, 0.3]) {
		ctx.statics.push(
			box(
				0.22,
				0.16,
				0.22,
				ctx.rng.pick(BRIGHTS),
				alongZ ? x : x + k,
				y + 0.58,
				alongZ ? z + k : z,
			),
		);
	}
}

function newsStand(
	ctx: BuildContext,
	x: number,
	z: number,
	alongZ: boolean,
): void {
	const y = SIDEWALK_Y;
	const col = ctx.rng.pick(BRIGHTS);
	const w = alongZ ? 0.5 : 0.7;
	const d = alongZ ? 0.7 : 0.5;
	ctx.statics.push(
		box(w, 1, d, col, x, y, z),
		box(w + 0.1, 0.1, d + 0.1, WHITE, x, y + 1, z),
		box(w - 0.1, 0.25, d - 0.1, 0xf4efe0, x, y + 0.55, z),
	);
}

function hydrant(ctx: BuildContext, x: number, z: number): void {
	const y = SIDEWALK_Y;
	ctx.statics.push(
		cyl(0.13, 0.15, 0.55, 6, 0xd62828, x, y, z),
		cyl(0.17, 0.17, 0.07, 6, 0xd62828, x, y + 0.55, z),
	);
}

/** One parked bicycle at 0.8 scale, frame along local z. */
function bike(col: number): BufferGeometry {
	const wheel = (z: number) =>
		place(cyl(0.3, 0.3, 0.05, 8, DARK, 0, -0.025, 0), {
			rz: Math.PI / 2,
			y: 0.3,
			z,
		});
	return merge([
		wheel(0.45),
		wheel(-0.45),
		box(0.04, 0.04, 0.9, col, 0, 0.4, 0),
		box(0.04, 0.45, 0.04, col, 0, 0.35, -0.3),
		box(0.4, 0.04, 0.04, DARK, 0, 0.82, 0.4),
		box(0.04, 0.4, 0.04, col, 0, 0.4, 0.4),
		box(0.12, 0.05, 0.22, DARK, 0, 0.8, -0.3),
	]);
}

function bikeRack(ctx: BuildContext, w: Walk, a: number): void {
	const y = SIDEWALK_Y;
	const ry = w.alongZ ? Math.PI / 2 : 0;
	for (const k of [-0.5, 0, 0.5]) {
		const x = w.alongZ ? w.mid : a + k;
		const z = w.alongZ ? a + k : w.mid;
		ctx.statics.push(
			place(bike(ctx.rng.pick(CARS)), {
				x,
				y,
				z,
				ry,
				sx: 0.8,
				sy: 0.8,
				sz: 0.8,
			}),
		);
	}
	for (const k of [-0.85, 0.85]) {
		const x = w.alongZ ? w.wall : a + k;
		const z = w.alongZ ? a + k : w.wall;
		ctx.statics.push(box(0.06, 0.5, 0.06, 0x888c92, x, y, z));
	}
}

function fixtures(ctx: BuildContext, w: Walk, list: readonly Entry[]): void {
	for (const [kind, a] of list) {
		const x = w.alongZ ? w.wall : a;
		const z = w.alongZ ? a : w.wall;
		if (kind === "bin") bin(ctx, x, z);
		else if (kind === "pl") planter(ctx, x, z, w.alongZ);
		else if (kind === "news") newsStand(ctx, x, z, w.alongZ);
		else bikeRack(ctx, w, a);
	}
}

function stall(
	ctx: BuildContext,
	x: number,
	z: number,
	ry: number,
	canopy: number,
	y = SIDEWALK_Y,
): void {
	const parts: BufferGeometry[] = [
		box(1.8, 0.85, 0.8, WOOD, 0, 0, 0),
		box(2.1, 0.1, 1.3, canopy, 0, 2.1, 0),
		box(2.1, 0.25, 0.05, WHITE, 0, 1.85, 0.65),
	];
	for (const sx of [-0.95, 0.95]) {
		for (const sz of [-0.5, 0.5]) {
			parts.push(cyl(0.04, 0.04, 2.1, 6, 0x777777, sx, 0, sz));
		}
	}
	for (const k of [-0.6, 0, 0.6]) {
		parts.push(
			box(0.4, 0.25, 0.4, ctx.rng.pick(BRIGHTS), k, 0.85, 0),
			cone(0.15, 0.2, 6, 0x58c27a, k, 1.1, 0),
		);
	}
	ctx.statics.push(place(merge(parts), { x, y, z, ry }));
}

function foodTruck(
	ctx: BuildContext,
	cx: number,
	y: number,
	cz: number,
	col: number,
	stripe: number,
): void {
	const parts: BufferGeometry[] = [
		box(3, 1.5, 2, col, cx - 0.5, y + 0.35, cz),
		box(1.1, 1.1, 1.9, darken(col, 0.8), cx + 1.55, y + 0.35, cz),
		box(0.05, 0.5, 1.6, 0x9fc4d8, cx + 2.12, y + 0.85, cz),
		box(1.8, 0.7, 0.06, DARK, cx - 0.6, y + 1.0, cz + 1.02),
		box(1.9, 0.06, 0.3, 0xcfd3d8, cx - 0.6, y + 0.95, cz + 1.12),
		box(0.7, 0.3, 0.5, 0x999da3, cx - 1.2, y + 1.85, cz),
		place(box(2.2, 0.06, 1, stripe, 0, 0, 0), {
			x: cx - 0.6,
			y: y + 1.9,
			z: cz + 1.4,
			rx: 0.35,
		}),
	];
	for (const wx of [-1.3, 1.5]) {
		for (const wz of [-0.95, 0.95]) {
			parts.push(box(0.75, 0.7, 0.25, DARK, cx + wx, y, cz + wz));
		}
	}
	ctx.statics.push(merge(parts));
}

function standers(
	ctx: BuildContext,
	list: readonly (readonly [number, number])[],
	y = SIDEWALK_Y,
): void {
	const { rng } = ctx;
	for (const [x, z] of list) {
		ctx.statics.push(
			place(tintWhite(person(), rng.pick(SHIRTS)), {
				x,
				y,
				z,
				ry: rng.range(0, Math.PI * 2),
			}),
		);
	}
}

/** Bins, planters, news stands, bike racks, hydrants, stalls and baked pedestrians. */
function dressing(ctx: BuildContext): void {
	const y = SIDEWALK_Y;
	const north: Walk = { wall: -3.15, mid: -2.75, alongZ: false };
	const south: Walk = { wall: 3.15, mid: 2.75, alongZ: false };
	const west: Walk = { wall: 54.85, mid: 55.25, alongZ: true };
	const east: Walk = { wall: 61.15, mid: 60.75, alongZ: true };
	fixtures(ctx, north, [
		["bin", 36.4],
		["pl", 38],
		["rack", 41],
		["news", 44],
		["bin", 46.8],
		["pl", 48.5],
		["pl", 50.5],
		["bin", 53.7],
		["news", 62.6],
		["pl", 64.6],
		["bin", 66.2],
		["rack", 69.5],
		["pl", 72.6],
		["pl", 76.4],
		["bin", 78.2],
		["news", 80.5],
		["pl", 81.7],
	]);
	fixtures(ctx, south, [
		["bin", 36.4],
		["pl", 38],
		["news", 40.2],
		["pl", 43],
		["rack", 47.5],
		["pl", 50.6],
		["bin", 52.2],
		["news", 53.6],
		["bin", 62.8],
		["pl", 64.6],
		["news", 66.5],
		["pl", 68.3],
	]);
	fixtures(ctx, west, [
		["bin", -24.3],
		["pl", -22.5],
		["news", -20],
		["pl", -17],
		["bin", -15.3],
		["rack", -12.8],
		["news", -6.2],
		["pl", -4.7],
		["bin", 4.6],
		["news", 6.1],
		["pl", 7.6],
		["bin", 11.4],
		["pl", 13],
		["rack", 14.8],
		["pl", 17.2],
		["bin", 19.3],
		["news", 20.2],
		["pl", 23],
		["bin", 24.5],
	]);
	fixtures(ctx, east, [
		["bin", -24.4],
		["pl", -22.6],
		["news", -20],
		["pl", -17.6],
		["bin", -15.8],
		["pl", -14.4],
		["bin", -11.3],
		["pl", -5.7],
		["news", -4.5],
		["bin", 4.6],
		["pl", 6.3],
		["news", 7.7],
		["bin", 11],
		["pl", 12.5],
		["bin", 14.5],
		["rack", 16],
		["pl", 18.2],
		["news", 19.8],
		["bin", 21.5],
		["pl", 23],
		["bin", 24.4],
	]);
	for (const [x, z] of [
		[46.8, -2.35],
		[74.2, -2.35],
		[44.8, 2.35],
		[49.9, 2.35],
	] as const) {
		hydrant(ctx, x, z);
	}

	// Baked pedestrians along the four frontages.
	standers(ctx, [
		[37.05, -2.75],
		[42.9, -2.75],
		[45.5, -2.75],
		[49.6, -2.75],
		[52.7, -2.75],
		[63.7, -2.75],
		[65.4, -2.75],
		[67.2, -2.75],
		[71.6, -2.75],
		[73.6, -2.75],
		[75.2, -2.75],
		[77.4, -2.75],
		[79.4, -2.75],
		[37.4, 2.75],
		[41.5, 2.75],
		[44.2, 2.75],
		[46.2, 2.75],
		[49, 2.75],
		[51.2, 2.75],
		[63.5, 2.75],
		[65.5, 2.75],
		[67.4, 2.75],
		[55.25, -23.4],
		[55.25, -18.7],
		[55.25, -16.2],
		[55.25, -11.6],
		[55.25, -7.2],
		[55.25, -3.3],
		[55.25, 5.3],
		[55.25, 12.2],
		[55.25, 16.1],
		[55.25, 18.4],
		[55.25, 21.8],
		[55.25, 23.8],
		[60.75, -23.5],
		[60.75, -18.8],
		[60.75, -16.7],
		[60.75, -12.2],
		[60.75, -6.5],
		[60.75, -3.2],
		[60.75, 5.4],
		[60.75, 13.4],
		[60.75, 17.2],
		[60.75, 19.1],
		[60.75, 22.3],
		[60.75, 23.7],
	]);
	// Seated on the benches, queueing at the stalls and the food truck.
	standers(
		ctx,
		[
			[55.1, -9.35],
			[55.1, 8.65],
		],
		y + 0.22,
	);
	standers(
		ctx,
		[
			[61, -8.35],
			[61, 9.4],
		],
		y + 0.22,
	);

	// Market stalls on the strip beside the café terrace and in the pocket garden.
	stall(ctx, 36.35, 18.7, Math.PI / 2, 0xe8463c);
	stall(ctx, 36.35, 21.5, Math.PI / 2, 0x3b7dd8);
	stall(ctx, 37.4, -13.2, 0, 0xf2c94c, y + 0.04);
	stall(ctx, 41.9, -13.2, 0, 0x58c27a, y + 0.04);
	standers(
		ctx,
		[
			[37.4, -12.0],
			[41.9, -12.0],
			[38.7, -12.0],
		],
		y + 0.04,
	);
	standers(ctx, [
		[37.4, 17.4],
		[37.4, 20.2],
		[37.4, 22.6],
	]);

	// Rear alley behind the NE shop row: dumpsters, crates and AC units.
	const aly = -13;
	ctx.statics.push(
		box(1.8, 1, 0.7, 0x2f6b46, 63.2, y, aly),
		box(1.9, 0.1, 0.8, DARK, 63.2, y + 1, aly),
		box(1.8, 1, 0.7, 0x2f5f9a, 66, y, aly),
		box(1.9, 0.1, 0.8, DARK, 66, y + 1, aly),
		box(0.8, 0.6, 0.6, 0xb9bdc1, 69, y, aly),
		cyl(0.25, 0.25, 0.1, 8, DARK, 69, y + 0.6, aly),
		box(0.7, 0.4, 0.5, WOOD, 70.6, y, aly),
		box(0.6, 0.4, 0.5, 0xc79a62, 70.6, y + 0.4, aly),
		box(4.6, 0.5, 0.5, HEDGE, 75, y, aly),
		box(0.9, 0.6, 0.5, 0xb9bdc1, 68, y, aly),
	);
	bin(ctx, 62, aly);
	bin(ctx, 71.6, aly);
	standers(
		ctx,
		[
			[79.4, -13.15],
			[80.4, -13.15],
		],
		y + 0.03,
	);

	// Terrace guests (seated), hedges around the café deck.
	const deckY = y + 0.05;
	for (const [x, z, ry] of [
		[38.35, 14.2, Math.PI / 2],
		[44.65, 14.2, -Math.PI / 2],
		[40.65, 17.2, Math.PI / 2],
		[44.65, 17.2, -Math.PI / 2],
		[38.35, 20.2, Math.PI / 2],
		[42.35, 20.2, -Math.PI / 2],
	] as const) {
		ctx.statics.push(
			place(tintWhite(person(), ctx.rng.pick(SHIRTS)), {
				x,
				y: deckY + 0.2,
				z,
				ry,
			}),
		);
	}
	for (const z of [13, 15.8, 18.6, 21.4]) {
		ctx.statics.push(box(0.5, 0.6, 1.5, HEDGE, 37.65, deckY, z));
	}
	for (const x of [38.5, 41.5, 44.4]) {
		ctx.statics.push(box(1.6, 0.6, 0.5, HEDGE, x, deckY, 22.75));
	}
}

/** Walk-up shop with a small planted roof terrace. */
function shop(
	ctx: BuildContext,
	lot: Lot,
	floors: number,
	roofTerrace = true,
): void {
	walkup(ctx, lot, { floors });
	const wd = lot.w - 2.4;
	if (!roofTerrace || wd < 2) return;
	const h = floors * FLOOR_H + 0.2;
	const zz = lot.d / 2 - 1;
	ctx.statics.push(
		place(
			merge([
				box(wd, 0.5, 0.7, WOOD, 0, h, zz),
				box(wd - 0.15, 0.15, 0.55, GRASS, 0, h + 0.5, zz),
				place(roundTree(0.3), { x: -wd / 4, y: h + 0.55, z: zz }),
				place(roundTree(0.3), { x: wd / 4, y: h + 0.55, z: zz }),
			]),
			{ x: lot.x, z: lot.z, ry: lot.ry ?? 0 },
		),
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
	for (const x of [41, 47, 56.5, 70.5]) spots.push({ x, z: -2.75, y });
	for (const x of [43, 50, 66, 73, 77.5]) spots.push({ x, z: 2.75, y });
	for (const z of [-24, -16, -11, -5, 4, 15, 20, 24]) {
		spots.push({ x: 55.25, z, y });
	}
	for (const z of [-24, -15, -11, -4, 5, 12, 19, 24]) {
		spots.push({ x: 60.75, z, y });
	}
	// Market stalls, food-truck queue, fire-station frontage.
	spots.push(
		{ x: 37.2, z: 18.7, y },
		{ x: 37.2, z: 21.4, y },
		{ x: 37.6, z: -12.2, y: y + 0.04 },
		{ x: 42.4, z: -12.2, y: y + 0.04 },
		{ x: 79.4, z: -13.1, y: y + 0.03 },
		{ x: 80.4, z: -13.1, y: y + 0.03 },
		{ x: 73.2, z: 3, y },
		{ x: 77.6, z: 3, y },
		{ x: 76.5, z: 24.6, y: y + 0.03 },
		{ x: 71, z: 9.8, y },
	);
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
		shop(ctx, lot, rng.int(3, 5));
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
		shop(ctx, lot, neFloors[i]);
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
	shop(
		ctx,
		rectLot(
			{ x0: 45.5, x1: WEST_BLOCK_END, z0: BUILD_OFFSET, z1: 12.5 },
			"north",
		),
		4,
	);
	for (const lot of stripLots(
		{ x0: 45.5, x1: WEST_BLOCK_END, z0: 12.5, z1: IN_MAX_Z },
		"east",
		2,
	)) {
		shop(ctx, lot, rng.int(3, 4), false);
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
		shop(ctx, lot, seFloors[i]);
	});
	buildCivicServices(ctx, signs);

	streetFurniture(ctx);
	dressing(ctx);
	createCrowd(ctx, shopperSpots(), { count: 70, spread: 0.4 });
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
