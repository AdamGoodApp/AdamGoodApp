import { type BufferGeometry, Vector3 } from "three";
import { box, cone, cyl, GLOW, glow, merge, place } from "../geometry";
import { apartment, office, skyscraper, walkup } from "../kit/buildings";
import { BRIGHTS, CARS, PAVEMENT, ROAD, SIDEWALK } from "../palette";
import { bench, car, lamp, roundTree } from "../prefabs";
import { type CrowdSpot, createCrowd } from "../sim/crowd";
import { Polyline } from "../sim/path";
import type { BuildContext } from "./context";
import { ROAD_Y, SIDEWALK_Y } from "./layout";
import { tintWhite } from "./tint";

/** Inner edges of the cell, between the ring-road and avenue sidewalks. */
const INNER_MIN = -82.5;
const INNER_MAX = -34.5;
const STREETS = [-67, -50] as const;
const STREET_W = 4;
const WALK = 1.5;
/** Sidewalk centrelines of the ring road / avenue bordering the cell. */
const RING_WALK = -83.25;
const AVENUE_WALK = -33.75;

const EDGES = [
	INNER_MIN,
	STREETS[0] - STREET_W / 2,
	STREETS[0] + STREET_W / 2,
	STREETS[1] - STREET_W / 2,
	STREETS[1] + STREET_W / 2,
	INNER_MAX,
] as const;
/** Pavement block ranges per row/column (index 0 is the far, z/x = −84 side). */
const BLOCKS: readonly (readonly [number, number])[] = [
	[EDGES[0], EDGES[1]],
	[EDGES[2], EDGES[3]],
	[EDGES[4], EDGES[5]],
];
/** Landmark tower heights for the far row, west → east. */
const SKYLINE = [62, 54, 46] as const;

/** The block nearest the park mixes walk-ups around a small plaza. */
const PLAZA_CENTRE = -37.35;
const PLAZA_SIZE = 5.7;
/** Street trees stand just inside the avenue sidewalk (x or z = −35.05). */
const TREE_LINE = -35.05;

type Range = readonly [number, number];

/** Buildings for one block (r = row from the far z edge, c = column from the west). */
function fillBlock(
	ctx: BuildContext,
	r: number,
	c: number,
	xr: Range,
	zr: Range,
): void {
	const x0 = xr[0] + WALK;
	const x1 = xr[1] - WALK;
	const z0 = zr[0] + WALK;
	const z1 = zr[1] - WALK;
	const w = x1 - x0;
	const d = z1 - z0;
	const cx = (x0 + x1) / 2;
	const cz = (z0 + z1) / 2;
	// Fronts face +X or +Z (toward the camera) so lobbies and shops are visible.
	const front = Math.PI / 2;
	if (r === 0) {
		const style = (["deco", "glass", "modern"] as const)[c];
		skyscraper(
			ctx,
			{ x: cx, z: cz, w: w - 0.6, d: d - 0.6 },
			{ height: SKYLINE[c] ?? 40, style },
		);
		return;
	}
	if (r === 1 && c === 0) {
		skyscraper(
			ctx,
			{ x: cx, z: cz, w: w - 1.5, d: d - 1.5 },
			{ height: 40, style: "deco" },
		);
		return;
	}
	if (r === 1) {
		const half = d / 2;
		office(
			ctx,
			{ x: cx, z: z0 + half / 2, w: w - 0.4, d: half - 0.3 },
			{ floors: c === 1 ? 11 : 9 },
		);
		office(
			ctx,
			{ x: cx, z: z1 - half / 2, w: w - 0.4, d: half - 0.3 },
			{ floors: c === 1 ? 7 : 12, setback: c === 2 },
		);
		return;
	}
	if (r === 2 && c === 1) {
		apartment(
			ctx,
			{ x: x0 + w * 0.3, z: cz, w: w * 0.55, d: d - 0.6, ry: front },
			{ floors: 8 },
		);
		walkup(
			ctx,
			{ x: x1 - w * 0.2, z: z0 + d * 0.27, w: d * 0.5, d: w * 0.36, ry: front },
			{ floors: 5 },
		);
		walkup(
			ctx,
			{
				x: x1 - w * 0.2,
				z: z1 - d * 0.23,
				w: d * 0.42,
				d: w * 0.36,
				ry: front,
			},
			{ floors: 3 },
		);
		return;
	}
	// Walk-up quarter: four narrow buildings, fronts on the two streets nearest the camera.
	const plaza = c === 2;
	const lots = [
		{ x: x0 + w * 0.25, z: z0 + d * 0.25, ry: front },
		{ x: x0 + w * 0.25, z: z1 - d * 0.25, ry: front },
		{ x: x1 - w * 0.25, z: z0 + d * 0.25, ry: 0 },
		{ x: x1 - w * 0.25, z: z1 - d * 0.25, ry: 0 },
	];
	lots.forEach((l, i) => {
		if (plaza && i === 3) return;
		walkup(
			ctx,
			{ ...l, w: w / 2 - 0.4, d: d / 2 - 0.4 },
			{ floors: ctx.rng.int(3, 6) },
		);
	});
}

