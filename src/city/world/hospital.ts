import { type BufferGeometry, Vector3 } from "three";
import { box, cyl, GLOW, glow, merge, place } from "../geometry";
import { TILE } from "../kit/atlas";
import { facadeAt } from "../kit/facade";
import { CARS, GRASS, ROAD, SHIRTS, SIDEWALK } from "../palette";
import { ambulance, bench, car, person, roundTree } from "../prefabs";
import { type CrowdSpot, createCrowd } from "../sim/crowd";
import { Polyline } from "../sim/path";
import { bikeRack, bin, hedge, planter, staticPerson } from "./arena";
import type { BuildContext } from "./context";
import { CELL_Y, SIDEWALK_Y } from "./layout";
import { signMesh } from "./signs";
import { tintWhite } from "./tint";

const TOWER = { x: 77.25, z: -49.5, w: 8.5, d: 7, h: 16 } as const;
const WING = { x: 74, z: -44, w: 15, d: 4, h: 9.6 } as const;
const ANNEX = { x: 69.75, z: -49.5, w: 6.5, d: 7, h: 6.4 } as const;

const RED = 0xe0242c;
const CANOPY_X0 = 67;
const CANOPY_X1 = 78;
const CANOPY_Z0 = -42;
const CANOPY_Z1 = -38.6;
const LANE_Z0 = -38.6;
const LANE_Z1 = -36.5;
const FOOT_Z = -35.75;

const PAD_RADIUS = 2.7;
const ROOF_Y = TOWER.h + 0.3;

/** Skid-contact point of the rooftop helipad (world coordinates). */
export const HELIPAD = new Vector3(TOWER.x, ROOF_Y + 0.11, TOWER.z);

function roof(
	ctx: BuildContext,
	b: { x: number; z: number; w: number; d: number; h: number },
	parapet: boolean,
): void {
	ctx.statics.push(box(b.w + 0.4, 0.3, b.d + 0.4, 0xdfe3e8, b.x, b.h, b.z));
	if (!parapet) return;
	const y = b.h + 0.3;
	ctx.statics.push(
		box(b.w + 0.4, 0.45, 0.25, 0xeceff2, b.x, y, b.z - b.d / 2 - 0.075),
		box(b.w + 0.4, 0.45, 0.25, 0xeceff2, b.x, y, b.z + b.d / 2 + 0.075),
		box(0.25, 0.45, b.d, 0xeceff2, b.x - b.w / 2 - 0.075, y, b.z),
		box(0.25, 0.45, b.d, 0xeceff2, b.x + b.w / 2 + 0.075, y, b.z),
	);
}

/** White panel with a glowing red cross; `face` is the outward axis of the wall. */
function redCross(
	ctx: BuildContext,
	face: "x" | "z",
	x: number,
	y: number,
	z: number,
): void {
	const s = ctx.statics;
	if (face === "z") {
		s.push(
			box(3.6, 3.6, 0.16, 0xf6f6f6, x, y, z + 0.08),
			glow(box(2.2, 0.7, 0.1, RED, x, y + 1.45, z + 0.2), GLOW.always),
			glow(box(0.7, 2.2, 0.1, RED, x, y + 0.7, z + 0.2), GLOW.always),
		);
	} else {
		s.push(
			box(0.16, 3.6, 3.6, 0xf6f6f6, x + 0.08, y, z),
			glow(box(0.1, 0.7, 2.2, RED, x + 0.2, y + 1.45, z), GLOW.always),
			glow(box(0.1, 2.2, 0.7, RED, x + 0.2, y + 0.7, z), GLOW.always),
		);
	}
}

