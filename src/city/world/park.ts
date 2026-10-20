import {
	type BufferGeometry,
	CylinderGeometry,
	SphereGeometry,
	Vector3,
} from "three";
import {
	box,
	cone,
	cyl,
	GLOW,
	glow,
	merge,
	paint,
	place,
	prism,
} from "../geometry";
import { BRIGHTS, FOAM, LEAF, PAVEMENT, SHIRTS, WATER_LIGHT } from "../palette";
import { bench, lamp, personLying, pine, roundTree } from "../prefabs";
import { mulberry32 } from "../rng";
import { type CrowdSpot, createCrowd } from "../sim/crowd";
import { chamfer, Polyline, rectLoop } from "../sim/path";
import type { BuildContext } from "./context";
import { CELL_Y, SIDEWALK_WIDTH, TRAM_HALF } from "./layout";
import {
	buildSign,
	HILL_HALF_LENGTH,
	HILL_HALF_WIDTH,
	HILL_HEIGHT,
	hillSurface,
} from "./sign";
import { tintWhite } from "./tint";

const LOOP_HALF = 19;
const LOOP_STRIP = 2.5;
const AVENUE_WALK = 26.25;
const STRIP_H = 0.06;
const RAIL_GAUGE = 1.4;

function yawOf(dx: number, dz: number): number {
	return Math.atan2(dx, dz);
}

function strip(
	a: Vector3,
	b: Vector3,
	width: number,
	height: number,
	hex: number,
	baseY: number,
	extra = 0,
): BufferGeometry {
	const dx = b.x - a.x;
	const dz = b.z - a.z;
	const len = Math.hypot(dx, dz);
	return box(
		width,
		height,
		len + extra,
		hex,
		(a.x + b.x) / 2,
		baseY,
		(a.z + b.z) / 2,
		yawOf(dx, dz),
	);
}

function buildTram(ctx: BuildContext): void {
	const pts = chamfer(
		rectLoop(-TRAM_HALF, TRAM_HALF, -TRAM_HALF, TRAM_HALF, 0),
		4,
	);
	const n = pts.length;
	for (let i = 0; i < n; i++) {
		const a = pts[i] as Vector3;
		const b = pts[(i + 1) % n] as Vector3;
		const dx = b.x - a.x;
		const dz = b.z - a.z;
		const len = Math.hypot(dx, dz);
		if (len < 0.01) continue;
		const ux = dx / len;
		const uz = dz / len;
		const nx = -uz;
		const nz = ux;
		const yaw = yawOf(dx, dz);
		for (const side of [-1, 1]) {
			ctx.statics.push(
				box(
					0.12,
					0.08,
					len + 0.05,
					0x777777,
					(a.x + b.x) / 2 + nx * side * (RAIL_GAUGE / 2),
					CELL_Y + 0.08,
					(a.z + b.z) / 2 + nz * side * (RAIL_GAUGE / 2),
					yaw,
				),
			);
		}
		for (let s = 0.75; s < len; s += 1.5) {
			ctx.statics.push(
				box(2, 0.08, 0.25, 0x8a5a3c, a.x + ux * s, CELL_Y, a.z + uz * s, yaw),
			);
		}
	}
	// Platforms at the four edge midpoints, on the inner side of the rails.
	const inward = RAIL_GAUGE / 2 + 0.75 + 0.3;
	const o = TRAM_HALF - inward;
	ctx.statics.push(
		box(4, 0.3, 1.5, PAVEMENT, 0, CELL_Y, -o),
		box(4, 0.3, 1.5, PAVEMENT, 0, CELL_Y, o),
		box(4, 0.3, 1.5, PAVEMENT, -o, CELL_Y, 0, Math.PI / 2),
		box(4, 0.3, 1.5, PAVEMENT, o, CELL_Y, 0, Math.PI / 2),
	);
}

interface Edge {
	mid: Vector3;
	dir: Vector3;
	inward: Vector3;
}

function buildLoop(ctx: BuildContext): Edge[] {
	const y = CELL_Y + STRIP_H;
	const pts = chamfer(
		rectLoop(-LOOP_HALF, LOOP_HALF, -LOOP_HALF, LOOP_HALF, y),
		6,
	);
	ctx.parkLoop = new Polyline(pts, true);
	const n = pts.length;
	for (let i = 0; i < n; i++) {
		ctx.statics.push(
			strip(
				pts[i] as Vector3,
				pts[(i + 1) % n] as Vector3,
				LOOP_STRIP,
				STRIP_H,
				PAVEMENT,
				CELL_Y,
				1,
			),
		);
	}

	const connectors: [number, number][] = [
		[0, -1],
		[0, 1],
		[-1, 0],
		[1, 0],
	];
	const edges: Edge[] = [];
	for (const [cx, cz] of connectors) {
		const from = new Vector3(cx * LOOP_HALF, y, cz * LOOP_HALF);
		const to = new Vector3(cx * AVENUE_WALK, y, cz * AVENUE_WALK);
		ctx.sidewalks.push(new Polyline([from, to], false));
		ctx.statics.push(
			strip(from, to, SIDEWALK_WIDTH + 0.5, STRIP_H, PAVEMENT, CELL_Y),
		);
		const dir = new Vector3(-cz, 0, cx);
		edges.push({
			mid: from,
			dir,
			inward: new Vector3(-cx, 0, -cz),
		});
	}
	return edges;
}

function buildFurniture(ctx: BuildContext, edges: Edge[]): void {
	for (const e of edges) {
		for (const side of [-1, 1]) {
			const b = new Vector3()
				.copy(e.mid)
				.addScaledVector(e.dir, side * 6.5)
				.addScaledVector(e.inward, 1.9);
			ctx.statics.push(
				place(bench(), {
					x: b.x,
					y: CELL_Y,
					z: b.z,
					ry: yawOf(-e.inward.x, -e.inward.z),
				}),
			);
			const l = new Vector3()
				.copy(e.mid)
				.addScaledVector(e.dir, side * 10)
				.addScaledVector(e.inward, -1.8);
			ctx.statics.push(place(lamp(), { x: l.x, y: CELL_Y, z: l.z }));
		}
	}
}

