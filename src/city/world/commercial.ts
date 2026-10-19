import { Vector3 } from "three";
import { box, cone, cyl, place } from "../geometry";
import { BRIGHTS, FACADES, HOUSES, LANE, ROAD, SIDEWALK } from "../palette";
import { roundTree, shop, tower } from "../prefabs";
import { Polyline } from "../sim/path";
import { addFacadeWindows } from "../sim/windows";
import type { BuildContext } from "./context";
import { CELL_Y, ROAD_Y, SIDEWALK_Y } from "./layout";
import { type SignSpec, signMesh } from "./signs";

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
/** Shop fronts stand just behind the sidewalk. */
const FRONT_GAP = 3.6;
const SHOP_DEPTH = 10;
/** Centre x of the west-side shops: front face 3.6 m west of the N–S street centre. */
const NS_SHOP_X = NS_X - FRONT_GAP - SHOP_DEPTH / 2;
/** Centre height of the shop sign boards. */
const SIGN_Y = 4.2 + 0.45;
/** Sign board front face (0.08 + 0.075 off the shop face) plus a 0.02 gap. */
const SIGN_OFFSET = 0.175;

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

const WALLS = [...HOUSES, 0xf2d8c2, 0xd8dde2, 0x9fb7c9] as const;

interface ShopSpot {
	cx: number;
	cz: number;
	/** Facade width along the street. */
	w: number;
	/** Direction the front faces. */
	front: "z" | "x";
}

const SHOPS: readonly ShopSpot[] = [
	// North side of the E–W street, fronts facing +Z.
	{ cx: 39, cz: -FRONT_GAP - SHOP_DEPTH / 2, w: 8, front: "z" },
	{ cx: 65.2, cz: -FRONT_GAP - SHOP_DEPTH / 2, w: 6.6, front: "z" },
	{ cx: 72.1, cz: -FRONT_GAP - SHOP_DEPTH / 2, w: 6.6, front: "z" },
	{ cx: 79, cz: -FRONT_GAP - SHOP_DEPTH / 2, w: 6.6, front: "z" },
	// West side of the N–S street, fronts facing +X.
	{ cx: NS_SHOP_X, cz: -7.8, w: 8.4, front: "x" },
	{ cx: NS_SHOP_X, cz: -16.6, w: 8.4, front: "x" },
	{ cx: NS_SHOP_X, cz: 7.8, w: 8.4, front: "x" },
	{ cx: NS_SHOP_X, cz: 16.6, w: 8.4, front: "x" },
];

const APARTMENTS: readonly { cx: number; cz: number; w: number; d: number }[] =
	[
		{ cx: 40.8, cz: -20.2, w: 7, d: 8 },
		{ cx: 66, cz: -20.5, w: 8, d: 8 },
		{ cx: 75, cz: -20.5, w: 8, d: 8 },
		{ cx: 67, cz: 16.5, w: 9, d: 9 },
		{ cx: 77, cz: 16.5, w: 9, d: 9 },
		{ cx: 40.8, cz: 20.5, w: 7, d: 8 },
	];

const TREES: readonly (readonly [number, number])[] = [
	[49.4, 23.6],
	[63, 23.6],
	[72.5, 23.6],
	[81, 23.6],
	[81, -20],
];

const CAFE_TABLES_X = [37.8, 40.6, 43.4] as const;
const CAFE_TABLES_Z = [6.2, 9.8] as const;
const BUS_STOPS_Z = [-17, 15] as const;
const BUS_STOP_X = 35.4;

function busStop(ctx: BuildContext, z: number): void {
	const x = BUS_STOP_X;
	ctx.statics.push(
		box(1.2, 0.1, 3, 0x5a5d62, x, CELL_Y + 2.4, z),
		cyl(0.05, 0.05, 2.4, 6, 0x555555, x + 0.5, CELL_Y, z - 1.3),
		cyl(0.05, 0.05, 2.4, 6, 0x555555, x + 0.5, CELL_Y, z + 1.3),
		box(0.06, 1.8, 2.8, 0x9fc4d8, x + 0.55, CELL_Y + 0.4, z),
		box(0.45, 0.08, 2.2, 0x8a5a3c, x + 0.15, CELL_Y + 0.5, z),
		box(0.4, 0.4, 0.08, 0x444444, x + 0.15, CELL_Y, z - 0.9),
		box(0.4, 0.4, 0.08, 0x444444, x + 0.15, CELL_Y, z + 0.9),
	);
}