function helipad(ctx: BuildContext): void {
	const s = ctx.statics;
	const { x, z } = TOWER;
	s.push(
		cyl(PAD_RADIUS + 0.12, PAD_RADIUS + 0.12, 0.06, 20, 0xf2c94c, x, ROOF_Y, z),
		cyl(PAD_RADIUS - 0.15, PAD_RADIUS - 0.15, 0.09, 20, 0x3d4147, x, ROOF_Y, z),
	);
	const top = ROOF_Y + 0.09;
	s.push(
		box(0.35, 0.02, 2, 0xffffff, x - 0.55, top, z),
		box(0.35, 0.02, 2, 0xffffff, x + 0.55, top, z),
		box(1.1, 0.02, 0.35, 0xffffff, x, top, z),
	);
	for (let i = 0; i < 10; i++) {
		const a = (i / 10) * Math.PI * 2;
		s.push(
			glow(
				box(
					0.3,
					0.25,
					0.3,
					0xffc86b,
					x + Math.cos(a) * (PAD_RADIUS + 0.35),
					ROOF_Y,
					z + Math.sin(a) * (PAD_RADIUS + 0.35),
				),
				GLOW.night,
			),
		);
	}
	s.push(
		box(1.4, 0.9, 1, 0xb9bdc1, x - 3.4, ROOF_Y, z - 2.6),
		cyl(0.3, 0.3, 0.15, 8, 0x3a3d42, x - 3.4, ROOF_Y + 0.9, z - 2.6),
	);
}

function buildEntrance(ctx: BuildContext): void {
	const s = ctx.statics;
	const cx = (CANOPY_X0 + CANOPY_X1) / 2;
	const w = CANOPY_X1 - CANOPY_X0;
	s.push(
		box(
			w,
			0.05,
			CANOPY_Z1 - CANOPY_Z0,
			0xc9ccd1,
			cx,
			CELL_Y,
			(CANOPY_Z0 + CANOPY_Z1) / 2,
		),
		box(
			w,
			0.3,
			CANOPY_Z1 - CANOPY_Z0 + 0.2,
			0xe8eaee,
			cx,
			3.5,
			(CANOPY_Z0 + CANOPY_Z1) / 2,
		),
		glow(box(w, 0.45, 0.12, RED, cx, 3.0, CANOPY_Z1 + 0.1), GLOW.always),
		box(4, 2.6, 0.1, 0x2f4866, cx, 0, CANOPY_Z0 + 0.05),
	);
	for (const x of [CANOPY_X0 + 0.5, cx, CANOPY_X1 - 0.5]) {
		s.push(cyl(0.12, 0.12, 3.5, 6, 0xcfd3d8, x, CELL_Y, CANOPY_Z1 - 0.2));
	}
	for (const x of [70, 75.3]) {
		s.push(
			place(ambulance(), {
				x,
				y: CELL_Y + 0.05,
				z: (CANOPY_Z0 + CANOPY_Z1) / 2,
				ry: Math.PI / 2,
			}),
		);
	}
}

function buildGrounds(ctx: BuildContext): void {
	const s = ctx.statics;
	s.push(
		box(15.6, 0.05, 11.8, GRASS, 74.2, CELL_Y, -48.1),
		box(
			4,
			0.05,
			CANOPY_Z1 - CANOPY_Z0,
			GRASS,
			80,
			CELL_Y,
			(CANOPY_Z0 + CANOPY_Z1) / 2,
		),
		box(
			15.6,
			0.03,
			LANE_Z1 - LANE_Z0,
			ROAD,
			74.2,
			CELL_Y,
			(LANE_Z0 + LANE_Z1) / 2,
		),
		box(15.6, 0.08, 1.5, SIDEWALK, 74.2, CELL_Y, FOOT_Z),
	);
	const laneY = CELL_Y + 0.03;
	for (const [x, ry] of [
		[67.6, -Math.PI / 2],
		[79.2, Math.PI / 2],
	] as const) {
		s.push(
			place(tintWhite(car(), ctx.rng.pick(CARS)), {
				x,
				y: laneY,
				z: (LANE_Z0 + LANE_Z1) / 2,
				ry,
			}),
		);
	}
	for (const x of [71, 72.2, 76.5, 80.5]) {
		s.push(
			place(tintWhite(person(), ctx.rng.pick(SHIRTS)), {
				x,
				y: SIDEWALK_Y,
				z: FOOT_Z + ctx.rng.range(-0.3, 0.3),
				ry: ctx.rng.range(0, Math.PI * 2),
			}),
		);
	}
	s.push(
		place(roundTree(0.6), { x: 80.4, y: CELL_Y + 0.05, z: -40.4 }),
		place(bench(), { x: 80.4, y: CELL_Y + 0.05, z: -38.9 }),
		place(roundTree(0.55), { x: 67.6, y: CELL_Y + 0.05, z: -53.7 }),
		place(roundTree(0.55), { x: 81.4, y: CELL_Y + 0.05, z: -53.7 }),
	);
	ctx.sidewalks.push(
		new Polyline(
			[
				new Vector3(65, SIDEWALK_Y, FOOT_Z),
				new Vector3(81.8, SIDEWALK_Y, FOOT_Z),
			],
			false,
		),
	);
}

