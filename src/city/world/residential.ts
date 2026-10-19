import { type BufferGeometry, Vector3 } from "three";
import { box, place } from "../geometry";
import { CARS, HOUSES, LANE, ROAD, ROOFS, SIDEWALK } from "../palette";
import { car, fencePost, house, lamp, roundTree } from "../prefabs";
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
const STREET_LO = STREET - STREET_WIDTH / 2 - SIDEWALK_W;
const STREET_HI = STREET + STREET_WIDTH / 2 + SIDEWALK_W;
/** Sidewalk centrelines used by the pedestrian network. */
const WALK_LO = 33.75;
const WALK_MID_A = STREET_LO + SIDEWALK_W / 2;
const WALK_MID_B = STREET_HI - SIDEWALK_W / 2;
const WALK_HI = 83.25;

const LAWN = 0x8fd16a;
const DRIVEWAY = 0xb8b8b8;
const FENCE = 0xf2efe6;
const LAWN_W = 8;
const LAWN_D = 9;
const HOUSE_W = 6;
const HOUSE_D = 7;

interface Block {
	x0: number;
	x1: number;
	z0: number;
	z1: number;
	/** Rotation that turns local +Z (front-row facing) toward the nearest street. */
	theta: number;
}

const BLOCKS: readonly Block[] = [
	{ x0: EDGE_LO, x1: STREET_LO, z0: EDGE_LO, z1: STREET_LO, theta: 0 },
	{ x0: STREET_HI, x1: EDGE_HI, z0: EDGE_LO, z1: STREET_LO, theta: 0 },
	{
		x0: EDGE_LO,
		x1: STREET_LO,
		z0: STREET_HI,
		z1: EDGE_HI,
		theta: Math.PI / 2,
	},
	{
		x0: STREET_HI,
		x1: EDGE_HI,
		z0: STREET_HI,
		z1: EDGE_HI,
		theta: -Math.PI / 2,
	},
];

const UP = new Vector3(0, 1, 0);

function walk(...pts: [number, number][]): Vector3[] {
	return pts.map(([x, z]) => new Vector3(x, SIDEWALK_Y, z));
}

