import { type BufferGeometry, SphereGeometry, Vector3 } from "three";
import { box, cyl, paint, place } from "../geometry";
import { PAVEMENT, WATER_LIGHT } from "../palette";
import { bench, lamp, roundTree } from "../prefabs";
import { chamfer, Polyline, rectLoop } from "../sim/path";
import type { BuildContext } from "./context";
import { CELL_Y, SIDEWALK_WIDTH, TRAM_HALF } from "./layout";
import {
	buildSign,
	HILL_HALF_LENGTH,
	HILL_HALF_WIDTH,
	HILL_HEIGHT,
} from "./sign";

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

function buildTrees(ctx: BuildContext): void {
	const placed: [number, number][] = [[-12, -12]];
	let attempts = 0;
	while (placed.length < 15 && attempts++ < 600) {
		const x = ctx.rng.range(-15, 15);
		const z = ctx.rng.range(-15, 15);
		if (Math.abs(x + z) / Math.SQRT2 <= 11) continue;
		if (Math.abs(x) < 3 || Math.abs(z) < 3) continue;
		if (
			placed.some(
				([px, pz]) =>
					Math.hypot(px - x, pz - z) < (px === -12 && pz === -12 ? 8 : 4.5),
			)
		)
			continue;
		placed.push([x, z]);
		ctx.statics.push(
			place(roundTree(ctx.rng.range(0.9, 1.3)), { x, y: CELL_Y, z }),
		);
	}
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
	ctx.statics.push(cyl(5, 5, 0.1, 20, WATER_LIGHT, -12, CELL_Y, -12));
	buildTrees(ctx);
}