const SCRUBS = 0x59c8e8;
const FLOWERS = [0xe8463c, 0xf2c94c, 0xf29ec8, 0xffffff, 0x9b6bf2] as const;
const ROOF_GRASS_Y = ANNEX.h + 0.3;

function flowerBed(
	ctx: BuildContext,
	x: number,
	z: number,
	w: number,
	d: number,
	y: number,
): void {
	ctx.statics.push(box(w, 0.15, d, 0x6b4a2f, x, y, z));
	for (let fx = x - w / 2 + 0.15; fx < x + w / 2 - 0.05; fx += 0.3) {
		for (let fz = z - d / 2 + 0.15; fz < z + d / 2 - 0.05; fz += 0.3) {
			ctx.statics.push(
				box(0.18, 0.2, 0.18, ctx.rng.pick(FLOWERS), fx, y + 0.15, fz),
			);
		}
	}
}

function wheelchair(ctx: BuildContext, x: number, z: number, ry: number): void {
	const parts: BufferGeometry[] = [
		box(0.45, 0.06, 0.45, 0x2b2f36, 0, 0.45, 0),
		box(0.45, 0.5, 0.06, 0x2b2f36, 0, 0.45, -0.22),
		box(0.05, 0.5, 0.5, 0x555a60, -0.28, 0, 0),
		box(0.05, 0.5, 0.5, 0x555a60, 0.28, 0, 0),
	];
	ctx.statics.push(place(merge(parts), { x, y: SIDEWALK_Y, z, ry }));
	ctx.statics.push(
		place(tintWhite(person(), ctx.rng.pick(SHIRTS)), {
			x,
			y: SIDEWALK_Y - 0.25,
			z,
			ry,
		}),
	);
}

