import { Vector3 } from "three";
import { MAT_BOAT, MAT_INSTANCED } from "../geometry";
import { ferry, sailboat } from "../prefabs";
import type { BuildContext } from "../world/context";
import { WATER_Y } from "../world/layout";
import { type Agent, Pool, scaled } from "./agent";
import { chamfer, Polyline } from "./path";

const ROLL = (4 * Math.PI) / 180;
const SAIL_TINTS = [0xffffff, 0xffd6a5, 0xcfe8ff] as const;
const BOATS_PER_ORBIT = 2;

/** Sail loops stay in the water band west and south of the island (land is |x|,|z| < 92). */
const ORBITS = [
	{ cx: -125, cz: 20, rx: 12, rz: 35, speed: 2.8 },
	{ cx: -120, cz: 125, rx: 20, rz: 14, speed: 3.4 },
	{ cx: 20, cz: 125, rx: 45, rz: 12, speed: 3.1 },
] as const;

const FERRY_SPEED = 4;
const FERRY_DWELL = 6;
const FERRY_DOCK = new Vector3(-114, WATER_Y, 77.5);

interface Sail {
	orbit: number;
	angle: number;
}

class SailboatAgent implements Agent {
	private readonly pos = new Vector3();

	constructor(
		private readonly pool: Pool,
		private readonly boats: Sail[],
	) {}

	update(dt: number, t: number): void {
		for (let i = 0; i < this.boats.length; i++) {
			const boat = this.boats[i] as Sail;
			const o = ORBITS[boat.orbit] as (typeof ORBITS)[number];
			const sin = Math.sin(boat.angle);
			const cos = Math.cos(boat.angle);
			const speedPerRadian = Math.hypot(o.rx * sin, o.rz * cos);
			boat.angle += (o.speed * dt) / speedPerRadian;
			this.pos.set(
				o.cx + o.rx * cos,
				WATER_Y - 0.25 + Math.sin(t * 1.3 + i) * 0.1,
				o.cz + o.rz * sin,
			);
			// Counter-clockwise on the map: velocity is (-rx sin a, rz cos a).
			const yaw = Math.atan2(-o.rx * sin, o.rz * cos);
			this.pool.write(i, this.pos, yaw, 0, ROLL * Math.sin(t * 0.9 + i * 2));
		}
		this.pool.commit();
	}
}

class FerryAgent implements Agent {
	private readonly pos = new Vector3();
	private readonly tangent = new Vector3();
	private s: number;
	private wait = 0;

	constructor(
		private readonly pool: Pool,
		private readonly path: Polyline,
		private readonly dockS: number,
	) {
		this.s = (dockS - 30 + path.length) % path.length;
	}

	update(dt: number, t: number): void {
		const step = FERRY_SPEED * dt;
		if (this.wait > 0) {
			this.wait -= dt;
			if (this.wait <= 0) this.s += 0.01;
		} else if (step > 0) {
			const toDock =
				(this.dockS - this.s + this.path.length) % this.path.length;
			if (toDock <= step) {
				this.s = this.dockS;
				this.wait = FERRY_DWELL;
			} else {
				this.s = (this.s + step) % this.path.length;
			}
		}
		this.path.pointAt(this.s, this.pos);
		this.path.tangentAt(this.s, this.tangent);
		this.pos.y = WATER_Y - 0.4 + Math.sin(t * 1.1) * 0.06;
		this.pool.write(
			0,
			this.pos,
			Math.atan2(this.tangent.x, this.tangent.z),
			0,
			ROLL * 0.5 * Math.sin(t * 0.8),
		);
		this.pool.commit();
	}
}

/** Arc length of the sampled path point closest to `target`. */
function closestS(path: Polyline, target: Vector3): number {
	const p = new Vector3();
	let best = 0;
	let bestD = Number.POSITIVE_INFINITY;
	for (let s = 0; s < path.length; s += 0.25) {
		const d = path.pointAt(s, p).distanceToSquared(target);
		if (d < bestD) {
			bestD = d;
			best = s;
		}
	}
	return best;
}

/** Sailboats (one pool) and the pier ferry (one pool): 2 draw calls. */
export function createBoats(ctx: BuildContext): void {
	const count = scaled(ORBITS.length * BOATS_PER_ORBIT, ctx.density);
	const boats: Sail[] = [];
	for (let i = 0; i < count; i++) {
		boats.push({
			orbit: i % ORBITS.length,
			angle:
				Math.floor(i / ORBITS.length) * Math.PI + ctx.rng.range(0, Math.PI / 2),
		});
	}
	const sails = new Pool(sailboat(), MAT_BOAT, count);
	for (let i = 0; i < count; i++) sails.color(i, ctx.rng.pick(SAIL_TINTS));
	ctx.group.add(sails.mesh);
	ctx.agents.push(new SailboatAgent(sails, boats));

	// Loop west of the pier; the dock sits on its straight west-going leg beside the pier deck.
	const loop = new Polyline(
		chamfer(
			[
				new Vector3(-104, WATER_Y, 77.5),
				new Vector3(-140, WATER_Y, 77.5),
				new Vector3(-140, WATER_Y, 104),
				new Vector3(-104, WATER_Y, 104),
			],
			6,
		),
		true,
	);
	const ferryPool = new Pool(ferry(), MAT_INSTANCED, 1, { shadow: true });
	ctx.group.add(ferryPool.mesh);
	ctx.agents.push(new FerryAgent(ferryPool, loop, closestS(loop, FERRY_DOCK)));
}
