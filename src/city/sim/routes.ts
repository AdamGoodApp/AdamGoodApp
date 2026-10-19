import { Vector3 } from "three";
import {
	AVENUE,
	CELL_Y,
	LANE_OFFSET,
	RING,
	ROAD_Y,
	TRAM_HALF,
} from "../world/layout";
import { chamfer, Polyline, rectLoop } from "./path";

const ROAD_CORNER = 3;
const TRAM_CORNER = 4;
/** Bus stops sit this far past the avenue junction (in the direction of travel) so buses never block it. */
const BUS_STOP_SHIFT = 10;

/** Height the tram rides at (the park slice bakes its rails at this level). */
export const TRAM_Y = CELL_Y + 0.1;

/**
 * Lane loop around the road rectangle whose centrelines are the given bounds.
 * Traffic keeps right: with +X east and +Z south, the right-hand side of travel
 * is `(-dir.z, 0, dir.x)`, which is the inside of a clockwise loop (seen from
 * +Y) and the outside of a counter-clockwise one.
 */
function laneLoop(
	minX: number,
	maxX: number,
	minZ: number,
	maxZ: number,
	clockwise: boolean,
): Polyline {
	const o = clockwise ? LANE_OFFSET : -LANE_OFFSET;
	const pts = rectLoop(
		minX + o,
		maxX - o,
		minZ + o,
		maxZ - o,
		ROAD_Y,
		clockwise,
	);
	return new Polyline(chamfer(pts, ROAD_CORNER), true);
}

export const RING_CW = laneLoop(-RING, RING, -RING, RING, true);
export const RING_CCW = laneLoop(-RING, RING, -RING, RING, false);
export const INNER_CW = laneLoop(-AVENUE, AVENUE, -AVENUE, AVENUE, true);
export const INNER_CCW = laneLoop(-AVENUE, AVENUE, -AVENUE, AVENUE, false);
export const LOOP_NW = laneLoop(-RING, -AVENUE, -RING, -AVENUE, true);
export const LOOP_NE = laneLoop(AVENUE, RING, -RING, -AVENUE, true);
export const LOOP_SW = laneLoop(-RING, -AVENUE, AVENUE, RING, true);
export const LOOP_SE = laneLoop(AVENUE, RING, AVENUE, RING, true);

/** Every loop cars may drive on. */
export const CAR_LOOPS: readonly Polyline[] = [
	RING_CW,
	RING_CCW,
	INNER_CW,
	INNER_CCW,
	LOOP_NW,
	LOOP_NE,
	LOOP_SW,
	LOOP_SE,
];

/** Hospital forecourt (NE cell) and the suburbs fire scene; the east side of the ring road passes both. */
export const HOSPITAL_SPOT = new Vector3(70, ROAD_Y, -40);
export const FIRE_SPOT = new Vector3(70, ROAD_Y, 70);

export const BUS_RING = RING_CW;
export const BUS_RING_REVERSE = RING_CCW;

export const TRAM = new Polyline(
	chamfer(
		rectLoop(-TRAM_HALF, TRAM_HALF, -TRAM_HALF, TRAM_HALF, TRAM_Y, false),
		TRAM_CORNER,
	),
	true,
);

/** Arc length and XZ distance of the point on `line` closest to `p`. */
export function nearestOnLine(
	line: Polyline,
	p: Vector3,
): { s: number; dist: number } {
	const pts = line.points;
	const n = line.closed ? pts.length : pts.length - 1;
	let acc = 0;
	let bestD2 = Number.POSITIVE_INFINITY;
	let bestS = 0;
	for (let i = 0; i < n; i++) {
		const a = pts[i] as Vector3;
		const b = pts[(i + 1) % pts.length] as Vector3;
		const dx = b.x - a.x;
		const dz = b.z - a.z;
		const len2 = dx * dx + dz * dz;
		const t =
			len2 > 0
				? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2))
				: 0;
		const ex = a.x + dx * t - p.x;
		const ez = a.z + dz * t - p.z;
		const d2 = ex * ex + ez * ez;
		const len = Math.sqrt(len2);
		if (d2 < bestD2) {
			bestD2 = d2;
			bestS = acc + len * t;
		}
		acc += len;
	}
	return { s: bestS, dist: Math.sqrt(bestD2) };
}

/** Ascending arc lengths (within one lap) of the stops nearest to `anchors`, moved `shift` m along the route. */
function stopsAlong(
	line: Polyline,
	anchors: readonly Vector3[],
	shift: number,
): number[] {
	return anchors
		.map((a) => (nearestOnLine(line, a).s + shift) % line.length)
		.sort((a, b) => a - b);
}

const BUS_ANCHORS = [
	new Vector3(-AVENUE, ROAD_Y, RING),
	new Vector3(RING, ROAD_Y, AVENUE),
	new Vector3(AVENUE, ROAD_Y, -RING),
	new Vector3(-RING, ROAD_Y, -AVENUE),
];

/** One stop per ring side, per direction of travel. */
export const BUS_STOPS_CW = stopsAlong(BUS_RING, BUS_ANCHORS, BUS_STOP_SHIFT);
export const BUS_STOPS_CCW = stopsAlong(
	BUS_RING_REVERSE,
	BUS_ANCHORS,
	BUS_STOP_SHIFT,
);

/** Edge midpoints of the tram rectangle. */
export const TRAM_STOPS = stopsAlong(
	TRAM,
	[
		new Vector3(0, TRAM_Y, -TRAM_HALF),
		new Vector3(TRAM_HALF, TRAM_Y, 0),
		new Vector3(0, TRAM_Y, TRAM_HALF),
		new Vector3(-TRAM_HALF, TRAM_Y, 0),
	],
	0,
);