interface Spot {
	x: number;
	z: number;
	r: number;
}

const POND: Spot = { x: -12, z: -12, r: 6.8 };
const FOUNTAIN: Spot = { x: 6, z: 13, r: 5.2 };
const BANDSTAND: Spot = { x: 10.5, z: 5.5, r: 6.4 };
const TRUCK: Spot = { x: -4.5, z: -14.8, r: 4.4 };
const CART: Spot = { x: 0.5, z: 15.6, r: 3.4 };
const BLANKETS: Spot[] = [
	{ x: -7, z: -8.5, r: 2.4 },
	{ x: 14.5, z: 11, r: 2.4 },
];
/** Pockets of flat lawn that used to be bare; each gets a themed corner. */
const PLAYGROUND: Spot = { x: -14.7, z: -4.1, r: 3.6 };
const CAFE: Spot = { x: 13.2, z: 14.2, r: 3 };
const SKATE: Spot = { x: 0.8, z: -16.1, r: 2.2 };
const PICNIC: Spot = { x: -3.8, z: -11.4, r: 1.9 };
/** Market stalls line the east lawn, facing the loop path. */
const MARKET_X = 16;
const MARKET_Z = [-2.6, 0.2, 3, 5.8, 8.6] as const;
const MARKET: Spot[] = MARKET_Z.map((z) => ({ x: MARKET_X, z, r: 1.6 }));
const CORNERS: readonly Spot[] = [
	{ x: -19.4, z: -19.4, r: 2.2 },
	{ x: 19.4, z: -19.4, r: 2.2 },
	{ x: -19.4, z: 19.4, r: 2.2 },
	{ x: 19.4, z: 19.4, r: 2.2 },
];
const KEEP_OUT: readonly Spot[] = [
	POND,
	FOUNTAIN,
	BANDSTAND,
	TRUCK,
	CART,
	...BLANKETS,
	PLAYGROUND,
	CAFE,
	SKATE,
	PICNIC,
	...MARKET,
];

const LEAVES = [LEAF, 0x4fa04a, 0x6fc060, 0x8cc84b, 0x3f8f4f] as const;
const BLOSSOMS = [0xf2a6c0, 0xf5d04f, 0xe8843c] as const;
const SOIL = 0x6b4a30;
const STONE = 0xcfd4d8;

function onHill(x: number, z: number, margin: number): boolean {
	const u = (x - z) / Math.SQRT2;
	const v = (x + z) / Math.SQRT2;
	const a = HILL_HALF_LENGTH + margin;
	const b = HILL_HALF_WIDTH + margin;
	return (u / a) ** 2 + (v / b) ** 2 < 1;
}

function clearOfFeatures(x: number, z: number, reach: number): boolean {
	return KEEP_OUT.every((k) => Math.hypot(x - k.x, z - k.z) > k.r + reach);
}

function buildTrees(ctx: BuildContext): void {
	const { rng } = ctx;
	const placed: { x: number; z: number; s: number }[] = [];
	const add = (x: number, z: number, s: number, pineTree: boolean): void => {
		placed.push({ x, z, s });
		const geo = pineTree
			? pine(s)
			: roundTree(s, rng() < 0.12 ? rng.pick(BLOSSOMS) : rng.pick(LEAVES));
		ctx.statics.push(place(geo, { x, y: CELL_Y, z }));
	};

	// Interior of the loop, clustered by blue-noise rejection.
	let attempts = 0;
	while (placed.length < 60 && attempts++ < 4000) {
		const s = rng.range(0.7, 1.35);
		const x = rng.range(-17, 17);
		const z = rng.range(-17, 17);
		const edge = 16.6 - 0.5 * s;
		if (Math.max(Math.abs(x), Math.abs(z)) > edge) continue;
		if (Math.abs(x + z) > 27 - 1.8 * s || Math.abs(x - z) > 27 - 1.8 * s)
			continue;
		if (onHill(x, z, 1.2 * s + 0.6)) continue;
		if (!clearOfFeatures(x, z, 1.3 * s)) continue;
		if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 1.05 * (p.s + s)))
			continue;
		add(x, z, s, rng() < 0.4);
	}

	// Narrow verge between the loop path and the tram: a hedge of small trees.
	const lampT = [-10, 10];
	for (let side = 0; side < 4; side++) {
		const a = side * (Math.PI / 2);
		const c = Math.cos(a);
		const sn = Math.sin(a);
		for (let t = -16; t <= 16; t += 4.2) {
			if (Math.abs(t) < 3.4) continue;
			if (lampT.some((l) => Math.abs(t - l) < 1.6)) continue;
			const along = t + rng.range(-0.6, 0.6);
			const out = 21.5 + rng.range(-0.2, 0.3);
			// rotate (out, along) by a: sides at +x, +z, -x, -z
			const x = out * c - along * sn;
			const z = out * sn + along * c;
			add(x, z, rng.range(0.5, 0.65), false);
		}
	}
}

