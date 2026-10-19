import { type BufferGeometry, MathUtils, Vector3 } from "three";
import { box, MAT_INSTANCED, merge } from "../geometry";
import { WHITE } from "../palette";
import { liftChair, skier, snowboarder } from "../prefabs";
import type { BuildContext } from "../world/context";
import { type Agent, Pool, scaled } from "./agent";
import type { Polyline } from "./path";

const SKI_SPEED_MIN = 5;
const SKI_SPEED_MAX = 8;
const RESPAWN_DELAY = 2;
const LEAN = MathUtils.degToRad(12);
const LOOK_AHEAD = 1;

const LIFT_SPEED = 2;
/** The chair's hanger tops out 2.9 m above its seat origin. */
const CHAIR_DROP = 2.9;

const GONDOLA_SPEED = 2.6;
const CABIN_COLOURS = [0xe8463c, 0x3b7dd8, 0xf2c94c, 0x58c27a] as const;

interface Rider {
	readonly pool: Pool;
	readonly index: number;
	s: number;
	speed: number;
	wait: number;
}

class SkiAgent implements Agent {
	private readonly pos = new Vector3();
	private readonly ahead = new Vector3();
	private readonly behind = new Vector3();

	constructor(
		private readonly riders: Rider[],
		private readonly path: Polyline,
		private readonly nextSpeed: () => number,
	) {}

	update(dt: number): void {
		const { path } = this;
		for (const r of this.riders) {
			if (r.wait > 0) {
				r.wait -= dt;
				if (r.wait <= 0) {
					r.s = 0;
					r.speed = this.nextSpeed();
				}
			} else {
				r.s += r.speed * dt;
				if (r.s >= path.length) {
					r.wait = RESPAWN_DELAY;
				}
			}
			if (r.wait > 0) {
				r.pool.hide(r.index);
				continue;
			}
			path.pointAt(r.s, this.pos);
			path.pointAt(r.s + LOOK_AHEAD, this.ahead);
			path.pointAt(r.s - LOOK_AHEAD, this.behind);
			this.ahead.sub(this.behind);
			const flat = Math.hypot(this.ahead.x, this.ahead.z);
			const yaw = Math.atan2(this.ahead.x, this.ahead.z);
			const pitch = -Math.atan2(this.ahead.y, flat);
			r.pool.write(r.index, this.pos, yaw, pitch, Math.sin(r.s * 0.5) * LEAN);
		}
		for (const r of this.riders) r.pool.commit();
	}
}

/** 7 skiers + 4 snowboarders sliding down `path`, two Pools → two draw calls. */
export function createSkiers(ctx: BuildContext, path: Polyline): void {
	const { rng } = ctx;
	const skiers = new Pool(skier(), MAT_INSTANCED, scaled(7, ctx.density));
	const boarders = new Pool(
		snowboarder(),
		MAT_INSTANCED,
		scaled(4, ctx.density),
	);
	const riders: Rider[] = [];
	const total = skiers.count + boarders.count;
	for (const pool of [skiers, boarders]) {
		ctx.group.add(pool.mesh);
		for (let i = 0; i < pool.count; i++) {
			pool.color(
				i,
				rng.pick([0xe8463c, 0x3b7dd8, 0xf2c94c, 0x58c27a, 0xf28c28, 0xffffff]),
			);
			riders.push({
				pool,
				index: i,
				s: (riders.length / total) * path.length,
				speed: rng.range(SKI_SPEED_MIN, SKI_SPEED_MAX),
				wait: 0,
			});
		}
	}
	const agent = new SkiAgent(riders, path, () =>
		rng.range(SKI_SPEED_MIN, SKI_SPEED_MAX),
	);
	agent.update(0);
	ctx.agents.push(agent);
}

class LiftAgent implements Agent {
	private readonly pos = new Vector3();
	private readonly dir = new Vector3();
	private readonly round: number;

	constructor(
		private readonly pool: Pool,
		private readonly up: Polyline,
		private readonly down: Polyline,
		private readonly speed: number,
		private readonly drop: number,
	) {
		this.round = up.length * 2;
	}

	update(_dt: number, t: number): void {
		const { pool, up, down, round } = this;
		const spacing = round / pool.count;
		for (let i = 0; i < pool.count; i++) {
			const u = (t * this.speed + i * spacing) % round;
			let yaw: number;
			if (u < up.length) {
				up.pointAt(u, this.pos);
				up.tangentAt(u, this.dir);
				yaw = Math.atan2(this.dir.x, this.dir.z);
			} else {
				const s = round - u;
				down.pointAt(s, this.pos);
				down.tangentAt(s, this.dir);
				yaw = Math.atan2(-this.dir.x, -this.dir.z);
			}
			this.pos.y -= this.drop;
			pool.write(i, this.pos, yaw);
		}
		pool.commit();
	}
}

/** Chairs circulate up the `up` cable and back down the `down` cable. */
export function createLift(
	ctx: BuildContext,
	up: Polyline,
	down: Polyline,
): void {
	const pool = new Pool(liftChair(), MAT_INSTANCED, scaled(14, ctx.density));
	ctx.group.add(pool.mesh);
	const agent = new LiftAgent(pool, up, down, LIFT_SPEED, CHAIR_DROP);
	agent.update(0, 0);
	ctx.agents.push(agent);
}

/** Cable car: roof, hanger and a windowed cabin; the origin is the cable attachment point. */
function cableCar(): BufferGeometry {
	return merge([
		box(0.08, 0.9, 0.08, 0x444444, 0, -0.9, 0),
		box(1.7, 0.14, 1.4, 0x444444, 0, -1.04, 0),
		box(1.5, 1.2, 1.2, WHITE, 0, -2.24, 0),
		box(1.54, 0.5, 1.24, 0x2b3a4a, 0, -1.9, 0),
		box(1.6, 0.1, 1.3, 0x444444, 0, -2.34, 0),
	]);
}

/** Gondola cabins shuttle along the `up` cable and return on the `down` cable. */
export function createGondola(
	ctx: BuildContext,
	up: Polyline,
	down: Polyline,
): void {
	const pool = new Pool(cableCar(), MAT_INSTANCED, scaled(6, ctx.density));
	for (let i = 0; i < pool.count; i++) {
		pool.color(i, CABIN_COLOURS[i % CABIN_COLOURS.length] as number);
	}
	ctx.group.add(pool.mesh);
	const agent = new LiftAgent(pool, up, down, GONDOLA_SPEED, 0.05);
	agent.update(0, 0);
	ctx.agents.push(agent);
}
