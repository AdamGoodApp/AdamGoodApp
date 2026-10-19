import { type BufferGeometry, IcosahedronGeometry, Vector3 } from "three";
import { box, cone, cyl, merge, paint, place, prism } from "../geometry";
import { TILE } from "../kit/atlas";
import { frontGarden, house } from "../kit/buildings";
import {
	BRIGHTS,
	CARS,
	darken,
	HOUSES,
	LANE,
	ROAD,
	ROOFS,
	SHIRTS,
	SIDEWALK,
	WHITE,
} from "../palette";
import {
	car,
	dog,
	lamp,
	person,
	personLying,
	pine,
	roundTree,
} from "../prefabs";
import type { Rng } from "../rng";
import { type CrowdSpot, createCrowd } from "../sim/crowd";
import { buildFireScene, type FireSite } from "../sim/fire";
import { Polyline } from "../sim/path";
import type { BuildContext } from "./context";
import { CELL_Y, ROAD_Y, SIDEWALK_Y } from "./layout";
import { tintWhite } from "./tint";

/** Streets are 4 m wide, centred at x = 58 and z = 58 (cell spans 33..84). */
const STREET = 58;
const STREET_WIDTH = 4;
const SIDEWALK_W = 1.5;
/** Cell interior after the avenue / ring sidewalks (33 + 1.5, 84 − 1.5). */
const EDGE_LO = 34.5;
const EDGE_HI = 82.5;
const ROAD_LO = STREET - STREET_WIDTH / 2;
const ROAD_HI = STREET + STREET_WIDTH / 2;
/** Block edges next to the cross streets (sidewalks sit between road and lot). */
const BLOCK_A_HI = ROAD_LO - SIDEWALK_W;
const BLOCK_B_LO = ROAD_HI + SIDEWALK_W;
/** Sidewalk centrelines used by the pedestrian network. */
const WALK_LO = 33.75;
const WALK_A = ROAD_LO - SIDEWALK_W / 2;
const WALK_B = ROAD_HI + SIDEWALK_W / 2;
const WALK_HI = 83.25;

/** Dead-end lane in the south-east block: the house on fire stands on it. */
const LANE_Z = 80;
const LANE_WIDTH = 4;
const LANE_WALK_Z = LANE_Z - LANE_WIDTH / 2 - SIDEWALK_W / 2;
const LANE_FRONT = LANE_WALK_Z - SIDEWALK_W / 2;

const HOUSE_D = 5;
/** Lot-front edge to house centre: porch roof + setback + half depth. */
const FRONT = HOUSE_D / 2 + 1.7 + 0.3;
const GARAGE_W = 3.6;
/** Houses with a garage sit further back so a car fits on the driveway. */
const GARAGE_SHIFT = 2.3;
const DRIVEWAY = 0xb9b6b0;
const LEAVES = [0x5fb257, 0x6dc062, 0x4f9f4d, 0x78c26a] as const;
const SHEDS = [0x9c7b55, 0xb5a58a, 0x6f7f93, 0xa65c4a] as const;
const FIRE_HOUSE_ROOF = 0x5a4a42;

interface Rect {
	x0: number;
	x1: number;
	z0: number;
	z1: number;
}

/** A row of houses along one block edge, fronts toward the street at `frontQ`. */
interface RowSpec {
	/** Unit front direction (toward the street). */
	fx: number;
	fz: number;
	/** Front-edge coordinate along the front direction. */
	frontQ: number;
	/** Row extent along the row axis a = (fz, −fx), which is the houses' local +x. */
	s0: number;
	s1: number;
}

interface Slot {
	w: number;
	garage?: boolean;
	fire?: boolean;
}

type Plan = "three" | "four" | "five" | "garage";

const facingNorth = (x0: number, x1: number, z: number): RowSpec => ({
	fx: 0,
	fz: -1,
	frontQ: -z,
	s0: -x1,
	s1: -x0,
});
const facingSouth = (x0: number, x1: number, z: number): RowSpec => ({
	fx: 0,
	fz: 1,
	frontQ: z,
	s0: x0,
	s1: x1,
});
const facingEast = (z0: number, z1: number, x: number): RowSpec => ({
	fx: 1,
	fz: 0,
	frontQ: x,
	s0: -z1,
	s1: -z0,
});
const facingWest = (z0: number, z1: number, x: number): RowSpec => ({
	fx: -1,
	fz: 0,
	frontQ: -x,
	s0: z0,
	s1: z1,
});

function walk(...pts: [number, number][]): Vector3[] {
	return pts.map(([x, z]) => new Vector3(x, SIDEWALK_Y, z));
}