function flowerBed(
	ctx: BuildContext,
	x: number,
	z: number,
	w: number,
	d: number,
	ry: number,
): void {
	const parts: BufferGeometry[] = [box(w + 0.3, 0.14, d + 0.3, 0xcfc8bc, 0, 0)];
	parts.push(box(w, 0.2, d, SOIL, 0, 0));
	const cols = Math.max(1, Math.round(w / 0.55));
	const rows = Math.max(1, Math.round(d / 0.55));
	const palette = [ctx.rng.pick(BRIGHTS), ctx.rng.pick(BRIGHTS)];
	for (let i = 0; i < cols; i++) {
		for (let j = 0; j < rows; j++) {
			const px = (i + 0.5 - cols / 2) * (w / cols);
			const pz = (j + 0.5 - rows / 2) * (d / rows);
			const hex = (i + j) % 3 === 0 ? 0x4f9a4a : palette[(i + j) % 2];
			parts.push(
				box(
					0.32,
					0.22 + ctx.rng.range(0, 0.12),
					0.32,
					hex as number,
					px,
					0.2,
					pz,
				),
			);
		}
	}
	ctx.statics.push(place(merge(parts), { x, y: CELL_Y, z, ry }));
}

function blanket(ctx: BuildContext, s: Spot): void {
	const hex = ctx.rng.pick(BRIGHTS);
	const ry = ctx.rng.range(-0.3, 0.3);
	ctx.statics.push(
		box(1.9, 0.04, 2.5, hex, s.x, CELL_Y, s.z, ry),
		box(1.1, 0.03, 2.5, 0xffffff, s.x, CELL_Y + 0.04, s.z, ry),
	);
	for (const side of [-0.45, 0.45]) {
		const lx = s.x + Math.cos(ry) * side;
		const lz = s.z - Math.sin(ry) * side;
		ctx.statics.push(
			place(tintWhite(personLying(), ctx.rng.pick(SHIRTS)), {
				x: lx,
				y: CELL_Y + 0.05,
				z: lz + 0.1,
				ry,
			}),
		);
	}
	ctx.statics.push(
		box(0.45, 0.3, 0.35, 0xb8814a, s.x + 1.2, CELL_Y, s.z + 0.9, ry),
	);
}

function fountain(ctx: BuildContext): void {
	const { x, z } = FOUNTAIN;
	const y = CELL_Y;
	ctx.statics.push(
		cyl(2.3, 2.4, 0.5, 16, STONE, x, y, z),
		cyl(2.0, 2.0, 0.02, 16, WATER_LIGHT, x, y + 0.5, z),
		cyl(0.3, 0.45, 1.3, 8, STONE, x, y, z),
		cyl(1.1, 0.7, 0.3, 12, STONE, x, y + 1.2, z),
		cyl(0.9, 0.9, 0.02, 12, WATER_LIGHT, x, y + 1.5, z),
		cone(0.18, 0.9, 6, FOAM, x, y + 1.5, z),
	);
	for (const [dx, dz] of [
		[1, 1],
		[-1, 1],
		[1, -1],
		[-1, -1],
	] as const) {
		flowerBed(ctx, x + dx * 3.5, z + dz * 3.3, 1.7, 1.1, 0);
	}
	ctx.statics.push(
		place(bench(), { x: x + 3.4, y, z, ry: -Math.PI / 2 }),
		place(bench(), { x: x - 3.4, y, z, ry: Math.PI / 2 }),
	);
}

function bandstand(ctx: BuildContext): void {
	const { x, z } = BANDSTAND;
	const y = CELL_Y;
	const parts: BufferGeometry[] = [
		cyl(3.3, 3.4, 0.5, 8, PAVEMENT, 0, 0, 0),
		cyl(3.5, 3.5, 0.08, 8, 0x9c7b55, 0, 0.5, 0),
		cone(3.9, 1.8, 8, 0xb5544a, 0, 3.6, 0),
		cyl(0.1, 0.1, 0.8, 6, 0xf4f4f4, 0, 5.3, 0),
		cone(0.3, 0.35, 6, 0xf2c94c, 0, 5.8, 0),
	];
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
		const px = Math.sin(a) * 3.0;
		const pz = Math.cos(a) * 3.0;
		parts.push(cyl(0.12, 0.12, 3.0, 6, 0xf4f4f4, px, 0.55, pz));
		parts.push(box(0.5, 0.35, 0.5, 0xb5544a, px, 3.35, pz, a));
	}
	parts.push(box(1.6, 0.9, 0.7, 0x5a3a2a, 0, 0.58, -1.3));
	ctx.statics.push(place(merge(parts), { x, y, z }));
}

function foodVehicle(
	body: number,
	stripe: number,
	truck: boolean,
): BufferGeometry {
	const parts: BufferGeometry[] = [];
	const wheel = (px: number, pz: number): void => {
		parts.push(
			place(paint(new CylinderGeometry(0.35, 0.35, 0.3, 8), 0x222222), {
				rx: Math.PI / 2,
				x: px,
				y: 0.35,
				z: pz,
			}),
		);
	};
	const cx = truck ? -0.6 : 0;
	const len = truck ? 3.2 : 2.2;
	parts.push(
		box(len, truck ? 1.8 : 1.3, 2, body, cx, 0.4),
		box(len * 0.7, 0.8, 0.05, 0x2b3a4a, cx, truck ? 1.0 : 0.85, 1.02),
		box(len * 0.8, 0.08, 0.5, 0xf4f4f4, cx, truck ? 0.95 : 0.8, 1.25),
		glow(
			box(len * 0.6, 0.45, 0.1, 0xfff1a8, cx, truck ? 2.25 : 1.75, 0),
			GLOW.night,
		),
	);
	if (truck) {
		parts.push(
			box(1.2, 1.2, 1.9, body, 1.9, 0.4),
			box(0.1, 0.55, 1.5, 0x2b3a4a, 2.5, 1.0, 0),
		);
		wheel(-1.6, 1.0);
		wheel(-1.6, -1.0);
		wheel(1.9, 1.0);
		wheel(1.9, -1.0);
	} else {
		wheel(-0.6, 1.0);
		wheel(-0.6, -1.0);
	}
	const stripes = Math.round(len / 0.55);
	for (let i = 0; i < stripes; i++) {
		const sx = cx - len / 2 + (i + 0.5) * (len / stripes);
		parts.push(
			place(box(len / stripes, 0.06, 1.1, i % 2 ? stripe : 0xffffff), {
				x: sx,
				y: truck ? 2.0 : 1.7,
				z: 1.55,
				rx: 0.4,
			}),
		);
	}
	return merge(parts);
}

