import {
	type BufferGeometry,
	CylinderGeometry,
	SphereGeometry,
	Vector3,
} from "three";
import { box, cone, cyl, GLOW, glow, merge, paint, place } from "../geometry";
import { BRIGHTS, FOAM, LEAF, PAVEMENT, SHIRTS, WATER_LIGHT } from "../palette";
import { bench, lamp, personLying, pine, roundTree } from "../prefabs";
import { type CrowdSpot, createCrowd } from "../sim/crowd";
import { chamfer, Polyline, rectLoop } from "../sim/path";
import type { BuildContext } from "./context";
import { CELL_Y, SIDEWALK_WIDTH, TRAM_HALF } from "./layout";
import {
	buildSign,
	HILL_HALF_LENGTH,
	HILL_HALF_WIDTH,
	HILL_HEIGHT,
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
	{ x: -15, z: -4.5, r: 2.4 },
	{ x: 14.5, z: 11, r: 2.4 },
	{ x: 11, z: 15, r: 2.4 },
];
const KEEP_OUT: readonly Spot[] = [
	POND,
	FOUNTAIN,
	BANDSTAND,
	TRUCK,
	CART,
	...BLANKETS,
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
	while (placed.length < 46 && attempts++ < 2500) {
		const s = rng.range(0.7, 1.35);
		const x = rng.range(-17, 17);
		const z = rng.range(-17, 17);
		const edge = 16.6 - 0.5 * s;
		if (Math.max(Math.abs(x), Math.abs(z)) > edge) continue;
		if (Math.abs(x + z) > 27 - 1.8 * s || Math.abs(x - z) > 27 - 1.8 * s)
			continue;
		if (onHill(x, z, 1.2 * s + 0.6)) continue;
		if (!clearOfFeatures(x, z, 1.3 * s)) continue;
		if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 1.25 * (p.s + s)))
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
	buildTrees(ctx);
	buildCrowds(ctx);
}