function scriptedRng(values: readonly number[]): Rng {
	let i = 0;
	const next = (): number => values[Math.min(i++, values.length - 1)] ?? 0;
	const rng = next as Rng;
	rng.range = (min, max) => min + next() * (max - min);
	rng.int = (min, max) => Math.floor(min + next() * (max - min + 1));
	rng.pick = (items) => items[Math.floor(next() * items.length)] as never;
	return rng;
}

function rotate(lx: number, lz: number, ry: number): [number, number] {
	const c = Math.cos(ry);
	const s = Math.sin(ry);
	return [lx * c + lz * s, -lx * s + lz * c];
}

function buildStreets(ctx: BuildContext): void {
	const s = ctx.statics;
	const len = EDGE_HI - EDGE_LO;
	const mid = (EDGE_LO + EDGE_HI) / 2;

	s.push(box(STREET_WIDTH, ROAD_Y, len, ROAD, STREET, 0, mid));
	s.push(box(len, ROAD_Y, STREET_WIDTH, ROAD, mid, 0, STREET));
	s.push(
		box(
			EDGE_HI - ROAD_HI,
			ROAD_Y,
			LANE_WIDTH,
			ROAD,
			(ROAD_HI + EDGE_HI) / 2,
			0,
			LANE_Z,
		),
	);
	for (let t = EDGE_LO + 4; t < EDGE_HI - 3; t += 4) {
		if (Math.abs(t - STREET) < STREET_WIDTH + 1) continue;
		if (t < LANE_Z - LANE_WIDTH) {
			s.push(box(0.25, 0.02, 1.6, LANE, STREET, ROAD_Y, t));
		}
		s.push(box(1.6, 0.02, 0.25, LANE, t, ROAD_Y, STREET));
	}

	const strip = (x0: number, x1: number, z0: number, z1: number): void => {
		s.push(
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
	};
	const laneMouth = LANE_Z - LANE_WIDTH / 2;
	strip(BLOCK_A_HI, ROAD_LO, EDGE_LO, ROAD_LO);
	strip(BLOCK_A_HI, ROAD_LO, ROAD_HI, EDGE_HI);
	strip(ROAD_HI, BLOCK_B_LO, EDGE_LO, ROAD_LO);
	strip(ROAD_HI, BLOCK_B_LO, ROAD_HI, laneMouth);
	strip(EDGE_LO, BLOCK_A_HI, BLOCK_A_HI, ROAD_LO);
	strip(BLOCK_B_LO, EDGE_HI, BLOCK_A_HI, ROAD_LO);
	strip(EDGE_LO, BLOCK_A_HI, ROAD_HI, BLOCK_B_LO);
	strip(BLOCK_B_LO, EDGE_HI, ROAD_HI, BLOCK_B_LO);
	strip(BLOCK_B_LO, EDGE_HI, LANE_FRONT, laneMouth);
	strip(ROAD_HI, EDGE_HI, LANE_Z + LANE_WIDTH / 2, EDGE_HI);

	for (const x of [WALK_A, WALK_B]) {
		for (const z of [WALK_A, WALK_B]) {
			s.push(place(lamp(), { x, y: SIDEWALK_Y, z }));
		}
	}
	for (let t = 40; t < 80; t += 12) {
		if (Math.abs(t - STREET) < 6) continue;
		const along = t < LANE_Z - 6;
		if (along) {
			s.push(place(lamp(), { x: ROAD_LO - 0.25, y: SIDEWALK_Y, z: t }));
			s.push(place(lamp(), { x: ROAD_HI + 0.25, y: SIDEWALK_Y, z: t + 4 }));
		}
		s.push(place(lamp(), { x: t + 2, y: SIDEWALK_Y, z: ROAD_LO - 0.25 }));
		s.push(place(lamp(), { x: t - 2, y: SIDEWALK_Y, z: ROAD_HI + 0.25 }));
	}

	ctx.sidewalks.push(
		new Polyline(walk([WALK_A, WALK_LO], [WALK_A, WALK_HI]), false),
		new Polyline(walk([WALK_B, WALK_LO], [WALK_B, WALK_HI]), false),
		new Polyline(walk([WALK_LO, WALK_A], [WALK_HI, WALK_A]), false),
		new Polyline(walk([WALK_LO, WALK_B], [WALK_HI, WALK_B]), false),
		new Polyline(walk([WALK_B, LANE_WALK_Z], [WALK_HI, LANE_WALK_Z]), false),
	);

	// Closed stroll that passes the front sidewalk of every row of houses.
	ctx.residentialLoop = new Polyline(
		walk(
			[WALK_LO, WALK_LO],
			[WALK_HI, WALK_LO],
			[WALK_HI, WALK_A],
			[WALK_B, WALK_A],
			[WALK_B, WALK_LO],
			[WALK_B, WALK_B],
			[WALK_HI, WALK_B],
			[WALK_HI, LANE_WALK_Z],
			[WALK_B, LANE_WALK_Z],
			[WALK_B, WALK_HI],
			[WALK_LO, WALK_HI],
			[WALK_LO, WALK_B],
			[WALK_A, WALK_B],
			[WALK_A, WALK_A],
			[WALK_LO, WALK_A],
		),
		true,
	);
}

function planRow(plan: Plan, rng: Rng): Slot[] {
	if (plan === "three") {
		return [0, 1, 2].map(() => ({ w: rng.range(5.2, 5.8) }));
	}
	if (plan === "four") {
		return [0, 1, 2, 3].map(() => ({ w: rng.range(3.9, 4.2) }));
	}
	if (plan === "five") {
		return [0, 1, 2, 3, 4].map(() => ({ w: rng.range(3.2, 3.5) }));
	}
	const garageAt = rng.int(0, 2);
	return [4.2, 4.8, 4.2].map((w, i) => ({ w, garage: i === garageAt }));
}

function boxAround(
	cx: number,
	cz: number,
	spec: RowSpec,
	a0: number,
	a1: number,
	f0: number,
	f1: number,
): Rect {
	const xs: number[] = [];
	const zs: number[] = [];
	for (const a of [a0, a1]) {
		for (const f of [f0, f1]) {
			xs.push(cx + spec.fz * a + spec.fx * f);
			zs.push(cz - spec.fx * a + spec.fz * f);
		}
	}
	return {
		x0: Math.min(...xs),
		x1: Math.max(...xs),
		z0: Math.min(...zs),
		z1: Math.max(...zs),
	};
}

/** One row of houses along a block edge; records every footprint in `taken`. */
function buildRow(
	ctx: BuildContext,
	spec: RowSpec,
	slots: Slot[],
	taken: Rect[],
): FireSite | null {
	const { rng, statics } = ctx;
	let fire: FireSite | null = null;
	const used = slots.reduce((a, s) => a + s.w + (s.garage ? GARAGE_W : 0), 0);
	const gap = (spec.s1 - spec.s0 - used) / slots.length;
	const ry = Math.atan2(spec.fx, spec.fz);
	let s = spec.s0 + gap / 2;

	slots.forEach((slot, index) => {
		const slotLen = slot.w + (slot.garage ? GARAGE_W : 0);
		const sc = s + slot.w / 2;
		const shift = slot.garage ? GARAGE_SHIFT : 0;
		const q = spec.frontQ - FRONT - shift;
		const cx = spec.fz * sc + spec.fx * q;
		const cz = -spec.fx * sc + spec.fz * q;
		const lot = { x: cx, z: cz, w: slot.w, d: HOUSE_D, ry };

		taken.push(
			boxAround(
				cx,
				cz,
				spec,
				-slot.w / 2 - 0.6,
				slot.w / 2 + 0.6 + (slot.garage ? GARAGE_W : 0),
				-HOUSE_D / 2 - 0.6,
				FRONT + shift,
			),
		);

		if (slot.fire) {
			const floors = 2;
			house(
				{
					rng: scriptedRng([0.5, 0.1, 0]),
					statics: ctx.statics,
					facades: ctx.facades,
				},
				lot,
				{
					floors,
					garage: false,
					upper: TILE.houseBrick,
					roof: FIRE_HOUSE_ROOF,
				},
			);
			fire = {
				x: cx,
				z: cz,
				w: slot.w,
				d: HOUSE_D,
				h: floors * 3,
				laneZ: LANE_Z,
				laneX0: ROAD_HI,
				streetX: STREET,
			};
		} else {
			house(ctx, lot, { garage: !!slot.garage });
			const [dx, dz] = rotate(-0.15 * slot.w, HOUSE_D / 2 + 0.9, ry);
			ctx.residentialDoors.push(new Vector3(cx + dx, CELL_Y, cz + dz));

			// Everything below is in the house's local frame (front +Z); `zf` is the lot front line.
			const zf = FRONT + shift;
			const hedge = rng.pick(HEDGES);
			const extra: BufferGeometry[] = [
				mailbox(slot.w * 0.32, zf + 0.25, rng.pick(BRIGHTS)),
			];
			if (rng() < 0.4) {
				extra.push(wheelieBin(slot.w * 0.32 + 0.55, zf + 0.3, rng.pick(BINS)));
			}
			if (slot.garage) {
				const lx = slot.w / 2 + 1.8;
				const len = zf - HOUSE_D / 2;
				const lz = HOUSE_D / 2 + len / 2;
				extra.push(
					box(3.4, CELL_Y + 0.04, len, DRIVEWAY, lx, 0, lz),
					place(tintWhite(car(), rng.pick(CARS)), {
						x: lx,
						y: CELL_Y + 0.04,
						z: lz,
						ry: rng() < 0.4 ? Math.PI : 0,
					}),
					hedgeBox(slot.w * 0.22, hedge, -slot.w * 0.38, zf - 0.45),
					hedgeBox(slot.w * 0.4, hedge, slot.w * 0.24, zf - 0.45),
					bush(0.8, rng.pick(LEAVES), slot.w * 0.2, 3.6),
					bush(0.7, rng.pick(LEAVES), -slot.w * 0.46, 3.3),
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
			statics.push(place(merge(extra), { x: cx, z: cz, ry }));
		}

		if (index < slots.length - 1) {
			const sg = s + slotLen + gap / 2;
			const qt = spec.frontQ - 0.6;
			const tx = spec.fz * sg + spec.fx * qt;
			const tz = -spec.fx * sg + spec.fz * qt;
			const tree =
				rng() < 0.3
					? pine(0.7)
					: roundTree(rng.range(0.7, 0.9), rng.pick(LEAVES));
			statics.push(place(tree, { x: tx, y: CELL_Y, z: tz }));
		}
		s += slotLen + gap;
	});
	return fire;
}

const SOIL = 0x6b4a35;
const WOOD = 0x9c7b55;
const HEDGES = [0x3f8f45, 0x4a9a4a, 0x357a3d] as const;
const BINS = [0x2f7a4a, 0x3b7dd8, 0x555a60] as const;
const BLOOMS = [0xe85d5d, 0xf7d64f, 0xf29ec8, 0xffffff, 0x9b6bf2] as const;
const PARASOLS = [0xe8463c, 0x3b7dd8, 0xf2c94c, 0x58c27a, 0xf28c28] as const;

function bush(s: number, hex: number, x = 0, z = 0): BufferGeometry {
	return place(paint(new IcosahedronGeometry(0.55 * s, 0), hex), {
		x,
		y: 0.4 * s,
		z,
		sy: 0.85,
	});
}

function hedgeBox(len: number, hex: number, x: number, z: number) {
	return box(len, 0.75, 0.55, hex, x, 0, z);
}

function mailbox(x: number, z: number, hex: number): BufferGeometry {
	return merge([
		cyl(0.03, 0.03, 0.85, 5, 0x6b6f75, x, 0, z),
		box(0.3, 0.22, 0.42, hex, x, 0.85, z),
		box(0.04, 0.18, 0.04, 0xe8463c, x + 0.17, 0.9, z + 0.08),
	]);
}

function wheelieBin(x: number, z: number, hex: number): BufferGeometry {
	return merge([
		box(0.5, 0.85, 0.5, hex, x, 0, z),
		box(0.55, 0.07, 0.55, darken(hex, 0.8), x, 0.85, z),
	]);
}

/** A baked person in a random shirt colour (`s` scales kids down). */
function standing(
	rng: Rng,
	x: number,
	y: number,
	z: number,
	yaw: number,
	s = 1,
): BufferGeometry {
	return place(tintWhite(person(), rng.pick(SHIRTS)), {
		x,
		y,
		z,
		ry: yaw,
		sx: s,
		sy: s,
		sz: s,
	});
}

type Kind =
	| "bbq"
	| "play"
	| "cottage"
	| "pool"
	| "tramp"
	| "shed"
	| "veg"
	| "greenhouse"
	| "patio"
	| "tub"
	| "kennel"
	| "line"
	| "flowers"
	| "tree"
	| "pine"
	| "bush"
	| "hedge";

/** A back-yard set piece in its own frame: half extents for packing, baked geometry, crowd spots. */
interface Piece {
	geo: BufferGeometry;
	hx: number;
	hz: number;
	/** Idle people (piece-local x, z, facing). */
	crowd?: [number, number, number][];
}

/** Fillers placed after the set pieces; repeated entries weight the pick. */
const FILL: readonly Kind[] = [
	"tree",
	"tree",
	"pine",
	"bush",
	"bush",
	"hedge",
	"flowers",
	"tree",
	"bush",
];

/** One-off set pieces, tried in a shuffled order after the BBQ and the playground. */
const SET_PIECES: readonly Kind[] = [
	"cottage",
	"pool",
	"tramp",
	"shed",
	"veg",
	"greenhouse",
	"patio",
	"tub",
	"kennel",
	"line",
	"shed",
	"pool",
	"cottage",
	"patio",
];

function makePiece(kind: Kind, rng: Rng): Piece {
	switch (kind) {
		case "bbq": {
			const legs = [-0.3, 0.3].flatMap((dx) =>
				[-0.18, 0.18].map((dz) =>
					box(0.05, 0.65, 0.05, 0x555555, -1.1 + dx, 0, dz),
				),
			);
			return {
				geo: merge([
					...legs,
					box(0.7, 0.3, 0.45, 0x2b2b2b, -1.1, 0.65, 0),
					box(0.72, 0.08, 0.47, 0xc8281e, -1.1, 0.95, 0),
					box(1.6, 0.08, 0.8, WOOD, 0.9, 0.75, 0),
					box(0.08, 0.75, 0.7, SOIL, 0.3, 0, 0),
					box(0.08, 0.75, 0.7, SOIL, 1.5, 0, 0),
					box(1.6, 0.06, 0.3, WOOD, 0.9, 0.45, 0.7),
					box(1.6, 0.06, 0.3, WOOD, 0.9, 0.45, -0.7),
					box(0.2, 0.05, 0.2, WHITE, 0.5, 0.83, 0.1),
					box(0.2, 0.05, 0.2, WHITE, 1.3, 0.83, -0.1),
					box(0.12, 0.16, 0.12, 0xe8463c, 0.9, 0.83, 0),
					cyl(0.04, 0.04, 2.2, 6, 0x777777, 0.9, 0, 0),
					cone(1.3, 0.5, 8, rng.pick(PARASOLS), 0.9, 2.2, 0),
				]),
				hx: 2.0,
				hz: 1.6,
				crowd: [
					[-1.1, 0.7, Math.PI],
					[-1.9, 0.0, Math.PI / 2],
					[0.2, 1.45, Math.PI],
					[1.7, 1.45, Math.PI],
				],
			};
		}
		case "play": {
			const sx = -0.9;
			const post = (x: number, z: number, rz: number) =>
				place(box(0.08, 2.3, 0.08, 0x3b7dd8, 0, 0, 0), { x, z, rz });
			return {
				geo: merge([
					post(sx - 1.35, 0.5, -0.13),
					post(sx - 1.35, -0.5, -0.13),
					post(sx + 1.35, 0.5, 0.13),
					post(sx + 1.35, -0.5, 0.13),
					box(2.4, 0.1, 0.1, 0x3b7dd8, sx, 2.2, 0),
					box(0.02, 1.7, 0.02, 0x333333, sx - 0.63, 0.55, 0),
					box(0.02, 1.7, 0.02, 0x333333, sx - 0.27, 0.55, 0),
					box(0.02, 1.7, 0.02, 0x333333, sx + 0.27, 0.55, 0),
					box(0.02, 1.7, 0.02, 0x333333, sx + 0.63, 0.55, 0),
					box(0.45, 0.05, 0.22, 0xf2c94c, sx - 0.45, 0.5, 0),
					box(0.45, 0.05, 0.22, 0xe8463c, sx + 0.45, 0.5, 0),
					standing(rng, sx - 0.45, 0.1, 0, 0, 0.6),
					box(1.5, 0.3, 1.5, WOOD, 1.35, 0, 0.1),
					box(1.3, 0.24, 1.3, 0xe8cf8c, 1.35, 0.02, 0.1),
					box(0.2, 0.2, 0.2, rng.pick(BRIGHTS), 1.2, 0.26, 0.1),
				]),
				hx: 2.2,
				hz: 1.3,
				crowd: [
					[1.35, 1.2, Math.PI],
					[0.2, 1.05, Math.PI * 0.9],
					[-2.0, 0.8, Math.PI / 2],
				],
			};
		}
		case "cottage": {
			return {
				geo: merge([
					box(3.0, 2.4, 2.6, rng.pick(HOUSES), 0, 0, 0),
					prism(3.6, 1.5, 3.2, rng.pick(ROOFS), 0, 2.4, 0),
					box(0.7, 1.5, 0.06, 0x7a2f2a, -0.6, 0, 1.31),
					box(0.6, 0.6, 0.05, 0xa9d0e8, 0.75, 0.9, 1.31),
					box(0.4, 1.0, 0.4, 0x8a6b5a, 0.9, 2.4, -0.5),
					box(0.9, 0.12, 0.5, 0xd8d2c6, -0.6, 0, 1.55),
				]),
				hx: 1.9,
				hz: 1.7,
			};
		}
		case "pool": {
			return {
				geo: merge([
					box(3.4, 0.1, 2.4, 0xe9e6df, 0, 0, 0),
					box(3.0, 0.115, 2.0, 0x4cc3f2, 0, 0, 0),
					box(1.7, 0.14, 0.6, 0xf0efe9, 0.5, 0, 1.75),
					place(tintWhite(personLying(), rng.pick(SHIRTS)), {
						x: 0.5,
						y: 0.14,
						z: 1.75,
						ry: Math.PI / 2,
					}),
					standing(rng, -1.35, 0, 1.45, Math.PI * 0.8),
				]),
				hx: 1.8,
				hz: 2.1,
			};
		}
		case "tramp": {
			const legs = [-0.7, 0.7].flatMap((lx) =>
				[-0.7, 0.7].map((lz) => box(0.06, 0.7, 0.06, 0x777777, lx, 0, lz)),
			);
			return {
				geo: merge([
					...legs,
					cyl(1.25, 1.25, 0.08, 12, 0x2d62d6, 0, 0.7, 0),
					cyl(1.05, 1.05, 0.1, 12, 0x15151a, 0, 0.7, 0),
					standing(rng, 0, 1.05, 0, rng.range(0, Math.PI * 2), 0.7),
				]),
				hx: 1.3,
				hz: 1.3,
			};
		}
		case "shed": {
			return {
				geo: merge([
					box(1.8, 1.7, 1.5, rng.pick(SHEDS), 0, 0, 0),
					prism(2.1, 0.6, 1.8, 0x5a4a42, 0, 1.7, 0),
					box(0.6, 1.2, 0.06, 0x5a4a42, -0.3, 0, 0.77),
					box(0.4, 0.4, 0.06, 0xa9d0e8, 0.5, 0.8, 0.77),
					box(0.25, 0.3, 0.25, 0xb5544a, -1.1, 0, 0.95),
					bush(0.5, rng.pick(LEAVES), -1.1, 0.95),
				]),
				hx: 1.15,
				hz: 1.05,
			};
		}
		case "veg": {
			const parts: BufferGeometry[] = [];
			for (const bz of [-0.8, 0, 0.8]) {
				parts.push(box(2.2, 0.2, 0.55, SOIL, 0, 0, bz));
				for (let i = 0; i < 5; i++) {
					parts.push(
						box(
							0.2,
							0.28,
							0.2,
							rng.pick([0x5aa84a, 0x3f8f45, 0xe8463c, 0x8fd36b]),
							-0.85 + i * 0.42,
							0.2,
							bz,
						),
					);
				}
			}
			return { geo: merge(parts), hx: 1.2, hz: 1.2 };
		}
		case "greenhouse": {
			return {
				geo: merge([
					box(2.4, 0.4, 1.6, 0x777b80, 0, 0, 0),
					box(2.3, 1.2, 1.5, 0xc6e8e2, 0, 0.4, 0),
					prism(2.4, 0.7, 1.6, 0xdff3ef, 0, 1.6, 0),
					bush(0.6, 0x4f9f4d, -0.6, 0),
					bush(0.6, 0x6dc062, 0.5, 0.1),
				]),
				hx: 1.3,
				hz: 0.95,
			};
		}
		case "patio": {
			const chair = (x: number, z: number) =>
				box(0.4, 0.5, 0.4, 0xf2efe6, x, 0, z);
			return {
				geo: merge([
					cyl(0.04, 0.04, 0.7, 6, 0x555555, 0, 0, 0),
					cyl(0.55, 0.55, 0.06, 10, WHITE, 0, 0.7, 0),
					cyl(0.04, 0.04, 2.2, 6, 0x777777, 0.3, 0, 0),
					cone(1.15, 0.5, 8, rng.pick(PARASOLS), 0.3, 2.2, 0),
					chair(-0.85, 0),
					chair(0.85, 0),
					chair(0, 0.85),
					chair(0, -0.85),
					standing(rng, 0, 0, 1.25, Math.PI),
				]),
				hx: 1.3,
				hz: 1.4,
			};
		}
		case "tub": {
			return {
				geo: merge([
					cyl(0.95, 0.95, 0.7, 10, SOIL, 0, 0, 0),
					cyl(0.8, 0.8, 0.05, 10, 0x6fd0ff, 0, 0.7, 0),
					box(0.26, 0.26, 0.26, 0xf1c9a5, -0.3, 0.68, 0),
					box(0.26, 0.26, 0.26, 0xf1c9a5, 0.3, 0.68, 0.1),
				]),
				hx: 1.0,
				hz: 1.0,
			};
		}
		case "kennel": {
			return {
				geo: merge([
					box(0.8, 0.55, 0.8, 0xb5544a, 0, 0, 0),
					prism(0.95, 0.4, 0.9, 0x5a4a42, 0, 0.55, 0),
					box(0.35, 0.35, 0.06, 0x222222, 0, 0, 0.41),
					place(dog(), { x: 0.85, z: 0.25, ry: 2 }),
				]),
				hx: 0.8,
				hz: 0.6,
			};
		}
		case "line": {
			const parts: BufferGeometry[] = [
				cyl(0.04, 0.04, 2.0, 6, 0x777777, -1.2, 0, 0),
				cyl(0.04, 0.04, 2.0, 6, 0x777777, 1.2, 0, 0),
				box(2.4, 0.02, 0.02, 0xdddddd, 0, 1.95, 0),
			];
			for (let i = 0; i < 5; i++) {
				parts.push(
					box(
						0.35,
						0.55,
						0.04,
						rng.pick([...BRIGHTS, WHITE]),
						-0.9 + i * 0.45,
						1.4,
						0,
					),
				);
			}
			return { geo: merge(parts), hx: 1.3, hz: 0.4 };
		}
		case "flowers": {
			const parts: BufferGeometry[] = [box(1.6, 0.18, 0.55, SOIL, 0, 0, 0)];
			for (let i = 0; i < 7; i++) {
				parts.push(
					box(0.2, 0.25, 0.2, rng.pick(BLOOMS), -0.7 + i * 0.23, 0.18, 0),
				);
			}
			return { geo: merge(parts), hx: 0.9, hz: 0.4 };
		}
		case "tree":
			return {
				geo: roundTree(rng.range(0.8, 1.05), rng.pick(LEAVES)),
				hx: 0.8,
				hz: 0.8,
			};
		case "pine":
			return { geo: pine(rng.range(0.8, 1.05)), hx: 0.9, hz: 0.9 };
		case "bush":
			return {
				geo: bush(rng.range(1.0, 1.5), rng.pick(LEAVES)),
				hx: 0.5,
				hz: 0.5,
			};
		case "hedge":
			return {
				geo: hedgeBox(rng.range(2.0, 3.0), rng.pick(HEDGES), 0, 0),
				hx: 1.4,
				hz: 0.35,
			};
	}
}

interface Yard {
	block: Rect;
	taken: Rect[];
	placed: Rect[];
	spots: CrowdSpot[];
}

/** Drops one piece at a random free spot in the yard (random quarter turn); skipped when nothing fits. */
function dropPiece(ctx: BuildContext, yard: Yard, kind: Kind): void {
	const { rng, statics } = ctx;
	const piece = makePiece(kind, rng);
	const rot = rng.int(0, 3);
	const odd = rot % 2 === 1;
	const hx = odd ? piece.hz : piece.hx;
	const hz = odd ? piece.hx : piece.hz;
	const { block } = yard;
	for (let attempt = 0; attempt < 40; attempt++) {
		const x = rng.range(block.x0 + hx + 0.3, block.x1 - hx - 0.3);
		const z = rng.range(block.z0 + hz + 0.3, block.z1 - hz - 0.3);
		const hit = [...yard.taken, ...yard.placed].some(
			(b) => x - hx < b.x1 && x + hx > b.x0 && z - hz < b.z1 && z + hz > b.z0,
		);
		if (hit) continue;
		yard.placed.push({ x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz });
		const ry = rot * (Math.PI / 2);
		statics.push(place(piece.geo, { x, y: CELL_Y, z, ry }));
		for (const [lx, lz, yaw] of piece.crowd ?? []) {
			const [dx, dz] = rotate(lx, lz, ry);
			yard.spots.push({ x: x + dx, z: z + dz, y: CELL_Y, ry: yaw + ry });
		}
		return;
	}
	piece.geo.dispose();
}

/** BBQ party, playground, cottages, pools, sheds, trees and hedges packed between two rows of houses. */
function buildYards(
	ctx: BuildContext,
	block: Rect,
	taken: Rect[],
	spots: CrowdSpot[],
): void {
	const { rng } = ctx;
	const yard: Yard = { block, taken, placed: [], spots };
	const order = [...SET_PIECES];
	for (let i = order.length - 1; i > 0; i--) {
		const j = rng.int(0, i);
		const a = order[i] as Kind;
		order[i] = order[j] as Kind;
		order[j] = a;
	}
	for (const kind of ["bbq", "play", ...order] as Kind[]) {
		dropPiece(ctx, yard, kind);
	}
	for (let i = 0; i < 36; i++) dropPiece(ctx, yard, rng.pick(FILL));
}

/** Cars parked along the kerbs of the two streets, away from the junction and the lane mouth. */
function buildKerbCars(ctx: BuildContext): void {
	const { rng, statics } = ctx;
	const spots: [number, number, boolean][] = [];
	for (let t = 37; t < 80.5; t += 5.6) {
		if (Math.abs(t - STREET) < 6) continue;
		for (const side of [ROAD_LO + 1, ROAD_HI - 1]) {
			// The N–S street stops short of the fire engines' lane mouth.
			if (t < 71) spots.push([side, t, true]);
			spots.push([t, side, false]);
		}
	}
	for (const [a, b, alongZ] of spots) {
		if (rng() < 0.2) continue;
		const yaw = (alongZ ? 0 : Math.PI / 2) + (rng() < 0.5 ? 0 : Math.PI);
		statics.push(
			place(tintWhite(car(), rng.pick(CARS)), {
				x: alongZ ? a : b,
				y: ROAD_Y,
				z: alongZ ? b : a,
				ry: yaw,
			}),
		);
	}
}

/** Small trees in pits on the road side of every cross-street sidewalk (between the lamps). */
function buildStreetTrees(ctx: BuildContext): void {
	const { rng, statics } = ctx;
	const nearRoad = ROAD_LO - 0.35;
	const farRoad = ROAD_HI + 0.35;
	const sides: [number, number, boolean, readonly number[]][] = [
		[nearRoad, 0, true, [36.5, 46, 70, 76]],
		[farRoad, 0, true, [38, 50, 63, 73]],
		[0, nearRoad, false, [37, 47.5, 71, 81]],
		[0, farRoad, false, [35.5, 44, 68, 79]],
	];
	for (const [x, z, alongZ, positions] of sides) {
		for (const p of positions) {
			const tree =
				rng() < 0.25
					? pine(0.45)
					: roundTree(rng.range(0.42, 0.5), rng.pick(LEAVES));
			statics.push(
				place(tree, {
					x: alongZ ? x : p,
					y: SIDEWALK_Y,
					z: alongZ ? p : z,
				}),
			);
		}
	}
}

export function buildResidential(ctx: BuildContext): void {
	buildStreets(ctx);
	buildKerbCars(ctx);
	buildStreetTrees(ctx);

	const { rng } = ctx;
	const near: [number, number] = [EDGE_LO, BLOCK_A_HI];
	const far: [number, number] = [BLOCK_B_LO, EDGE_HI];
	const taken: Rect[] = [];
	const spots: CrowdSpot[] = [];
	const row = (spec: RowSpec, plan: Plan, into: Rect[]): void => {
		buildRow(ctx, spec, planRow(plan, rng), into);
	};

	const nw: Rect[] = [];
	row(facingNorth(near[0], near[1], EDGE_LO), "five", nw);
	row(facingSouth(near[0], near[1], BLOCK_A_HI), "garage", nw);
	buildYards(
		ctx,
		{ x0: near[0], x1: near[1], z0: near[0], z1: near[1] },
		nw,
		spots,
	);

	const ne: Rect[] = [];
	row(facingWest(near[0], near[1], BLOCK_B_LO), "five", ne);
	row(facingEast(near[0], near[1], EDGE_HI), "garage", ne);
	buildYards(
		ctx,
		{ x0: far[0], x1: far[1], z0: near[0], z1: near[1] },
		ne,
		spots,
	);

	const sw: Rect[] = [];
	row(facingNorth(near[0], near[1], BLOCK_B_LO), "five", sw);
	row(facingSouth(near[0], near[1], EDGE_HI), "five", sw);
	buildYards(
		ctx,
		{ x0: near[0], x1: near[1], z0: far[0], z1: far[1] },
		sw,
		spots,
	);

	row(facingNorth(far[0], far[1], BLOCK_B_LO), "five", taken);
	const fire = buildRow(
		ctx,
		facingSouth(far[0], far[1], LANE_FRONT),
		[{ w: 5.4 }, { w: 6.4, fire: true }, { w: 5.6 }],
		taken,
	);
	if (fire) buildFireScene(ctx, fire);

	createCrowd(ctx, spots, { count: spots.length, spread: 0.12 });
}
