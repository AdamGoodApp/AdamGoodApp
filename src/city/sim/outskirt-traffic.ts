import { Vector3 } from "three";
import { MAT_INSTANCED } from "../geometry";
import { CARS } from "../palette";
import { car } from "../prefabs";
import type { BuildContext } from "../world/context";
import { ROAD_Y } from "../world/layout";
import { OUTSKIRT_SEGMENTS, type Segment } from "../world/outskirts";
import { type Agent, Pool, scaled } from "./agent";

const LANE = 1.25;
/** Cars in one lane keep this spacing; lanes flow at one speed so they never close up. */
const SPACING = 14;

interface Lane {
	seg: Segment;
	dir: 1 | -1;
	speed: number;
	first: number;
	count: number;
}

/**
 * Through-traffic on the outskirt streets: every lane is a conveyor of evenly
 * spaced cars at one speed that wraps from the end of its street back to the
 * start. Cheap (no junction logic) and convincing at the edges of the screen.
 */
export function createOutskirtTraffic(ctx: BuildContext): void {
	const lanes: Lane[] = [];
	let total = 0;
	const budget = scaled(90, ctx.density);
	const length = OUTSKIRT_SEGMENTS.reduce((sum, s) => sum + (s.to - s.from), 0);
	for (const seg of OUTSKIRT_SEGMENTS) {
		const len = seg.to - seg.from;
		for (const dir of [1, -1] as const) {
			const want = Math.min(
				Math.floor(len / SPACING),
				Math.round((budget * len) / length / 2),
			);
			if (want < 1) continue;
			lanes.push({
				seg,
				dir,
				speed: ctx.rng.range(8, 12),
				first: total,
				count: want,
			});
			total += want;
		}
	}
	if (total === 0) return;
	const pool = new Pool(car(), MAT_INSTANCED, total, { shadow: true });
	for (let i = 0; i < total; i++) pool.color(i, ctx.rng.pick(CARS));
	ctx.group.add(pool.mesh);
	const offsets = lanes.map(() => ctx.rng.range(0, SPACING));
	const p = new Vector3();
	const agent: Agent = {
		update(_dt, t) {
			lanes.forEach((lane, li) => {
				const { seg, dir, speed, first, count } = lane;
				const len = seg.to - seg.from;
				const gap = len / count;
				const yaw =
					seg.axis === "x"
						? dir > 0
							? 0
							: Math.PI
						: dir > 0
							? Math.PI / 2
							: -Math.PI / 2;
				for (let k = 0; k < count; k++) {
					const s =
						(((t * speed + (offsets[li] as number) + k * gap) % len) + len) %
						len;
					const along = dir > 0 ? seg.from + s : seg.to - s;
					// Right-hand traffic: +Z traffic keeps to −X, +X traffic keeps to +Z.
					if (seg.axis === "x") p.set(seg.at - dir * LANE, ROAD_Y, along);
					else p.set(along, ROAD_Y, seg.at + dir * LANE);
					pool.write(first + k, p, yaw);
				}
			});
			pool.commit();
		},
	};
	ctx.agents.push(agent);
}