function buildLamps(ctx: BuildContext): void {
	for (let side = 0; side < 4; side++) {
		const a = side * (Math.PI / 2);
		const c = Math.cos(a);
		const sn = Math.sin(a);
		for (const t of [-12.5, 12.5]) {
			const out = 17.3;
			ctx.statics.push(
				place(lamp(), {
					x: out * c - t * sn,
					y: CELL_Y,
					z: out * sn + t * c,
				}),
			);
		}
	}
	for (const [x, z] of [
		[-5, -12.6],
		[3, -12.6],
		[3, 11],
		[14, 2],
	] as const) {
		ctx.statics.push(place(lamp(), { x, y: CELL_Y, z }));
	}
}

// --- Densification: hill dressing, playground, café, market, skate, picnic ---

const WOOD = 0x8a5a3c;

function uv(u: number, v: number): [number, number] {
	return [(u + v) / Math.SQRT2, (v - u) / Math.SQRT2];
}

/** Promenade centreline across the front slope of the sign hill (v = distance toward the camera). */
const HILL_PATH_U = Array.from({ length: 14 }, (_, i) => -19.5 + i * 3);
function pathV(u: number): number {
	return 3.8 + 1.3 * Math.sin(0.24 * u + 0.5);
}

/** Yaw a prefab, tilt it to the hill surface under (x, z) and drop it there. */
function onSlope(
	geo: BufferGeometry,
	x: number,
	z: number,
	ry = 0,
	lift = 0,
): BufferGeometry {
	const e = 0.6;
	const gx = (hillSurface(x + e, z) - hillSurface(x - e, z)) / (2 * e);
	const gz = (hillSurface(x, z + e) - hillSurface(x, z - e)) / (2 * e);
	place(geo, { ry });
	return place(geo, {
		rx: -Math.atan(gz),
		rz: Math.atan(gx),
		x,
		y: hillSurface(x, z) - 0.07 + lift,
		z,
	});
}

const HILL_BLANKETS: readonly (readonly [number, number])[] = [
	[-13, 6],
	[-2.5, 6],
	[9.5, 6.2],
	[15.5, 4.6],
];

function flowerPatch(hexA: number, hexB: number): BufferGeometry {
	return merge([
		box(0.55, 0.2, 0.55, 0x4f9a4a, 0, -0.12, 0),
		box(0.14, 0.3, 0.14, hexA, -0.13, -0.05, 0.06),
		box(0.14, 0.38, 0.14, hexB, 0.1, -0.05, -0.08),
		box(0.12, 0.26, 0.12, hexA, 0.05, -0.05, 0.14),
	]);
}

/** Winding promenade with flower borders, benches facing the sign and picnic blankets on the slope. */
function hillPromenade(ctx: BuildContext, spots: CrowdSpot[]): void {
	const { rng, statics } = ctx;
	const pts = HILL_PATH_U.map((u) => uv(u, pathV(u)));
	for (let i = 0; i < pts.length - 1; i++) {
		const [ax, az] = pts[i] as [number, number];
		const [bx, bz] = pts[i + 1] as [number, number];
		const ay = hillSurface(ax, az);
		const by = hillSurface(bx, bz);
		const horiz = Math.hypot(bx - ax, bz - az);
		const len = Math.hypot(horiz, by - ay);
		const seg = box(1.3, 0.45, len + 0.35, PAVEMENT, 0, -0.37, 0);
		place(seg, { rx: -Math.atan2(by - ay, horiz) });
		statics.push(
			place(seg, {
				ry: Math.atan2(bx - ax, bz - az),
				x: (ax + bx) / 2,
				y: (ay + by) / 2 + 0.01,
				z: (az + bz) / 2,
			}),
		);
		const nx = -(bz - az) / horiz;
		const nz = (bx - ax) / horiz;
		for (const t of [0.3, 0.75]) {
			for (const side of [-1, 1]) {
				const px = ax + (bx - ax) * t + nx * side * 1.05;
				const pz = az + (bz - az) * t + nz * side * 1.05;
				if (hillSurface(px, pz) < 0.5) continue;
				statics.push(
					onSlope(
						flowerPatch(rng.pick(BRIGHTS), rng.pick([0xffffff, 0xf5d04f])),
						px,
						pz,
						rng.range(0, Math.PI),
					),
				);
			}
		}
	}

	// Benches on the downhill side of the path, backs to the camera, facing the letters.
	for (const u of [-9, 3.5, 14]) {
		const [x, z] = uv(u, pathV(u) + 1.15);
		if (hillSurface(x, z) < 0.5) continue;
		statics.push(onSlope(bench(), x, z, (5 * Math.PI) / 4, 0.02));
		const [sx, sz] = uv(u + 0.5, pathV(u) + 1.0);
		spots.push({
			x: sx,
			z: sz,
			y: hillSurface(sx, sz) - 0.05,
			ry: Math.PI / 4 + Math.PI,
		});
	}

	// Picnic blankets (tilted to the slope), each with a couple lying on it.
	for (const [u, v] of HILL_BLANKETS) {
		const [x, z] = uv(u, v);
		const hex = rng.pick(BRIGHTS);
		const parts: BufferGeometry[] = [
			box(1.9, 0.2, 2.5, hex, 0, -0.14, 0),
			box(1.1, 0.2, 2.5, 0xffffff, 0, -0.12, 0),
			box(0.45, 0.3, 0.35, 0xb8814a, 1.2, -0.1, 0.9),
		];
		for (const side of [-0.45, 0.45]) {
			parts.push(
				place(tintWhite(personLying(), rng.pick(SHIRTS)), {
					x: side,
					y: 0.1,
					z: 0.1,
				}),
			);
		}
		statics.push(
			onSlope(merge(parts), x, z, -Math.PI / 4 + rng.range(-0.25, 0.25)),
		);
		const [px, pz] = uv(u + 1.8, v - 0.2);
		spots.push({ x: px, z: pz, y: hillSurface(px, pz) - 0.08, ry: Math.PI });
	}
}

