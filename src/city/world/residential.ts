import { type BufferGeometry, Vector3 } from "three";
import { box, cyl, merge, place, prism } from "../geometry";
import { TILE } from "../kit/atlas";
import { frontGarden, house } from "../kit/buildings";
import { CARS, LANE, ROAD, SIDEWALK } from "../palette";
import { car, lamp, pine, roundTree } from "../prefabs";
import type { Rng } from "../rng";
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

type Plan = "three" | "four" | "garage";

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

			if (slot.garage) {
				const lx = slot.w / 2 + 1.8;
				const len = FRONT + shift - HOUSE_D / 2;
				const lz = HOUSE_D / 2 + len / 2;
				const extra: BufferGeometry[] = [
					box(3.4, CELL_Y + 0.04, len, DRIVEWAY, lx, 0, lz),
					place(tintWhite(car(), rng.pick(CARS)), {
						x: lx,
						y: CELL_Y + 0.04,
						z: lz,
						ry: rng() < 0.4 ? Math.PI : 0,
					}),
				];
				statics.push(place(merge(extra), { x: cx, z: cz, ry }));
			} else {
				frontGarden(ctx, {
					x: cx,
					z: cz,
					w: slot.w + 0.6,
					d: 2 * (FRONT - 0.15 + 0.3),
					ry,
				});
			}
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

function overlaps(cx: number, cz: number, r: number, rects: Rect[]): boolean {
	return rects.some(
		(b) => cx > b.x0 - r && cx < b.x1 + r && cz > b.z0 - r && cz < b.z1 + r,
	);
}

const YARD_KINDS = [
	"tree",
	"pool",
	"trampoline",
	"tree",
	"shed",
	"pine",
	"pool",
	"tree",
	"trampoline",
	"shed",
	"pine",
	"tree",
] as const;

/** Pools, trampolines, sheds and trees filling the space between two rows of houses. */
function buildYards(ctx: BuildContext, block: Rect, taken: Rect[]): void {
	const { rng, statics } = ctx;
	const placed: Rect[] = [];
	for (const kind of YARD_KINDS) {
		const r =
			kind === "pool"
				? 1.9
				: kind === "trampoline"
					? 1.5
					: kind === "shed"
						? 1.4
						: 1.2;
		for (let attempt = 0; attempt < 30; attempt++) {
			const x = rng.range(block.x0 + r + 0.5, block.x1 - r - 0.5);
			const z = rng.range(block.z0 + r + 0.5, block.z1 - r - 0.5);
			if (overlaps(x, z, r, taken) || overlaps(x, z, r, placed)) continue;
			placed.push({ x0: x, x1: x, z0: z, z1: z });
			const y = CELL_Y;
			if (kind === "pool") {
				const ry = rng() < 0.5 ? 0 : Math.PI / 2;
				statics.push(
					place(
						merge([
							box(3.4, 0.1, 2.4, 0xe9e6df),
							box(3.0, 0.115, 2.0, 0x4cc3f2),
						]),
						{ x, y, z, ry },
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
						{ x, y, z },
					),
				);
			} else if (kind === "shed") {
				statics.push(
					place(
						merge([
							box(1.8, 1.7, 1.5, rng.pick(SHEDS)),
							prism(2.1, 0.6, 1.8, 0x5a4a42, 0, 1.7),
						]),
						{ x, y, z, ry: rng.int(0, 3) * (Math.PI / 2) },
					),
				);
			} else if (kind === "pine") {
				statics.push(place(pine(rng.range(0.8, 1.1)), { x, y, z }));
			} else {
				statics.push(
					place(roundTree(rng.range(0.9, 1.15), rng.pick(LEAVES)), {
						x,
						y,
						z,
					}),
				);
			}
			break;
		}
	}
}

/** Cars parked along the kerbs of the two streets, away from the junction and the lane mouth. */
function buildKerbCars(ctx: BuildContext): void {
	const { rng, statics } = ctx;
	const spots: [number, number, boolean][] = [];
	for (let t = 37; t < 76; t += 6.2) {
		if (Math.abs(t - STREET) < 6) continue;
		for (const side of [ROAD_LO + 1, ROAD_HI - 1]) {
			spots.push([side, t, true]);
			spots.push([t, side, false]);
		}
	}
	for (const [a, b, alongZ] of spots) {
		if (rng() < 0.45) continue;
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

export function buildResidential(ctx: BuildContext): void {
	buildStreets(ctx);
	buildKerbCars(ctx);

	const { rng } = ctx;
	const near: [number, number] = [EDGE_LO, BLOCK_A_HI];
	const far: [number, number] = [BLOCK_B_LO, EDGE_HI];
	const taken: Rect[] = [];
	const row = (spec: RowSpec, plan: Plan, into: Rect[]): void => {
		buildRow(ctx, spec, planRow(plan, rng), into);
	};

	const nw: Rect[] = [];
	row(facingNorth(near[0], near[1], EDGE_LO), "four", nw);
	row(facingSouth(near[0], near[1], BLOCK_A_HI), "garage", nw);
	buildYards(ctx, { x0: near[0], x1: near[1], z0: near[0], z1: near[1] }, nw);

	const ne: Rect[] = [];
	row(facingWest(near[0], near[1], BLOCK_B_LO), "four", ne);
	row(facingEast(near[0], near[1], EDGE_HI), "garage", ne);
	buildYards(ctx, { x0: far[0], x1: far[1], z0: near[0], z1: near[1] }, ne);

	const sw: Rect[] = [];
	row(facingNorth(near[0], near[1], BLOCK_B_LO), "four", sw);
	row(facingSouth(near[0], near[1], EDGE_HI), "four", sw);
	buildYards(ctx, { x0: near[0], x1: near[1], z0: far[0], z1: far[1] }, sw);

	row(facingNorth(far[0], far[1], BLOCK_B_LO), "four", taken);
	const fire = buildRow(
		ctx,
		facingSouth(far[0], far[1], LANE_FRONT),
		[{ w: 5.4 }, { w: 6.4, fire: true }, { w: 5.6 }],
		taken,
	);
	if (fire) buildFireScene(ctx, fire);
}