/** Cars parked along both curbs of every internal street (no traffic runs there). */
function parkedCars(ctx: BuildContext): void {
	const { rng, statics } = ctx;
	for (const c of STREETS) {
		for (const side of [-1, 1]) {
			const lane = c + side * 0.95;
			for (const [a0, a1] of BLOCKS) {
				for (let t = a0 + 2.6; t <= a1 - 2.6; t += 5.4) {
					if (rng() < 0.3) continue;
					const hex = rng.pick(CARS);
					const flip = rng() < 0.5 ? Math.PI : 0;
					statics.push(
						place(tintWhite(car(), hex), {
							x: lane,
							y: ROAD_Y,
							z: t,
							ry: flip,
						}),
						place(tintWhite(car(), rng.pick(CARS)), {
							x: t,
							y: ROAD_Y,
							z: lane,
							ry: Math.PI / 2 + flip,
						}),
					);
				}
			}
		}
	}
}

/** Small trees on the sidewalks that run beside the internal streets. */
function streetTrees(ctx: BuildContext): void {
	const { rng, statics } = ctx;
	for (let i = 0; i < 3; i++) {
		const xr = BLOCKS[i] as Range;
		for (const edge of [
			...(i > 0 ? [xr[0] + 0.5] : []),
			...(i < 2 ? [xr[1] - 0.5] : []),
		]) {
			for (const [z0, z1] of BLOCKS) {
				for (let t = z0 + 3; t <= z1 - 3; t += 5.5) {
					statics.push(
						place(roundTree(rng.range(0.5, 0.6)), {
							x: edge,
							y: SIDEWALK_Y,
							z: t,
						}),
						place(roundTree(rng.range(0.5, 0.6)), {
							x: t,
							y: SIDEWALK_Y,
							z: edge,
						}),
					);
				}
			}
		}
	}
}

const KIOSKS = [
	[-64.25, -47.25, 0],
	[-52.75, -52.75, Math.PI / 2],
	[-47.25, -64.25, 0],
	[-69.75, -64.25, Math.PI / 2],
] as const;

function kiosk(hex: number): BufferGeometry {
	return merge([
		box(1.0, 1.6, 0.9, hex, 0, 0),
		box(1.3, 0.12, 1.2, 0x444a52, 0, 1.6),
		box(1.0, 0.06, 0.5, 0xf4f4f4, 0, 1.45, 0.6),
		box(0.8, 0.5, 0.05, 0xf2eee0, 0, 0.7, 0.47),
		glow(box(0.7, 0.25, 0.06, 0xfff1a8, 0, 1.75, 0.55), GLOW.night),
	]);
}