/** Low trees along the foot of the front slope (small, so the letters stay clear). */
function hillTrees(ctx: BuildContext): void {
	const { rng, statics } = ctx;
	const placed: { x: number; z: number; s: number }[] = [];
	const blanketXZ = HILL_BLANKETS.map(([u, v]) => uv(u, v));
	for (let a = 0; a < 1200 && placed.length < 24; a++) {
		const u = rng.range(-21, 21);
		const v = rng.range(5.6, 9.8);
		const [x, z] = uv(u, v);
		const h = hillSurface(x, z);
		if (h < 0.7) continue;
		if (Math.abs(v - pathV(u)) < 2.6) continue;
		if (blanketXZ.some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 2.8))
			continue;
		if (Math.hypot(x - BANDSTAND.x, z - BANDSTAND.z) < 5.4) continue;
		if (Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < 6) continue;
		const s = rng.range(0.45, 0.7);
		if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 1.5 * (p.s + s)))
			continue;
		placed.push({ x, z, s });
		const geo = rng() < 0.45 ? pine(s) : roundTree(s, rng.pick(LEAVES));
		statics.push(place(geo, { x, y: h - 0.25, z }));
	}
}

function playground(ctx: BuildContext, spots: CrowdSpot[]): void {
	const { x: cx, z: cz } = PLAYGROUND;
	const blue = 0x3b7dd8;
	const red = 0xe8463c;
	const yellow = 0xf2c94c;
	const parts: BufferGeometry[] = [
		box(4.6, 0.06, 5.4, 0xd9c9a0, 0, 0, 0),
		box(4.8, 0.2, 0.15, WOOD, 0, 0, -2.7),
		box(4.8, 0.2, 0.15, WOOD, 0, 0, 2.7),
		box(0.15, 0.2, 5.4, WOOD, -2.4, 0, 0),
		box(0.15, 0.2, 5.4, WOOD, 2.4, 0, 0),
		box(0.35, 0.8, 5.6, 0x4a9a4a, -2.7, 0, 0),
	];
	// Swing set: bar along z with two A-frames and two swings.
	const sx = -1.6;
	const sz0 = -1.35;
	parts.push(box(0.14, 0.14, 2.3, blue, sx, 2.28, sz0));
	for (const ez of [sz0 - 1.05, sz0 + 1.05]) {
		for (const side of [-1, 1]) {
			parts.push(
				place(box(0.1, 2.45, 0.1, blue), {
					rz: side * 0.2,
					x: sx + side * 0.5,
					y: 0,
					z: ez,
				}),
			);
		}
	}
	for (const dz of [-0.4, 0.4]) {
		parts.push(
			box(0.03, 1.6, 0.03, 0x888888, sx, 0.72, sz0 + dz - 0.2),
			box(0.03, 1.6, 0.03, 0x888888, sx, 0.72, sz0 + dz + 0.2),
			box(0.2, 0.05, 0.45, red, sx, 0.7, sz0 + dz),
		);
	}
	// Slide: tower, ladder and ramp.
	const tx = 1.35;
	const tz = -1.9;
	for (const px of [-0.45, 0.45]) {
		for (const pz of [-0.45, 0.45]) {
			parts.push(box(0.1, 1.4, 0.1, red, tx + px, 0, tz + pz));
		}
	}
	parts.push(
		box(1.1, 0.1, 1.1, yellow, tx, 1.3, tz),
		place(box(0.6, 1.5, 0.06, 0x888888), {
			rx: 0.3,
			x: tx,
			y: 0,
			z: tz - 0.65,
		}),
		place(box(0.6, 0.08, 2.25, yellow, 0, -0.04, 0), {
			rx: 0.644,
			x: tx,
			y: 0.725,
			z: tz + 1.45,
		}),
	);
	// Sandbox, seesaw and a spring rider.
	for (const dz of [-0.75, 0.75]) {
		parts.push(box(1.6, 0.2, 0.1, WOOD, -1.2, 0, 1.6 + dz));
		parts.push(box(0.1, 0.2, 1.6, WOOD, -1.2 + dz, 0, 1.6));
	}
	parts.push(
		box(1.4, 0.14, 1.4, 0xf3e7b5, -1.2, 0, 1.6),
		box(0.2, 0.15, 0.2, red, -1.0, 0.14, 1.5),
		box(0.3, 0.34, 0.3, 0x777777, 1.3, 0, 1.7),
		place(box(0.28, 0.07, 2.1, red, 0, -0.035, 0), {
			rx: 0.18,
			x: 1.3,
			y: 0.42,
			z: 1.7,
		}),
		cyl(0.04, 0.04, 0.35, 6, 0x888888, 0.25, 0, 0.9),
		box(0.25, 0.22, 0.5, yellow, 0.25, 0.35, 0.9),
		box(0.2, 0.25, 0.15, yellow, 0.25, 0.5, 1.2),
	);
	ctx.statics.push(place(merge(parts), { x: cx, y: CELL_Y, z: cz }));
	for (const dz of [-1.2, 1.3]) {
		ctx.statics.push(
			place(bench(), { x: cx + 2.9, y: CELL_Y, z: cz + dz, ry: -Math.PI / 2 }),
		);
	}
	const py = CELL_Y + 0.07;
	for (const [dx, dz] of [
		[-1.0, -1.3],
		[-2.0, -0.9],
		[1.35, -2.9],
		[1.4, 0.75],
		[-1.2, 2.45],
		[1.3, 1.0],
		[0.2, 1.6],
	] as const) {
		spots.push({ x: cx + dx, z: cz + dz, y: py });
	}
	spots.push(
		{ x: cx + 2.45, z: cz - 0.1, y: py, ry: -Math.PI / 2 },
		{ x: cx + 2.45, z: cz + 2.2, y: py, ry: -Math.PI / 2 },
	);
}

