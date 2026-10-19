import { Vector3 } from "three";
import { MAT_INSTANCED } from "../geometry";
import { cloud } from "../prefabs";
import { type Agent, Pool } from "../sim/agent";
import { createBirds } from "../sim/birds";
import type { BuildContext } from "./context";

const COUNT = 5;
const DRIFT = 1.5;
const WRAP_X = 170;

class CloudAgent implements Agent {
	constructor(
		private readonly pool: Pool,
		private readonly positions: Vector3[],
		private readonly yaws: number[],
		private readonly scales: number[],
	) {}

	update(dt: number): void {
		for (let i = 0; i < this.positions.length; i++) {
			const p = this.positions[i] as Vector3;
			p.x += DRIFT * dt;
			if (p.x > WRAP_X) p.x -= 2 * WRAP_X;
			this.pool.write(i, p, this.yaws[i] ?? 0, 0, 0, this.scales[i] ?? 1);
		}
		this.pool.commit();
	}
}

/** Drifting clouds (one instanced mesh). Also creates the gull flocks. */
export function buildClouds(ctx: BuildContext): void {
	const radii = Array.from({ length: ctx.rng.int(4, 5) }, () =>
		ctx.rng.range(2, 3.5),
	);
	const pool = new Pool(cloud(radii), MAT_INSTANCED, COUNT, { shadow: true });
	pool.mesh.receiveShadow = false;
	ctx.group.add(pool.mesh);
	const positions: Vector3[] = [];
	const yaws: number[] = [];
	const scales: number[] = [];
	for (let i = 0; i < COUNT; i++) {
		positions.push(
			new Vector3(
				ctx.rng.range(-160, 160),
				ctx.rng.range(55, 70),
				ctx.rng.range(-120, 120),
			),
		);
		yaws.push(ctx.rng.range(0, Math.PI * 2));
		scales.push(ctx.rng.range(0.6, 1.1));
	}
	ctx.agents.push(new CloudAgent(pool, positions, yaws, scales));
	createBirds(ctx);
}