function subwayEntrance(): BufferGeometry {
	const parts = [
		box(2.0, 0.04, 1.1, 0x1c1f26, 0, 0.01),
		box(2.2, 0.8, 0.12, 0x4a4d52, 0, 0, 0.62),
		box(2.2, 0.8, 0.12, 0x4a4d52, 0, 0, -0.62),
		box(2.5, 0.1, 1.5, 0x3a6ea5, 0, 2.4),
		glow(box(0.9, 0.55, 0.08, 0x3b7dd8, 1.35, 2.5, 0.2), GLOW.always),
	];
	for (const px of [-1.1, 1.1]) {
		for (const pz of [-0.65, 0.65]) {
			parts.push(cyl(0.05, 0.05, 2.4, 6, 0x333840, px, 0, pz));
		}
	}
	return merge(parts);
}

function kiosksAndSubway(ctx: BuildContext): void {
	for (const [x, z, ry] of KIOSKS) {
		ctx.statics.push(
			place(kiosk(ctx.rng.pick(BRIGHTS)), { x, y: SIDEWALK_Y, z, ry }),
		);
	}
	ctx.statics.push(
		place(subwayEntrance(), { x: -41.25, y: SIDEWALK_Y, z: -47.25 }),
	);
}

const CURB = 2.3;

function hydrant(): BufferGeometry {
	return merge([
		cyl(0.13, 0.15, 0.55, 6, 0xe8463c, 0, 0, 0),
		cone(0.15, 0.14, 6, 0xe8463c, 0, 0.55, 0),
		box(0.34, 0.1, 0.1, 0xe8463c, 0, 0.3, 0),
	]);
}

function mailbox(): BufferGeometry {
	return merge([
		box(0.1, 0.45, 0.1, 0x444a52, 0, 0, 0),
		box(0.5, 0.4, 0.4, 0x3b7dd8, 0, 0.45, 0),
		box(0.52, 0.08, 0.42, 0x2f64b0, 0, 0.85, 0),
	]);
}

function bin(): BufferGeometry {
	return merge([
		cyl(0.22, 0.19, 0.7, 8, 0x4a5560, 0, 0, 0),
		cyl(0.24, 0.24, 0.06, 8, 0x2f3740, 0, 0.7, 0),
	]);
}

function phoneBooth(): BufferGeometry {
	const parts = [
		box(0.9, 0.12, 0.9, 0xe8463c, 0, 2.1, 0),
		box(0.8, 1.9, 0.05, 0xe8463c, 0, 0, -0.42),
		box(0.05, 1.9, 0.8, 0xe8463c, -0.42, 0, 0),
		box(0.05, 1.9, 0.8, 0xe8463c, 0.42, 0, 0),
		box(0.78, 1.6, 0.03, 0x9fc6d8, 0, 0.3, 0.42),
		glow(box(0.5, 0.12, 0.04, 0xfff1c4, 0, 1.9, 0.38), GLOW.night),
	];
	return merge(parts);
}

function bikeRack(): BufferGeometry {
	const parts = [box(1.4, 0.05, 0.05, 0x777f86, 0, 0.5, 0)];
	for (const x of [-0.6, 0, 0.6])
		parts.push(box(0.05, 0.5, 0.05, 0x777f86, x, 0, 0));
	return merge(parts);
}

interface Taken {
	x: number;
	z: number;
	r: number;
}

