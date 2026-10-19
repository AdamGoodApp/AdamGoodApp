import { Vector3 } from "three";
import { MAT_INSTANCED } from "../geometry";
import { SHIRTS } from "../palette";
import { person } from "../prefabs";
import type { BuildContext } from "../world/context";
import { type Agent, Pool, scaled } from "./agent";

export interface CrowdSpot {
	x: number;
	z: number;
	/** Ground height the person stands on. */
	y?: number;
	/** Facing (yaw); random when omitted. */
	ry?: number;
}

/**
 * A standing crowd (spectators, queues, rally): one Pool of people that idle in
 * place, bobbing and slowly turning. `count` is scaled by density; spots are
 * cycled when there are more people than spots and jittered by `spread` metres.
 */
export function createCrowd(
	ctx: BuildContext,
	spots: readonly CrowdSpot[],
	{
		count = spots.length,
		spread = 0.6,
		cheer = false,
	}: { count?: number; spread?: number; cheer?: boolean } = {},
): void {
	const n = scaled(count, ctx.density);
	if (n === 0 || spots.length === 0) return;
	const pool = new Pool(person(), MAT_INSTANCED, n);
	const base: Vector3[] = [];
	const yaw: number[] = [];
	const phase: number[] = [];
	for (let i = 0; i < n; i++) {
		const s = spots[i % spots.length] as CrowdSpot;
		base.push(
			new Vector3(
				s.x + ctx.rng.range(-spread, spread),
				s.y ?? 0.1,
				s.z + ctx.rng.range(-spread, spread),
			),
		);
		yaw.push(s.ry ?? ctx.rng.range(0, Math.PI * 2));
		phase.push(ctx.rng.range(0, Math.PI * 2));
		pool.color(i, ctx.rng.pick(SHIRTS));
	}
	ctx.group.add(pool.mesh);
	const p = new Vector3();
	const agent: Agent = {
		update(_dt, t) {
			for (let i = 0; i < n; i++) {
				const ph = phase[i] as number;
				const jump = cheer
					? Math.max(0, Math.sin(t * 5 + ph)) * 0.25
					: Math.abs(Math.sin(t * 2 + ph)) * 0.03;
				p.copy(base[i] as Vector3);
				p.y += jump;
				pool.write(i, p, (yaw[i] as number) + Math.sin(t * 0.4 + ph) * 0.4);
			}
			pool.commit();
		},
	};
	ctx.agents.push(agent);
}
