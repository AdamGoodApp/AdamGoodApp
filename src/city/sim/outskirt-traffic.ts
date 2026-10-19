import { Vector3 } from "three";
import { MAT_INSTANCED } from "../geometry";
import { CARS } from "../palette";
import { car } from "../prefabs";
import type { BuildContext } from "../world/context";
import { ROAD_Y } from "../world/layout";
import { OUTSKIRT_SEGMENTS, type Segment } from "../world/outskirts";
import { type Agent, Pool, scaled } from "./agent";

const LANE = 1.25;
/** Cars on one street keep this spacing; a street flows at one speed so they never close up. */
const SPACING = 14;
/** Metres over which a car swings across into the opposite lane at a street end. */
const TURN = 6;

interface Loop {
	seg: Segment;
	speed: number;
	first: number;
	count: number;
	offset: number;
}

/**
 * Through-traffic on the outskirt streets. Each street is one loop: cars drive
 * out on the right-hand lane, U-turn at the end and come back on the other
 * lane, evenly spaced at one speed, so nobody pops in or out of view and no
 * junction logic is needed.
 */
export function createOutskirtTraffic(ctx: BuildContext): void {
	const loops: Loop[] = [];
	let total = 0;
	const budget = scaled(90, ctx.density);
	const length = OUTSKIRT_SEGMENTS.reduce((sum, s) => sum + (s.to - s.from), 0);
	for (const seg of OUTSKIRT_SEGMENTS) {
		const len = seg.to - seg.from;
		const count = Math.min(
			Math.floor((2 * len) / SPACING),
			Math.round((budget * len) / length),
		);
		if (count < 1) continue;
		loops.push({
			seg,
			speed: ctx.rng.range(8, 12),
			first: total,
			count,
			offset: ctx.rng.range(0, 2 * len),
		});
		total += count;
	}
	if (total === 0) return;
	const pool = new Pool(car(), MAT_INSTANCED, total, { shadow: true });
	for (let i = 0; i < total; i++) pool.color(i, ctx.rng.pick(CARS));
	ctx.group.add(pool.mesh);
	const p = new Vector3();
	const agent: Agent = {
		update(_dt, t) {
			for (const { seg, speed, first, count, offset } of loops) {
				const len = seg.to - seg.from;
				const loop = 2 * len;
				for (let k = 0; k < count; k++) {
					const s =
						(((t * speed + offset + (k * loop) / count) % loop) + loop) % loop;
					const outbound = s < len;
					const d = outbound ? s : s - len;
					const along = outbound ? seg.from + d : seg.to - d;
					// Lane: +1 = outbound right-hand lane, −1 = return lane; swing across near the ends.
					const toEnd = len - d;
					const swing = toEnd < TURN ? toEnd / TURN : 1;
					const side =
						(outbound ? 1 : -1) * swing + (outbound ? -1 : 1) * (1 - swing);
					const lane = side * LANE;
					let yaw: number;
					if (seg.axis === "x") {
						// Outbound runs +Z and keeps to −X.
						p.set(seg.at - lane, ROAD_Y, along);
						yaw = outbound ? 0 : Math.PI;
					} else {
						// Outbound runs +X and keeps to +Z.
						p.set(along, ROAD_Y, seg.at + lane);
						yaw = outbound ? Math.PI / 2 : -Math.PI / 2;
					}
					// U-turn to the left over the last TURN metres (yaw rises by π).
					pool.write(first + k, p, yaw + (1 - swing) * Math.PI);
				}
			}
			pool.commit();
		},
	};
	ctx.agents.push(agent);
}
