import { type BufferGeometry, Vector3 } from "three";
import { box, cone, cyl, place, prism } from "../geometry";
import { darken, FIELD_A, FIELD_B, FIELD_C, LEAF } from "../palette";
import { fencePost, house, roundTree } from "../prefabs";
import { createFarm, createWindmills, type Rect } from "../sim/farm";
import type { BuildContext } from "./context";
import { CELL_Y } from "./layout";

const Y = CELL_Y;
const PATCH = 0.04;
const RAIL = 0xf2efe6;
const BARN_WALL = 0xb5544a;
const LEAVES = [LEAF, 0x6cbf5a, 0x4fa04a] as const;

// Usable area is x[-82.5,-34.5] z[-25.5,25.5]: every cell edge carries a 1.5 m sidewalk.
const CROP: Rect = { minX: -82, maxX: -52, minZ: -25, maxZ: -14 };
const CROP_SPLIT_X = -67;
const COWS: Rect = { minX: -82, maxX: -49, minZ: -8, maxZ: 8 };
const SHEEP: Rect = { minX: -82, maxX: -42, minZ: 13.5, maxZ: 25 };
const ORCHARD: Rect = { minX: -48.7, maxX: -35.5, minZ: -25, maxZ: -15 };

const WINDMILLS = [
	{ x: -74, z: -11 },
	{ x: -60, z: 10.5 },
] as const;
const WINDMILL_HEIGHT = 10;
const WINDMILL_FACING = Math.PI / 4;

function patch(r: Rect, hex: number): BufferGeometry {
	return box(
		r.maxX - r.minX,
		PATCH,
		r.maxZ - r.minZ,
		hex,
		(r.minX + r.maxX) / 2,
		Y,
		(r.minZ + r.maxZ) / 2,
	);
}

function fence(out: BufferGeometry[], r: Rect): void {
	const w = r.maxX - r.minX;
	const d = r.maxZ - r.minZ;
	const cx = (r.minX + r.maxX) / 2;
	const cz = (r.minZ + r.maxZ) / 2;
	for (const h of [0.35, 0.7]) {
		for (const z of [r.minZ, r.maxZ])
			out.push(box(w, 0.07, 0.06, RAIL, cx, Y + h, z));
		for (const x of [r.minX, r.maxX])
			out.push(box(0.06, 0.07, d, RAIL, x, Y + h, cz));
	}
	const nx = Math.ceil(w / 2);
	const nz = Math.ceil(d / 2);
	for (let i = 0; i <= nx; i++) {
		const x = r.minX + (w * i) / nx;
		for (const z of [r.minZ, r.maxZ])
			out.push(place(fencePost(), { x, y: Y, z }));
	}
	for (let j = 1; j < nz; j++) {
		const z = r.minZ + (d * j) / nz;
		for (const x of [r.minX, r.maxX])
			out.push(place(fencePost(), { x, y: Y, z }));
	}
}

function cropFields(out: BufferGeometry[]): void {
	// West field: stripes run along x, alternating every 2 m in z.
	for (let z = CROP.minZ, i = 0; z < CROP.maxZ - 1e-6; z += 2, i++) {
		const stripe = {
			minX: CROP.minX,
			maxX: CROP_SPLIT_X,
			minZ: z,
			maxZ: Math.min(z + 2, CROP.maxZ),
		};
		out.push(patch(stripe, i % 2 ? darken(FIELD_A, 0.85) : FIELD_A));
	}
	// East field: golden stripes run along z, alternating every 2 m in x.
	for (let x = CROP_SPLIT_X, i = 0; x < CROP.maxX - 1e-6; x += 2, i++) {
		const stripe = {
			minX: x,
			maxX: Math.min(x + 2, CROP.maxX),
			minZ: CROP.minZ,
			maxZ: CROP.maxZ,
		};
		out.push(patch(stripe, i % 2 ? darken(FIELD_C, 0.85) : FIELD_C));
	}
}

function farmstead(out: BufferGeometry[]): void {
	out.push(place(house(7, 8, 0xf6e7d8, 0xb5544a), { x: -41.8, z: -5 }));

	out.push(
		box(10, 6, 8, BARN_WALL, -40.5, 0, 6.5),
		prism(10.6, 3, 8.6, 0x7a2f2a, -40.5, 6, 6.5),
		box(3, 4, 0.12, 0xf4efe0, -40.5, 0, 10.55),
		box(1.6, 1.2, 0.12, 0xf4efe0, -40.5, 4.2, 10.55),
	);

	out.push(
		cyl(2, 2, 9, 12, 0xd0d0d0, -36.8, 0, -12),
		cone(2.1, 1.2, 12, 0x888888, -36.8, 9, -12),
	);

	// Dirt track from the avenue sidewalk to the yard between house and barn.
	out.push(box(11.5, 0.05, 2.2, 0xa58a5e, -40.25, Y, 0.75));
}

export function buildRural(ctx: BuildContext): void {
	const out = ctx.statics;
	const { rng } = ctx;

	cropFields(out);
	out.push(
		patch(COWS, 0x88c874),
		patch(SHEEP, FIELD_B),
		patch(ORCHARD, 0x6fb85e),
	);
	fence(out, COWS);
	fence(out, SHEEP);

	farmstead(out);

	for (const x of [-47, -43.7, -40.4, -37.1]) {
		for (const z of [-23.5, -20.2, -16.9]) {
			out.push(place(roundTree(0.9, rng.pick(LEAVES)), { x, z }));
		}
	}
	for (const [x, z] of [
		[-49.5, -11.5],
		[-47.5, 12],
		[-66, -11.5],
		[-55, 11],
	] as const) {
		out.push(place(roundTree(rng.range(0.9, 1.2), rng.pick(LEAVES)), { x, z }));
	}

	const facing = new Vector3(
		Math.sin(WINDMILL_FACING),
		0,
		Math.cos(WINDMILL_FACING),
	);
	const hubs: Vector3[] = [];
	for (const m of WINDMILLS) {
		out.push(
			cyl(1.2, 2, WINDMILL_HEIGHT, 8, 0xe8e2d0, m.x, 0, m.z),
			cone(1.6, 1.5, 8, 0x8a5a3c, m.x, WINDMILL_HEIGHT, m.z),
		);
		hubs.push(
			new Vector3(
				m.x + facing.x * 1.2,
				WINDMILL_HEIGHT + 0.7,
				m.z + facing.z * 1.2,
			),
		);
	}
	createWindmills(ctx, hubs);

	createFarm(ctx, { cows: COWS, sheep: SHEEP, field: CROP });
}