function buildDetails(ctx: BuildContext): void {
	const s = ctx.statics;
	const gy = CELL_Y + 0.05;
	const laneY = CELL_Y + 0.03;

	// Ambulance bay: bay lines under the canopy and a third ambulance on the lane.
	for (const x of [67.4, 72.85, 78.2]) {
		s.push(box(0.12, 0.02, 3.2, 0xf2c94c, x, gy, -40.3));
	}
	s.push(
		place(ambulance(), {
			x: 72.8,
			y: laneY,
			z: (LANE_Z0 + LANE_Z1) / 2,
			ry: -Math.PI / 2,
		}),
	);
	for (const x of [68.6, 69.4, 76.4, 77.2]) {
		s.push(
			place(tintWhite(person(), SCRUBS), {
				x,
				y: gy,
				z: -38.85,
				ry: ctx.rng.range(0, Math.PI * 2),
			}),
		);
	}

	// Hedges, flower beds and trees on the lawn behind the tower.
	for (let x = 68.6; x < 80.7; x += 1.2) {
		const bed = [71.6, 74.6, 77.6].some((b) => Math.abs(x - b) < 1);
		if (bed) continue;
		hedge(ctx, x, -53.5, 1.2, 0.5, gy, 0.7);
	}
	for (const x of [71.6, 74.6, 77.6]) flowerBed(ctx, x, -53.5, 1.6, 0.6, gy);
	for (const z of [-52.5, -49.5, -46.5, -43.5]) {
		s.push(place(roundTree(0.5), { x: 82.3, y: gy, z }));
	}
	s.push(
		box(0.5, 0.05, 18.9, GRASS, 82.25, CELL_Y, -44.8),
		place(bench(), { x: 66.9, y: gy, z: -53.4, ry: Math.PI }),
	);

	// Grass strip beside the canopy.
	flowerBed(ctx, 78.7, -41.7, 1.4, 0.5, gy);
	bikeRack(ctx, 78.9, -40.4, gy, Math.PI / 2);
	planter(ctx, 81.5, -41.4, gy);
	s.push(
		place(bench(), { x: 78.8, y: gy, z: -38.9 }),
		place(tintWhite(person(), SCRUBS), {
			x: 80.4,
			y: gy - 0.2,
			z: -38.9,
			ry: 0,
		}),
	);
	bin(ctx, 81.6, -39.1, gy);

	// Patients and staff on the footway.
	wheelchair(ctx, 69.5, FOOT_Z, Math.PI);
	s.push(
		place(tintWhite(person(), SCRUBS), {
			x: 70.3,
			y: SIDEWALK_Y,
			z: FOOT_Z + 0.2,
			ry: -Math.PI / 2,
		}),
	);
	wheelchair(ctx, 74.5, FOOT_Z - 0.1, Math.PI);
	staticPerson(ctx, 75.3, SIDEWALK_Y, FOOT_Z + 0.2);
	bin(ctx, 66.3, FOOT_Z - 0.3, SIDEWALK_Y);

	// 'Rx' pharmacy kiosk on the walkway.
	s.push(
		box(1.2, 1.9, 1.2, 0xf4f5f7, 63.4, SIDEWALK_Y, -45.5),
		box(1.4, 0.15, 1.4, 0x2f9e5a, 63.4, SIDEWALK_Y + 1.9, -45.5),
		box(0.35, 0.06, 1.0, 0xd9d9d6, 64.1, SIDEWALK_Y + 0.95, -45.5),
		glow(
			box(0.06, 0.55, 0.16, 0x2fbf6a, 64.03, SIDEWALK_Y + 1.1, -45.5),
			GLOW.always,
		),
		glow(
			box(0.06, 0.16, 0.55, 0x2fbf6a, 64.03, SIDEWALK_Y + 1.1, -45.5),
			GLOW.always,
		),
	);
	ctx.group.add(
		signMesh([
			{
				label: "Rx",
				width: 1.0,
				height: 0.3,
				position: [64.07, SIDEWALK_Y + 1.7, -45.5],
				ry: Math.PI / 2,
			},
		]),
	);

	// Roof details: skylights and AC on the wing, a roof garden on the annex.
	const wy = WING.h + 0.3;
	for (const [x, w] of [
		[69.4, 1.6],
		[75.7, 1.4],
		[80.4, 1.4],
	] as const) {
		s.push(
			box(w + 0.2, 0.15, 1.6, 0xb9bdc1, x, wy, -44),
			box(w, 0.35, 1.4, 0x8fb9d6, x, wy + 0.1, -44),
		);
	}
	s.push(
		box(1.4, 0.9, 1, 0xb9bdc1, 71.3, wy, -44.5),
		cyl(0.3, 0.3, 0.15, 8, 0x3a3d42, 71.3, wy + 0.9, -44.5),
		box(1.4, 0.8, 1, 0xa7acb2, 67.9, wy, -43.3),
		cyl(0.3, 0.3, 0.15, 8, 0x3a3d42, 67.9, wy + 0.8, -43.3),
		box(0.15, 0.15, 2.6, 0x8c9196, 72.6, wy, -44.2),
	);
	s.push(box(2.4, 0.12, 4.4, GRASS, 71.4, ROOF_GRASS_Y, -50));
	const ry = ROOF_GRASS_Y + 0.12;
	hedge(ctx, 70.05, -50, 0.4, 4.2, ry, 0.5);
	for (const z of [-51.6, -48.4]) {
		s.push(place(roundTree(0.3), { x: 71.4, y: ry, z }));
	}
	s.push(place(bench(), { x: 72.2, y: ry, z: -50, ry: Math.PI / 2 }));
	flowerBed(ctx, 72.4, -48.3, 0.5, 0.5, ry);

	// Crowd: footway, canopy front, walkway, bus queues, taxi rank and cafe strip.
	const spots: CrowdSpot[] = [];
	for (const x of [68.2, 70.2, 72, 74.5, 76.3, 78.2, 80]) {
		spots.push({ x, z: FOOT_Z + 0.1, y: SIDEWALK_Y });
	}
	for (const x of [68, 70.8, 73.6, 76.8]) {
		spots.push({ x, z: -38.9, y: gy });
	}
	for (const z of [-37, -41, -44, -48, -51]) {
		spots.push({ x: 64.7 + ctx.rng.range(-0.4, 0.4), z, y: SIDEWALK_Y });
	}
	// Bus terminal queues (boarding island) and taxi rank.
	for (const [x, z] of [
		[71, -78.5],
		[72.4, -77.6],
		[73.6, -78.6],
		[75.4, -77.5],
		[77, -78.4],
		[78.2, -77.6],
	] as const) {
		spots.push({ x, z, y: CELL_Y + 0.15 });
	}
	for (const x of [72.9, 77.3, 81.2]) {
		spots.push({ x, z: -71.9, y: CELL_Y + 0.03 });
	}
	// Pharmacy / cafe strip queues.
	for (const x of [49.4, 51.8, 54, 56.8, 58.6, 61.4]) {
		spots.push({ x, z: -35.9, y: SIDEWALK_Y });
	}
	createCrowd(ctx, spots, { count: 28, spread: 0.3, cheer: false });
}