export function buildCommercial(ctx: BuildContext): void {
	const { rng, statics, windows } = ctx;
	const ewLen = IN_MAX_X - IN_MIN_X;
	const ewMid = (IN_MIN_X + IN_MAX_X) / 2;

	// Streets: E–W at z = 0, N–S at x = 58.
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

	// Sidewalks, interrupted at the crossing.
	const westLen = NS_X - STREET_W / 2 - IN_MIN_X;
	const eastLen = IN_MAX_X - (NS_X + STREET_W / 2);
	const segLen = IN_MAX_Z - (WALK_OFFSET + WALK / 2);
	for (const side of [-1, 1]) {
		const sz = side * WALK_OFFSET;
		statics.push(
			box(westLen, SIDEWALK_Y, WALK, SIDEWALK, IN_MIN_X + westLen / 2, 0, sz),
			box(eastLen, SIDEWALK_Y, WALK, SIDEWALK, IN_MAX_X - eastLen / 2, 0, sz),
		);
		const sx = NS_X + sz;
		const segMid = IN_MAX_Z - segLen / 2;
		statics.push(
			box(WALK, SIDEWALK_Y, segLen, SIDEWALK, sx, 0, -segMid),
			box(WALK, SIDEWALK_Y, segLen, SIDEWALK, sx, 0, segMid),
		);
	}

	// Shops with sign boards.
	const signs: SignSpec[] = [];
	SHOPS.forEach((spot, i) => {
		const h = rng.range(7, 12);
		const wall = rng.pick(WALLS);
		const awning = rng.pick(BRIGHTS);
		const geo = shop(spot.w, SHOP_DEPTH, h, wall, awning);
		const label = LABELS[i] as string;
		if (spot.front === "z") {
			statics.push(place(geo, { x: spot.cx, z: spot.cz }));
			addFacadeWindows(windows, spot.cx, spot.cz, spot.w, SHOP_DEPTH, h, {
				faces: ["z"],
				y0: 6.7,
			});
			signs.push({
				label,
				width: 3.6,
				height: 0.9,
				position: [spot.cx, SIGN_Y, spot.cz + SHOP_DEPTH / 2 + SIGN_OFFSET],
				ry: 0,
			});
		} else {
			statics.push(place(geo, { x: spot.cx, z: spot.cz, ry: Math.PI / 2 }));
			addFacadeWindows(windows, spot.cx, spot.cz, SHOP_DEPTH, spot.w, h, {
				faces: ["x"],
				y0: 6.7,
			});
			signs.push({
				label,
				width: 3.6,
				height: 0.9,
				position: [spot.cx + SHOP_DEPTH / 2 + SIGN_OFFSET, SIGN_Y, spot.cz],
				ry: Math.PI / 2,
			});
		}
	});
	ctx.group.add(signMesh(signs));

	// Apartment blocks on the remaining block edges.
	for (const a of APARTMENTS) {
		const h = rng.range(10, 14);
		statics.push(
			place(tower(a.w, a.d, h, rng.pick(FACADES)), { x: a.cx, z: a.cz }),
		);
		addFacadeWindows(windows, a.cx, a.cz, a.w, a.d, h);
	}

	// Café corner: timber deck, tables, chairs and umbrellas.
	statics.push(box(8.5, 0.05, 7, 0xc9a27a, 40, CELL_Y, 8));
	const deckY = CELL_Y + 0.05;
	for (const tx of CAFE_TABLES_X) {
		for (const tz of CAFE_TABLES_Z) {
			statics.push(
				cyl(0.05, 0.05, 0.75, 6, 0x555555, tx, deckY, tz),
				cyl(0.5, 0.5, 0.1, 10, 0xffffff, tx, deckY + 0.75, tz),
				cyl(0.04, 0.04, 2.2, 6, 0x777777, tx, deckY, tz),
				cone(1, 0.5, 8, rng.pick(BRIGHTS), tx, deckY + 2.2, tz),
				box(0.35, 0.45, 0.35, 0x8a5a3c, tx - 0.85, deckY, tz),
				box(0.35, 0.45, 0.35, 0x8a5a3c, tx + 0.85, deckY, tz),
			);
		}
	}

	busStop(ctx, BUS_STOPS_Z[0]);
	busStop(ctx, BUS_STOPS_Z[1]);

	for (const [x, z] of TREES) {
		statics.push(place(roundTree(rng.range(0.7, 0.9)), { x, y: CELL_Y, z }));
	}

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
