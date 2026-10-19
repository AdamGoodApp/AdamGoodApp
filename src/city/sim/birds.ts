import { Vector3 } from "three";
import { MAT_INSTANCED } from "../geometry";
import { bird } from "../prefabs";
import type { BuildContext } from "../world/context";
import { type Agent, Pool, scaled } from "./agent";

const OMEGA = 0.6;
const BANK = (20 * Math.PI) / 180;

const FLOCKS = [
	{ cx: -60, cy: 18, cz: 60, r: 15 },
	{ cx: 0, cy: 22, cz: 0, r: 12 },
] as const;

interface Gull {
	flock: number;
	phase: number;
	radius: number;
}

class BirdAgent implements Agent {
	private readonly pos = new Vector3();

	constructor(
		private readonly pool: Pool,
		private readonly gulls: Gull[],
	) {}

	update(_dt: number, t: number): void {
		for (let i = 0; i < this.gulls.length; i++) {
			const g = this.gulls[i] as Gull;
			const f = FLOCKS[g.flock] as (typeof FLOCKS)[number];
			const a = g.phase + OMEGA * t;
			this.pos.set(
				f.cx + Math.cos(a) * g.radius,
				f.cy + Math.sin(t * 2 + i) * 0.8,
				f.cz + Math.sin(a) * g.radius,
			);
			// Velocity is (-sin a, cos a); the orbit centre lies to the bird's right.
			const yaw = Math.atan2(-Math.sin(a), Math.cos(a));
			const flap = Math.sin(t * 9 + i * 1.7);
			this.pool.write(i, this.pos, yaw, flap * 0.08, BANK + flap * 0.18);
		}
		this.pool.commit();
	}
}

/** 20 gulls (scaled by density) in two orbiting flocks, one instanced mesh. */
export function createBirds(ctx: BuildContext): void {
	const count = scaled(20, ctx.density);
	const gulls: Gull[] = [];
	for (let i = 0; i < count; i++) {
		const flock = i % 2;
		const base = (FLOCKS[flock] as (typeof FLOCKS)[number]).r;
		gulls.push({ flock, phase: i * 0.6, radius: base + ctx.rng.range(-3, 3) });
	}
	const pool = new Pool(bird(), MAT_INSTANCED, count, { shadow: false });
	ctx.group.add(pool.mesh);
	ctx.agents.push(new BirdAgent(pool, gulls));
}