/** Hospital in the NE cell's south-east corner: tower with rooftop helipad, ER wing and canopy. */
export function buildHospital(ctx: BuildContext): void {
	ctx.facades.push(
		facadeAt(TOWER.w, TOWER.d, TOWER.h, {
			upper: TILE.hospital,
			seed: 81,
			x: TOWER.x,
			z: TOWER.z,
		}),
		facadeAt(WING.w, WING.d, WING.h, {
			upper: TILE.hospital,
			ground: TILE.lobby,
			seed: 82,
			x: WING.x,
			z: WING.z,
		}),
		facadeAt(ANNEX.w, ANNEX.d, ANNEX.h, {
			upper: TILE.officeWhite,
			seed: 83,
			x: ANNEX.x,
			z: ANNEX.z,
		}),
	);
	roof(ctx, TOWER, true);
	roof(ctx, WING, false);
	roof(ctx, ANNEX, false);
	ctx.statics.push(
		box(1.4, 0.9, 1, 0xb9bdc1, 69, ANNEX.h + 0.3, -49),
		box(1.4, 0.9, 1, 0xb9bdc1, 78, WING.h + 0.3, -44),
		box(2, 1.6, 1.6, 0xa7acb2, 73.5, WING.h + 0.3, -44),
	);

	redCross(ctx, "z", TOWER.x, 11.1, TOWER.z + TOWER.d / 2);
	redCross(ctx, "x", TOWER.x + TOWER.w / 2, 11.1, TOWER.z);

	helipad(ctx);
	buildEntrance(ctx);
	buildGrounds(ctx);
	buildDetails(ctx);
}
