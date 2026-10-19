import { Vector3 } from "three";
import { box, cyl, GLOW, glow } from "../geometry";
import { LANE, ROAD, SIDEWALK } from "../palette";
import { Polyline } from "../sim/path";
import type { BuildContext } from "./context";
import {
	AVENUE,
	AVENUE_WIDTH,
	LAND_HALF,
	RING,
	RING_WIDTH,
	ROAD_Y,
	SIDEWALK_WIDTH,
	SIDEWALK_Y,
} from "./layout";

const SPAN = LAND_HALF * 2;

function lamp(x: number, z: number): ReturnType<typeof cyl>[] {
	return [
		cyl(0.08, 0.1, 4, 6, 0x5a5d62, x, SIDEWALK_Y, z),
		glow(box(0.5, 0.3, 0.5, 0xfff1c4, x, SIDEWALK_Y + 4, z), GLOW.night),
	];
}

export function buildRoads(ctx: BuildContext): void {
	const s = ctx.statics;
	const sw = SIDEWALK_WIDTH;

	for (const c of [-AVENUE, AVENUE]) {
		// Avenues (N–S along x = c, E–W along z = c), inside the ring road.
		const len = (RING - RING_WIDTH / 2) * 2;
		s.push(box(AVENUE_WIDTH, ROAD_Y, len, ROAD, c, 0, 0));
		s.push(box(len, ROAD_Y, AVENUE_WIDTH, ROAD, 0, 0, c));
		for (const side of [-1, 1]) {
			const off = c + side * (AVENUE_WIDTH / 2 + sw / 2);
			s.push(box(sw, SIDEWALK_Y, len, SIDEWALK, off, 0, 0));
			s.push(box(len, SIDEWALK_Y, sw, SIDEWALK, 0, 0, off));
		}
		// Lane dashes every 4 m along the centrelines (skip intersections).
		for (let t = -RING + 4; t < RING - 4; t += 4) {
			if (Math.abs(Math.abs(t) - AVENUE) < AVENUE_WIDTH) continue;
			s.push(box(0.25, 0.02, 1.6, LANE, c, ROAD_Y, t));
			s.push(box(1.6, 0.02, 0.25, LANE, t, ROAD_Y, c));
		}
		// Lamp posts every 12 m on both sidewalks.
		for (let t = -RING + 8; t < RING - 6; t += 12) {
			if (Math.abs(Math.abs(t) - AVENUE) < AVENUE_WIDTH) continue;
			for (const side of [-1, 1]) {
				const off = c + side * (AVENUE_WIDTH / 2 + sw * 0.75);
				s.push(...lamp(off, t), ...lamp(t, off));
			}
		}
	}

	// Ring road on all four sides.
	for (const c of [-RING, RING]) {
		s.push(box(RING_WIDTH, ROAD_Y, SPAN, ROAD, c, 0, 0));
		s.push(box(SPAN, ROAD_Y, RING_WIDTH, ROAD, 0, 0, c));
		const inner = c - Math.sign(c) * (RING_WIDTH / 2 + sw / 2);
		s.push(box(sw, SIDEWALK_Y, SPAN - 6, SIDEWALK, inner, 0, 0));
		s.push(box(SPAN - 6, SIDEWALK_Y, sw, SIDEWALK, 0, 0, inner));
	}

	// Crosswalks at the four inner intersections.
	for (const ix of [-AVENUE, AVENUE]) {
		for (const iz of [-AVENUE, AVENUE]) {
			for (let k = 0; k < 4; k++) {
				const o = -2.25 + k * 1.5;
				for (const side of [-1, 1]) {
					const edge = side * (AVENUE_WIDTH / 2 + 1.2);
					s.push(box(0.6, 0.02, 2.4, 0xf4f4f0, ix + o, ROAD_Y, iz + edge));
					s.push(box(2.4, 0.02, 0.6, 0xf4f4f0, ix + edge, ROAD_Y, iz + o));
				}
			}
		}
	}

	// Pedestrian network: one open polyline per avenue sidewalk segment between ring sidewalks.
	const y = SIDEWALK_Y;
	const end = RING - RING_WIDTH / 2 - sw / 2;
	for (const c of [-AVENUE, AVENUE]) {
		for (const side of [-1, 1]) {
			const off = c + side * (AVENUE_WIDTH / 2 + sw / 2);
			ctx.sidewalks.push(
				new Polyline(
					[new Vector3(off, y, -end), new Vector3(off, y, end)],
					false,
				),
				new Polyline(
					[new Vector3(-end, y, off), new Vector3(end, y, off)],
					false,
				),
			);
		}
	}
	for (const c of [-end, end]) {
		ctx.sidewalks.push(
			new Polyline([new Vector3(c, y, -end), new Vector3(c, y, end)], false),
			new Polyline([new Vector3(-end, y, c), new Vector3(end, y, c)], false),
		);
	}
}