/** Lamps, benches, hydrants, mailboxes, bins, phone booths and bike racks on the internal sidewalks. */
function streetFurniture(ctx: BuildContext): CrowdSpot[] {
	const { rng, statics } = ctx;
	const spots: CrowdSpot[] = [];
	const taken: Taken[] = [
		...KIOSKS.map(([x, z]) => ({ x, z, r: 1.1 })),
		{ x: -41.25, z: -47.25, r: 1.7 },
		{ x: PLAZA_CENTRE, z: PLAZA_CENTRE, r: 4.2 },
	];
	for (let i = 0; i < 3; i++) {
		const xr = BLOCKS[i] as Range;
		for (const edge of [
			...(i > 0 ? [xr[0] + 0.5] : []),
			...(i < 2 ? [xr[1] - 0.5] : []),
		]) {
			for (const [z0, z1] of BLOCKS) {
				for (let t = z0 + 3; t <= z1 - 3; t += 5.5) {
					taken.push({ x: edge, z: t, r: 0.9 }, { x: t, z: edge, r: 0.9 });
				}
			}
		}
	}
	const put = (
		make: () => BufferGeometry,
		x: number,
		z: number,
		ry: number,
		r: number,
	): boolean => {
		if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r)) return false;
		taken.push({ x, z, r });
		statics.push(place(make(), { x, y: SIDEWALK_Y, z, ry }));
		return true;
	};

	// Intersection corners: a lamp each, plus a hydrant or mailbox beside some.
	for (const cx of STREETS) {
		for (const cz of STREETS) {
			for (const sx of [-1, 1]) {
				for (const sz of [-1, 1]) {
					if (rng() < 0.3) {
						const ry = Math.atan2(sx, sz);
						put(
							() => kiosk(rng.pick(BRIGHTS)),
							cx + sx * 2.75,
							cz + sz * 2.75,
							ry,
							0.9,
						);
					}
					put(lamp, cx + sx * CURB, cz + sz * CURB, 0, 0.4);
					const roll = rng();
					if (roll < 0.3)
						put(hydrant, cx + sx * CURB, cz + sz * (CURB + 1.1), 0, 0.4);
					else if (roll < 0.55)
						put(mailbox, cx + sx * (CURB + 1.1), cz + sz * CURB, 0, 0.5);
				}
			}
		}
	}

	// Mid-block: a lamp on every sidewalk edge and a rotating choice of furniture.
	const kinds = ["bench", "bench", "bin", "booth", "rack", "none"] as const;
	for (const c of STREETS) {
		for (const northSouth of [true, false]) {
			for (const side of [-1, 1]) {
				for (const [a0, a1] of BLOCKS) {
					const mid = (a0 + a1) / 2;
					const at = (t: number, o: number): [number, number] =>
						northSouth ? [c + o, t] : [t, c + o];
					const [lx, lz] = at(mid, side * CURB);
					put(lamp, lx, lz, 0, 0.4);
					const t = a0 + 11.3;
					const o = side * 2.55;
					const [x, z] = at(t, o);
					// Face the street.
					const ry = northSouth
						? -side * (Math.PI / 2)
						: side > 0
							? Math.PI
							: 0;
					const kind = rng.pick(kinds);
					let placed = false;
					if (kind === "bench") placed = put(bench, x, z, ry, 0.9);
					else if (kind === "bin") placed = put(bin, x, z, 0, 0.4);
					else if (kind === "booth") placed = put(phoneBooth, x, z, ry, 0.7);
					else if (kind === "rack")
						placed = put(bikeRack, x, z, northSouth ? Math.PI / 2 : 0, 0.8);
					if (placed) {
						const [px, pz] = at(t - 1.3, side * 2.75);
						spots.push({ x: px, z: pz, y: SIDEWALK_Y });
					}
				}
			}
		}
	}
	return spots;
}

/** Flower planters at the corners of the plaza. */
function plazaPlanters(ctx: BuildContext): void {
	const y = SIDEWALK_Y + 0.04;
	for (const dx of [-1, 1]) {
		for (const dz of [-1, 1]) {
			const parts = [
				box(0.8, 0.4, 0.8, 0xb5544a, 0, 0, 0),
				box(0.7, 0.05, 0.7, 0x6b4a30, 0, 0.4, 0),
			];
			for (const [fx, fz] of [
				[-0.2, -0.15],
				[0.2, 0.1],
				[-0.05, 0.22],
			] as const) {
				parts.push(box(0.2, 0.3, 0.2, ctx.rng.pick(BRIGHTS), fx, 0.42, fz));
			}
			ctx.statics.push(
				place(merge(parts), {
					x: PLAZA_CENTRE + dx * 2.2,
					y,
					z: PLAZA_CENTRE + dz * 2.2,
				}),
			);
		}
	}
}

