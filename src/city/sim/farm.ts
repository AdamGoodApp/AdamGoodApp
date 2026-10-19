import { type BufferGeometry, MathUtils, Vector3 } from "three";
import { box, MAT_INSTANCED, merge, place } from "../geometry";
import { cow, sheep } from "../prefabs";
import type { Rng } from "../rng";
import type { BuildContext } from "../world/context";
import { CELL_Y } from "../world/layout";
import { type Agent, Pool, scaled } from "./agent";

export interface Rect {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}

/** Top of the pasture/field patches laid over the district slab. */
export const FARM_Y = CELL_Y + 0.04;

const INSET = 1.5;
const WALK_SPEED = 0.6;
const BOB = MathUtils.degToRad(3);
const TURN_RATE = 5;
const COW_TINTS = [0xffffff, 0xffffff, 0xf0e0d0, 0xd9b99a] as const;
const WINDMILL_YAW = Math.PI / 4;
const WINDMILL_SPIN = 0.9;

interface Animal {
	readonly pos: Vector3;
	yaw: number;
	targetYaw: number;
	tx: number;
	tz: number;
	walking: boolean;
	idle: number;
}

/** Idle (head bob) → walk to a nearby random point in the pasture → idle. */
class GrazingAgent implements Agent {
	private readonly animals: Animal[] = [];
	private readonly area: Rect;

	constructor(
		private readonly pool: Pool,
		area: Rect,
		private readonly rng: Rng,
	) {
		this.area = {
			minX: area.minX + INSET,
			maxX: area.maxX - INSET,
			minZ: area.minZ + INSET,
			maxZ: area.maxZ - INSET,
		};
		for (let i = 0; i < pool.count; i++) {
			const yaw = rng.range(-Math.PI, Math.PI);
			this.animals.push({
				pos: new Vector3(
					rng.range(this.area.minX, this.area.maxX),
					FARM_Y,
					rng.range(this.area.minZ, this.area.maxZ),
				),
				yaw,
				targetYaw: yaw,
				tx: 0,
				tz: 0,
				walking: false,
				idle: rng.range(0, 6),
			});
		}
	}

	private startWalk(a: Animal): void {
		const { area, rng } = this;
		for (let attempt = 0; attempt < 6; attempt++) {
			a.tx = MathUtils.clamp(
				a.pos.x + rng.range(-10, 10),
				area.minX,
				area.maxX,
			);
			a.tz = MathUtils.clamp(
				a.pos.z + rng.range(-10, 10),
				area.minZ,
				area.maxZ,
			);
			if (Math.hypot(a.tx - a.pos.x, a.tz - a.pos.z) >= 2) break;
		}
		a.targetYaw = Math.atan2(a.tx - a.pos.x, a.tz - a.pos.z);
		a.walking = true;
	}

	update(dt: number, t: number): void {
		for (let i = 0; i < this.animals.length; i++) {
			const a = this.animals[i] as Animal;
			let pitch = 0;
			if (a.walking) {
				const dx = a.tx - a.pos.x;
				const dz = a.tz - a.pos.z;
				const dist = Math.hypot(dx, dz);
				const step = WALK_SPEED * dt;
				if (dist <= step) {
					a.pos.x = a.tx;
					a.pos.z = a.tz;
					a.walking = false;
					a.idle = this.rng.range(2, 6);
				} else {
					a.pos.x += (dx / dist) * step;
					a.pos.z += (dz / dist) * step;
				}
			} else {
				a.idle -= dt;
				if (a.idle <= 0) this.startWalk(a);
				pitch = Math.sin(t * 2.4 + i * 1.9) * BOB;
			}
			const turn =
				MathUtils.euclideanModulo(a.targetYaw - a.yaw + Math.PI, Math.PI * 2) -
				Math.PI;
			a.yaw += turn * Math.min(1, dt * TURN_RATE);
			this.pool.write(i, a.pos, a.yaw, pitch);
		}
		this.pool.commit();
	}
}

function grazers(
	ctx: BuildContext,
	geo: BufferGeometry,
	area: Rect,
	count: number,
	tints?: readonly number[],
): void {
	const pool = new Pool(geo, MAT_INSTANCED, scaled(count, ctx.density));
	if (tints) {
		for (let i = 0; i < pool.count; i++) pool.color(i, ctx.rng.pick(tints));
	}
	ctx.group.add(pool.mesh);
	const agent = new GrazingAgent(pool, area, ctx.rng);
	agent.update(0, 0);
	ctx.agents.push(agent);
}

/** Cows and sheep grazing their pastures; 2 pools → 2 draw calls. */
export function createFarm(
	ctx: BuildContext,
	areas: { cows: Rect; sheep: Rect },
): void {
	grazers(ctx, cow(), areas.cows, 4, COW_TINTS);
	grazers(ctx, sheep(), areas.sheep, 6);
}

/** Four arms with sails and a hub, facing +Z, spinning about local Z. */
function windmillBlades(): BufferGeometry {
	const parts: BufferGeometry[] = [box(0.7, 0.7, 0.5, 0x8a5a3c, 0, -0.35, 0)];
	for (let i = 0; i < 4; i++) {
		const arm = merge([
			box(0.4, 5.5, 0.12, 0xffffff, 0, 0.35, 0),
			box(1.1, 3.6, 0.08, 0xf5ecd7, 0.75, 1.5, 0),
		]);
		parts.push(place(arm, { rz: (i * Math.PI) / 2 }));
	}
	return merge(parts);
}

class WindmillAgent implements Agent {
	constructor(
		private readonly pool: Pool,
		private readonly hubs: readonly Vector3[],
	) {}

	update(_dt: number, t: number): void {
		for (let i = 0; i < this.hubs.length; i++) {
			this.pool.write(
				i,
				this.hubs[i] as Vector3,
				WINDMILL_YAW,
				0,
				t * WINDMILL_SPIN + i * 1.3,
			);
		}
		this.pool.commit();
	}
}

/** One InstancedMesh for every windmill's blades (hub positions are world space). */
export function createWindmills(
	ctx: BuildContext,
	hubs: readonly Vector3[],
): void {
	const pool = new Pool(windmillBlades(), MAT_INSTANCED, hubs.length, {
		shadow: true,
	});
	ctx.group.add(pool.mesh);
	const agent = new WindmillAgent(pool, hubs);
	agent.update(0, 0);
	ctx.agents.push(agent);
}