function cafe(ctx: BuildContext, spots: CrowdSpot[]): void {
	const bx = 13.6;
	const bz = 13.3;
	const parts: BufferGeometry[] = [
		box(2.6, 2.5, 2.2, 0xf4ead8, 0, 0, 0),
		box(2.9, 0.15, 2.5, 0x5a3a22, 0, 2.5, 0),
		prism(3.0, 1.0, 2.6, 0xb5544a, 0, 2.65, 0),
		box(0.4, 0.9, 0.4, 0x7d6f66, -0.8, 2.7, -0.5),
		box(1.5, 1.0, 0.06, 0x2b3a4a, -0.3, 0.9, 1.12),
		box(0.7, 2.0, 0.06, 0x3a2f2a, 0.85, 0, 1.12),
		glow(box(1.2, 0.3, 0.08, 0xffd27a, -0.3, 2.05, 1.15), GLOW.night),
	];
	for (let i = 0; i < 6; i++) {
		parts.push(
			place(box(0.45, 0.06, 0.95, i % 2 ? 0xe8463c : 0xffffff, 0, -0.03, 0), {
				rx: 0.4,
				x: -1.1 + i * 0.44,
				y: 2.2,
				z: 1.55,
			}),
		);
	}
	ctx.statics.push(place(merge(parts), { x: bx, y: CELL_Y, z: bz }));

	// Terrace with two umbrella tables.
	const tx = 12.6;
	const tz = 15.3;
	ctx.statics.push(box(2.8, 0.05, 1.8, PAVEMENT, tx, CELL_Y, tz));
	const colours = [0xe8463c, 0x3b7dd8];
	for (const [i, dx] of [-0.65, 0.65].entries()) {
		const x = tx + dx;
		ctx.statics.push(
			cyl(0.4, 0.4, 0.05, 8, 0xf4f4f4, x, CELL_Y + 0.72, tz),
			cyl(0.05, 0.05, 0.72, 6, 0x555555, x, CELL_Y, tz),
			cyl(0.03, 0.03, 2.0, 6, 0xeeeeee, x, CELL_Y, tz),
			cone(0.9, 0.45, 8, colours[i] as number, x, CELL_Y + 2.0, tz),
			box(0.3, 0.05, 0.3, WOOD, x - 0.6, CELL_Y + 0.45, tz),
			box(0.3, 0.05, 0.3, WOOD, x + 0.6, CELL_Y + 0.45, tz),
		);
	}
	ctx.statics.push(
		cyl(0.2, 0.17, 0.35, 6, 0xb5544a, tx - 1.25, CELL_Y, tz + 0.65),
		cone(0.28, 0.5, 6, 0x4f9a4a, tx - 1.25, CELL_Y + 0.35, tz + 0.65),
	);
	const py = CELL_Y + 0.05;
	for (const [x, z, ry] of [
		[tx - 0.65, tz - 0.55, 0],
		[tx + 0.1, tz + 0.5, Math.PI],
		[tx + 0.65, tz - 0.55, 0],
		[bx + 0.85, bz + 1.6, Math.PI],
	] as const) {
		spots.push({ x, z, y: py, ry });
	}
}

function stall(awning: number, goods: readonly number[]): BufferGeometry {
	const parts: BufferGeometry[] = [
		box(1.9, 0.8, 0.7, 0xb8814a, 0, 0, 0.25),
		box(1.95, 0.06, 0.75, awning, 0, 0.8, 0.25),
		box(1.9, 1.5, 0.05, 0xf2eee0, 0, 0.6, -0.6),
	];
	for (const px of [-0.95, 0.95]) {
		parts.push(box(0.07, 2.0, 0.07, 0xf4f4f4, px, 0, 0.6));
		parts.push(box(0.07, 2.25, 0.07, 0xf4f4f4, px, 0, -0.6));
	}
	for (let i = 0; i < 8; i++) {
		parts.push(
			place(box(0.25, 0.06, 1.7, i % 2 ? awning : 0xffffff, 0, -0.03, 0), {
				rx: 0.2,
				x: -0.875 + i * 0.25,
				y: 2.1,
				z: 0,
			}),
		);
	}
	goods.forEach((hex, i) => {
		parts.push(box(0.3, 0.18, 0.3, hex, -0.7 + i * 0.35, 0.86, 0.25));
	});
	return merge(parts);
}

function marketRow(ctx: BuildContext, spots: CrowdSpot[]): void {
	const goods = [
		[0xe8463c, 0xf28c28, 0xe8463c, 0x58c27a, 0xf2c94c],
		[0x58c27a, 0x58c27a, 0xf2c94c, 0xe8463c, 0x9b6bf2],
		[0xf2c94c, 0xf28c28, 0xf2c94c, 0xf28c28, 0xffffff],
		[0x9b6bf2, 0x3b7dd8, 0xe8463c, 0x3b7dd8, 0x58c27a],
		[0xe8463c, 0xffffff, 0xe8463c, 0xffffff, 0xf2c94c],
	];
	MARKET_Z.forEach((z, i) => {
		const awning = ctx.rng.pick(BRIGHTS);
		ctx.statics.push(
			place(stall(awning, goods[i % goods.length] as number[]), {
				ry: Math.PI / 2,
				x: MARKET_X,
				y: CELL_Y,
				z,
			}),
		);
		spots.push(
			{ x: MARKET_X - 0.35, z, y: CELL_Y + 0.05, ry: Math.PI / 2 },
			{ x: MARKET_X + 1.15, z: z + 0.35, y: CELL_Y + 0.05, ry: -Math.PI / 2 },
		);
	});
}