function plazaCrowd(ctx: BuildContext, extra: CrowdSpot[]): void {
	const p = PLAZA_CENTRE;
	const py = SIDEWALK_Y + 0.04;
	const spots: CrowdSpot[] = [];
	for (const dx of [-1, 1]) {
		for (const dz of [-1, 1]) {
			spots.push({ x: p + dx * 1.1, z: p + dz * 1.1, y: py });
		}
	}
	spots.push({ x: p - 1.0, z: p, y: py }, { x: p + 1.0, z: p, y: py });
	for (const [x, z] of KIOSKS) {
		spots.push({ x: x + 0.2, z: z + 0.9, y: SIDEWALK_Y });
	}
	for (const dx of [-1.8, -0.4, 1.2]) {
		spots.push({ x: -41.25 + dx, z: -47.25 + 0.4, y: SIDEWALK_Y });
	}
	createCrowd(ctx, [...spots, ...extra], { count: 46, spread: 0.45 });
}

export function buildDowntown(ctx: BuildContext): void {
	const { rng, statics } = ctx;
	const len = INNER_MAX - INNER_MIN;
	const centre = (INNER_MIN + INNER_MAX) / 2;

	for (const c of STREETS) {
		statics.push(box(STREET_W, ROAD_Y, len, ROAD, c, 0, centre));
		statics.push(box(len, ROAD_Y, STREET_W, ROAD, centre, 0, c));
	}

	for (let r = 0; r < 3; r++) {
		const zr = BLOCKS[r] as readonly [number, number];
		for (let c = 0; c < 3; c++) {
			const xr = BLOCKS[c] as readonly [number, number];
			const bx = (xr[0] + xr[1]) / 2;
			const bz = (zr[0] + zr[1]) / 2;
			statics.push(
				box(xr[1] - xr[0], SIDEWALK_Y, zr[1] - zr[0], SIDEWALK, bx, 0, bz),
			);

			fillBlock(ctx, r, c, xr, zr);
		}
	}

	// Plaza with four benches facing a small tree.
	const p = PLAZA_CENTRE;
	statics.push(box(PLAZA_SIZE, 0.04, PLAZA_SIZE, PAVEMENT, p, SIDEWALK_Y, p));
	const y = SIDEWALK_Y + 0.04;
	const benchAt = PLAZA_SIZE / 2 - 0.9;
	statics.push(
		place(bench(), { x: p, y, z: p - benchAt }),
		place(bench(), { x: p, y, z: p + benchAt, ry: Math.PI }),
		place(bench(), { x: p - benchAt, y, z: p, ry: Math.PI / 2 }),
		place(bench(), { x: p + benchAt, y, z: p, ry: -Math.PI / 2 }),
		place(roundTree(0.6), { x: p, y, z: p }),
	);

	// Street trees on the sides that face the avenues (x = −33 and z = −33);
	// the third row/column is the plaza block.
	for (let i = 0; i < 2; i++) {
		const range = BLOCKS[i] as readonly [number, number];
		for (const t of [range[0] + 3.2, range[1] - 3.2]) {
			const scale = rng.range(0.6, 0.75);
			statics.push(
				place(roundTree(scale), { x: TREE_LINE, y: SIDEWALK_Y, z: t }),
				place(roundTree(scale), { x: t, y: SIDEWALK_Y, z: TREE_LINE }),
			);
		}
	}

	// Pedestrian network: both sides of every internal street.
	for (const c of STREETS) {
		for (const side of [-1, 1]) {
			const off = c + side * (STREET_W / 2 + WALK / 2);
			ctx.sidewalks.push(
				new Polyline(
					[
						new Vector3(off, SIDEWALK_Y, RING_WALK),
						new Vector3(off, SIDEWALK_Y, AVENUE_WALK),
					],
					false,
				),
				new Polyline(
					[
						new Vector3(RING_WALK, SIDEWALK_Y, off),
						new Vector3(AVENUE_WALK, SIDEWALK_Y, off),
					],
					false,
				),
			);
		}
	}

	parkedCars(ctx);
	streetTrees(ctx);
	kiosksAndSubway(ctx);
	plazaPlanters(ctx);
	plazaCrowd(ctx, streetFurniture(ctx));
}
