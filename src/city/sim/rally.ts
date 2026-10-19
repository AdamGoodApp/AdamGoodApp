import { MathUtils, Vector3 } from "three";
import { MAT_INSTANCED } from "../geometry";
import { BRIGHTS } from "../palette";
import { placard } from "../prefabs";
import type { BuildContext } from "../world/context";
import { type Agent, Pool, scaled } from "./agent";

export interface PlacardArea {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
	/** Ground height the signs are held from. */
	y: number;
}

const WAVE = 0.28;
const TILT = MathUtils.degToRad(9);

/**
 * Protest signs held above a rally crowd: one Pool of coloured placards
 * scattered over `area`, angled toward the street/camera and waving in time.
 */
export function createPlacards(
	ctx: BuildContext,
	area: PlacardArea,
	count: number,
): void {
	const n = scaled(count, ctx.density);
	if (n === 0) return;
	const { rng } = ctx;
	const pool = new Pool(placard(), MAT_INSTANCED, n);
	const base: Vector3[] = [];
	const yaw: number[] = [];
	const phase: number[] = [];
	for (let i = 0; i < n; i++) {
		base.push(
			new Vector3(
				rng.range(area.minX, area.maxX),
				area.y,
				rng.range(area.minZ, area.maxZ),
			),
		);
		yaw.push(rng.range(0.15, 1.45));
		phase.push(rng.range(0, Math.PI * 2));
		pool.color(i, rng.pick(BRIGHTS));
	}
	ctx.group.add(pool.mesh);
	const p = new Vector3();
	const agent: Agent = {
		update(_dt, t) {
			for (let i = 0; i < n; i++) {
				const ph = phase[i] as number;
				p.copy(base[i] as Vector3);
				p.y += Math.max(0, Math.sin(t * 5 + ph)) * WAVE;
				pool.write(
					i,
					p,
					yaw[i] as number,
					0,
					Math.sin(t * 2.5 + ph * 1.7) * TILT,
				);
			}
			pool.commit();
		},
	};
	agent.update(0, 0);
	ctx.agents.push(agent);
}