function skateCorner(ctx: BuildContext, spots: CrowdSpot[]): void {
	const { x, z } = SKATE;
	const parts: BufferGeometry[] = [
		box(3.6, 0.05, 1.9, 0x8f949a, 0, 0, 0),
		box(1.0, 0.3, 0.8, 0xf2c94c, 0.2, 0.05, 0),
		place(box(0.8, 0.06, 0.7, 0xf2c94c, 0, -0.03, 0), {
			rz: -0.38,
			x: -0.55,
			y: 0.2,
			z: 0,
		}),
		place(box(0.8, 0.06, 0.7, 0xf2c94c, 0, -0.03, 0), {
			rz: 0.38,
			x: 0.95,
			y: 0.2,
			z: 0,
		}),
		box(0.05, 0.05, 1.2, 0x999999, -1.2, 0.35, 0.1),
		box(0.05, 0.35, 0.05, 0x555555, -1.2, 0.05, -0.45),
		box(0.05, 0.35, 0.05, 0x555555, -1.2, 0.05, 0.65),
		place(box(0.9, 0.07, 0.7, 0xe8463c, 0, -0.035, 0), {
			rz: 0.5,
			x: 1.5,
			y: 0.28,
			z: -0.55,
		}),
	];
	ctx.statics.push(place(merge(parts), { x, y: CELL_Y, z }));
	const py = CELL_Y + 0.06;
	spots.push(
		{ x: x - 0.6, z: z + 0.5, y: py },
		{ x: x + 1.2, z: z + 0.5, y: py, ry: Math.PI / 2 },
	);
}

function picnicTable(ctx: BuildContext, spots: CrowdSpot[]): void {
	const { x, z } = PICNIC;
	const parts: BufferGeometry[] = [
		box(1.6, 0.07, 0.85, WOOD, 0, 0.72, 0),
		cyl(0.035, 0.035, 2.2, 6, 0xeeeeee, 0, 0, 0),
		cone(1.25, 0.5, 8, ctx.rng.pick(BRIGHTS), 0, 2.2, 0),
	];
	for (const sd of [-1, 1]) {
		parts.push(box(1.6, 0.06, 0.3, WOOD, 0, 0.44, sd * 0.7));
		for (const px of [-0.65, 0.65]) {
			parts.push(box(0.07, 0.72, 0.07, 0x5a3a22, px, 0, sd * 0.35));
			parts.push(box(0.06, 0.44, 0.06, 0x5a3a22, px, 0, sd * 0.7));
		}
	}
	ctx.statics.push(place(merge(parts), { x, y: CELL_Y, z }));
	spots.push(
		{ x: x - 0.5, z: z + 1.25, y: CELL_Y + 0.05, ry: Math.PI },
		{ x: x + 0.5, z: z - 1.25, y: CELL_Y + 0.05, ry: 0 },
	);
}

/** Round planters with a tree and flowers fill the four corners between loop path and tram. */
function cornerPlanters(ctx: BuildContext): void {
	for (const c of CORNERS) {
		const parts: BufferGeometry[] = [
			cyl(1.5, 1.6, 0.35, 10, STONE, 0, 0, 0),
			cyl(1.3, 1.3, 0.05, 10, SOIL, 0, 0.35, 0),
			place(roundTree(0.8, ctx.rng.pick(LEAVES)), { y: 0.35 }),
		];
		for (let i = 0; i < 7; i++) {
			const a = (i / 7) * Math.PI * 2;
			parts.push(
				box(
					0.3,
					0.25,
					0.3,
					ctx.rng.pick(BRIGHTS),
					Math.cos(a) * 1.0,
					0.35,
					Math.sin(a) * 1.0,
				),
			);
		}
		ctx.statics.push(place(merge(parts), { x: c.x, y: CELL_Y, z: c.z }));
	}
}

/** Flower borders on the verge between the loop path and the tram rails. */
function vergeFlowers(ctx: BuildContext): void {
	for (let side = 0; side < 4; side++) {
		const a = side * (Math.PI / 2);
		const c = Math.cos(a);
		const sn = Math.sin(a);
		for (let t = -15; t <= 15; t += 3.1) {
			if (Math.abs(t) < 3.6) continue;
			const out = 22.35;
			const parts: BufferGeometry[] = [box(2.0, 0.1, 0.5, SOIL, 0, 0, 0)];
			const pa = ctx.rng.pick(BRIGHTS);
			const pb = ctx.rng.pick([0xffffff, 0xf5d04f, 0xf2a6c0]);
			for (let k = 0; k < 4; k++) {
				parts.push(
					box(
						0.22,
						0.18 + ctx.rng.range(0, 0.1),
						0.22,
						k % 2 ? pa : pb,
						0.0,
						0.1,
						-0.75 + k * 0.5,
					),
				);
			}
			ctx.statics.push(
				place(merge(parts), {
					ry: -a,
					x: out * c - t * sn,
					y: CELL_Y,
					z: out * sn + t * c,
				}),
			);
		}
	}
}

function buildExtras(ctx: BuildContext): void {
	const spots: CrowdSpot[] = [];
	hillPromenade(ctx, spots);
	hillTrees(ctx);
	playground(ctx, spots);
	cafe(ctx, spots);
	marketRow(ctx, spots);
	skateCorner(ctx, spots);
	picnicTable(ctx, spots);
	cornerPlanters(ctx);
	vergeFlowers(ctx);
	createCrowd(ctx, spots, { count: 40, spread: 0.3 });
}