function buildStreets(ctx: BuildContext): void {
	const s = ctx.statics;
	const len = EDGE_HI - EDGE_LO;
	const mid = (EDGE_LO + EDGE_HI) / 2;

	s.push(box(STREET_WIDTH, ROAD_Y, len, ROAD, STREET, 0, mid));
	s.push(box(len, ROAD_Y, STREET_WIDTH, ROAD, mid, 0, STREET));
	for (let t = EDGE_LO + 4; t < EDGE_HI - 3; t += 4) {
		if (Math.abs(t - STREET) < STREET_WIDTH + 1) continue;
		s.push(box(0.25, 0.02, 1.6, LANE, STREET, ROAD_Y, t));
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
	// One L-shaped sidewalk per block, hugging the two street-facing edges.
	strip(STREET_LO - SIDEWALK_W, STREET_LO, EDGE_LO, STREET_LO);
	strip(EDGE_LO, STREET_LO, STREET_LO - SIDEWALK_W, STREET_LO);
	strip(STREET_HI, STREET_HI + SIDEWALK_W, EDGE_LO, STREET_LO);
	strip(STREET_HI, EDGE_HI, STREET_LO - SIDEWALK_W, STREET_LO);
	strip(STREET_LO - SIDEWALK_W, STREET_LO, STREET_HI, EDGE_HI);
	strip(EDGE_LO, STREET_LO, STREET_HI, STREET_HI + SIDEWALK_W);
	strip(STREET_HI, STREET_HI + SIDEWALK_W, STREET_HI, EDGE_HI);
	strip(STREET_HI, EDGE_HI, STREET_HI, STREET_HI + SIDEWALK_W);

	for (const x of [WALK_MID_A, WALK_MID_B]) {
		for (const z of [WALK_MID_A, WALK_MID_B]) {
			s.push(place(lamp(), { x, y: SIDEWALK_Y, z }));
		}
	}

	ctx.sidewalks.push(
		new Polyline(walk([WALK_MID_A, WALK_LO], [WALK_MID_A, WALK_HI]), false),
		new Polyline(walk([WALK_MID_B, WALK_LO], [WALK_MID_B, WALK_HI]), false),
		new Polyline(walk([WALK_LO, WALK_MID_A], [WALK_HI, WALK_MID_A]), false),
		new Polyline(walk([WALK_LO, WALK_MID_B], [WALK_HI, WALK_MID_B]), false),
	);

	// Closed stroll visiting the front of every row of houses.
	ctx.residentialLoop = new Polyline(
		walk(
			[WALK_LO, WALK_LO],
			[WALK_HI, WALK_LO],
			[WALK_HI, WALK_HI],
			[WALK_MID_B, WALK_HI],
			[WALK_MID_B, WALK_MID_A],
			[WALK_HI, WALK_MID_A],
			[WALK_LO, WALK_MID_A],
			[WALK_LO, WALK_HI],
			[WALK_MID_A, WALK_HI],
			[WALK_MID_A, WALK_MID_A],
			[WALK_MID_A, WALK_LO],
		),
		true,
	);
}

/**
 * One row of two houses in a block-local frame (block centre at the origin, house
 * fronts and lawn front edge toward +Z at z = depth / 2), rotated by `phi` into the world.
 */
function buildRow(
	ctx: BuildContext,
	cx: number,
	cz: number,
	phi: number,
	width: number,
	depth: number,
): void {
	const { rng, statics } = ctx;
	const front = depth / 2;
	const lawnZ = front - LAWN_D / 2;
	const backZ = front - LAWN_D;
	const houseZ = backZ + 0.8 + HOUSE_D / 2;
	const doorZ = houseZ + HOUSE_D / 2 + 0.3;
	const lawnY = CELL_Y;

	const put = (
		geo: BufferGeometry,
		x: number,
		y: number,
		z: number,
		ry = 0,
	): void => {
		if (ry) geo.rotateY(ry);
		geo.translate(x, y, z);
		statics.push(place(geo, { ry: phi, x: cx, z: cz }));
	};

	const centres = [-(width / 2 - LAWN_W / 2), width / 2 - LAWN_W / 2];

	centres.forEach((u, index) => {
		put(box(LAWN_W, 0.05, LAWN_D, LAWN), u, lawnY, lawnZ);
		put(
			house(HOUSE_W, HOUSE_D, rng.pick(HOUSES), rng.pick(ROOFS)),
			u,
			lawnY + 0.05,
			houseZ,
		);

		const door = new Vector3(u, CELL_Y, doorZ).applyAxisAngle(UP, phi);
		ctx.residentialDoors.push(door.add(new Vector3(cx, 0, cz)));

		// Low fence: sides and back are solid, the front leaves a gate gap at the door.
		const fy = lawnY + 0.05;
		const left = u - LAWN_W / 2;
		const right = u + LAWN_W / 2;
		for (const x of [left, right]) {
			for (let k = 0; k <= 4; k++) {
				put(fencePost(), x, fy, backZ + (k * LAWN_D) / 4);
			}
			put(box(0.06, 0.06, LAWN_D, FENCE), x, fy + 0.55, lawnZ);
		}
		for (const dx of [-2, 0, 2]) put(fencePost(), u + dx, fy, backZ);
		put(box(LAWN_W, 0.06, 0.06, FENCE), u, fy + 0.55, backZ);
		for (const sign of [-1, 1]) {
			for (const dx of [2, 0.9]) put(fencePost(), u + sign * dx, fy, front);
			put(box(3.1, 0.06, 0.06, FENCE), u + sign * 2.45, fy + 0.55, front);
		}

		if (index === 0) {
			const driveU = u + LAWN_W / 2 + 1.25;
			put(box(2.5, 0.06, 6, DRIVEWAY), driveU, lawnY, front - 3);
			put(
				tintWhite(car(), rng.pick(CARS)),
				driveU,
				lawnY + 0.06,
				front - 3.2,
				Math.PI,
			);
		}
	});

	for (const u of centres) {
		put(roundTree(0.7), u + rng.range(-0.5, 0.5), lawnY, 0);
	}
}

export function buildResidential(ctx: BuildContext): void {
	buildStreets(ctx);

	for (const b of BLOCKS) {
		const cx = (b.x0 + b.x1) / 2;
		const cz = (b.z0 + b.z1) / 2;
		const alongX = b.theta === 0;
		const width = alongX ? b.x1 - b.x0 : b.z1 - b.z0;
		const depth = alongX ? b.z1 - b.z0 : b.x1 - b.x0;
		buildRow(ctx, cx, cz, b.theta, width, depth);
		buildRow(ctx, cx, cz, b.theta + Math.PI, width, depth);
	}
}