function buildCrowds(ctx: BuildContext): void {
	const stage: CrowdSpot[] = [];
	for (let i = 0; i < 4; i++) {
		const a = (i / 4) * Math.PI * 2 + 0.4;
		stage.push({
			x: BANDSTAND.x + Math.sin(a) * 1.2,
			z: BANDSTAND.z + Math.cos(a) * 1.2,
			y: CELL_Y + 0.58,
			ry: Math.PI / 2 + 0.2,
		});
	}
	const audience: CrowdSpot[] = [];
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2;
		const x = BANDSTAND.x + Math.sin(a) * 4.5;
		const z = BANDSTAND.z + Math.cos(a) * 4.5;
		audience.push({
			x,
			z,
			ry: Math.atan2(BANDSTAND.x - x, BANDSTAND.z - z),
		});
	}
	createCrowd(ctx, [...stage, ...audience], {
		count: 28,
		spread: 0.45,
		cheer: true,
	});

	const idle: CrowdSpot[] = [
		{ x: TRUCK.x - 1.5, z: TRUCK.z + 2.1, ry: Math.PI },
		{ x: TRUCK.x, z: TRUCK.z + 2.2, ry: Math.PI },
		{ x: TRUCK.x + 1.3, z: TRUCK.z + 2.4, ry: Math.PI },
		{ x: CART.x, z: CART.z - 1.7, ry: 0 },
		{ x: CART.x + 0.8, z: CART.z - 1.9, ry: 0 },
		{ x: FOUNTAIN.x, z: FOUNTAIN.z - 3.2, ry: 0 },
		{ x: FOUNTAIN.x - 0.9, z: FOUNTAIN.z + 3.2, ry: Math.PI },
		{ x: FOUNTAIN.x + 0.9, z: FOUNTAIN.z - 3.0, ry: 0 },
	];
	const py = CELL_Y + 0.3;
	const o = TRAM_HALF - 1.75;
	for (const t of [-1, 1]) {
		idle.push(
			{ x: t, z: -o, y: py, ry: 0 },
			{ x: t, z: o, y: py, ry: Math.PI },
			{ x: -o, z: t, y: py, ry: Math.PI / 2 },
			{ x: o, z: t, y: py, ry: -Math.PI / 2 },
		);
	}
	createCrowd(ctx, idle, { count: 32, spread: 0.5 });
}

export function buildPark(ctx: BuildContext): void {
	ctx.statics.push(
		place(paint(new SphereGeometry(1, 24, 12), 0x7fbd63), {
			sx: HILL_HALF_LENGTH,
			sy: HILL_HEIGHT,
			sz: HILL_HALF_WIDTH,
			ry: Math.PI / 4,
		}),
	);
	buildSign(ctx);
	buildTram(ctx);
	const edges = buildLoop(ctx);
	buildFurniture(ctx, edges);
	ctx.statics.push(cyl(5, 5, 0.1, 20, WATER_LIGHT, POND.x, CELL_Y, POND.z));
	fountain(ctx);
	bandstand(ctx);
	buildLamps(ctx);
	for (const b of BLANKETS) blanket(ctx, b);

	ctx.statics.push(
		place(foodVehicle(ctx.rng.pick(BRIGHTS), 0xe8463c, true), {
			x: TRUCK.x,
			y: CELL_Y,
			z: TRUCK.z,
		}),
		place(foodVehicle(0xf2c94c, 0x3b7dd8, false), {
			x: CART.x,
			y: CELL_Y,
			z: CART.z,
			ry: Math.PI,
		}),
	);

	flowerBed(ctx, -16, -9.5, 2.2, 1.2, Math.PI / 4);
	flowerBed(ctx, -9, -16.4, 2.2, 1.0, 0);
	flowerBed(ctx, 16.2, 14.2, 1.4, 2.2, 0);
	buildExtras(ctx);
	buildTrees(ctx);
	buildCrowds(ctx);
	buildFestival(ctx);
}

/** Simulation seconds a staged festival lasts. */
const FESTIVAL_SECONDS = 60;
const FESTIVAL_SEED = 0xf357;

/**
 * A festival crowd dancing around the bandstand, hidden until an agent stages
 * `park_festival`. Its own generator keeps the rest of the city unchanged.
 */
function buildFestival(ctx: BuildContext): void {
	const spots: CrowdSpot[] = [];
	for (const [r, n] of [
		[5.9, 14],
		[7.1, 18],
	] as const) {
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2 + r;
			const x = BANDSTAND.x + Math.sin(a) * r;
			const z = BANDSTAND.z + Math.cos(a) * r;
			spots.push({ x, z, ry: Math.atan2(BANDSTAND.x - x, BANDSTAND.z - z) });
		}
	}
	const crowd = createCrowd(ctx, spots, {
		count: spots.length,
		spread: 0.35,
		cheer: true,
		hidden: true,
		rng: mulberry32(FESTIVAL_SEED),
	});
	if (!crowd) return;
	const { events } = ctx;
	events.landmark({
		id: "park_bandstand",
		name: "Bandstand in the central park",
		x: BANDSTAND.x,
		z: BANDSTAND.z,
		radius: 8,
	});
	let endsAt = 0;
	events.onStage("park_festival", (t) => {
		if (crowd.visible)
			return { ok: false, text: "A festival is already on in the park" };
		crowd.setVisible(true);
		endsAt = t + FESTIVAL_SECONDS;
		const text =
			"A pop-up festival fills the park: a crowd dances around the bandstand";
		events.emit("festival_started", text, BANDSTAND.x, BANDSTAND.z);
		return { ok: true, text };
	});
	ctx.agents.push({
		update(_dt, t) {
			if (!crowd.visible || t < endsAt) return;
			crowd.setVisible(false);
			events.emit(
				"festival_ended",
				"The park festival winds down and the crowd heads home",
				BANDSTAND.x,
				BANDSTAND.z,
				t,
			);
		},
	});
}
