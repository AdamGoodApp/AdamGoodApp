import { CatmullRomCurve3, MathUtils, Vector3 } from "three";
import { MAT_INSTANCED } from "../geometry";
import { plane } from "../prefabs";
import type { BuildContext } from "../world/context";
import { type Agent, Pool } from "./agent";
import { Polyline } from "./path";

const FLIGHT_PATH: readonly [number, number, number][] = [
	[58, 0.8, -80],
	[58, 0.8, -40],
	[58, 2, -30],
	[58, 20, 10],
	[58, 45, 80],
	[120, 55, 140],
	[180, 60, 0],
	[120, 60, -160],
	[58, 35, -200],
	[58, 8, -110],
	[58, 0.8, -82],
];

const TAXI_SPEED = 6;
const CRUISE_SPEED = 40;
const TAKEOFF_RUN = 40;
const LANDING_DECEL = 60;
const BANK_LOOKAHEAD = 8;
const AIRLINER_SPEED = 35;
const AIRLINER_PERIOD = 45;
const AIRLINER_SCALE = 2.2;
const AIRLINER_FROM = new Vector3(-220, 75, 120);
const AIRLINER_TO = new Vector3(220, 75, -120);

function buildFlightLoop(): Polyline {
	const curve = new CatmullRomCurve3(
		FLIGHT_PATH.map(([x, y, z]) => new Vector3(x, Math.max(0.3, y - 0.5), z)),
		true,
		"centripetal",
	);
	const pts = curve.getSpacedPoints(450);
	pts.pop();
	return new Polyline(pts, true);
}

class PlaneAgent implements Agent {
	private s: number;
	private readonly pos = new Vector3();
	private readonly tan = new Vector3();
	private readonly ahead = new Vector3();

	constructor(
		private readonly pool: Pool,
		private readonly index: number,
		private readonly loop: Polyline,
		startS: number,
	) {
		this.s = startS;
	}

	update(dt: number): void {
		const { loop, pos, tan, ahead } = this;
		const len = loop.length;
		const toEnd = len - this.s;
		const speed = Math.min(
			TAXI_SPEED +
				(CRUISE_SPEED - TAXI_SPEED) * Math.min(1, this.s / TAKEOFF_RUN),
			TAXI_SPEED +
				(CRUISE_SPEED - TAXI_SPEED) * Math.min(1, toEnd / LANDING_DECEL),
		);
		this.s = (this.s + speed * dt) % len;
		loop.pointAt(this.s, pos);
		loop.tangentAt(this.s, tan);
		loop.tangentAt(this.s + BANK_LOOKAHEAD, ahead);
		const yaw = Math.atan2(tan.x, tan.z);
		const turn =
			MathUtils.euclideanModulo(
				Math.atan2(ahead.x, ahead.z) - yaw + Math.PI,
				Math.PI * 2,
			) - Math.PI;
		const roll = -MathUtils.clamp(turn * 1.2, -0.3, 0.3);
		// Positive pitch (rotation about +X) points the +Z nose down.
		this.pool.write(this.index, pos, yaw, -Math.asin(tan.y), roll);
		this.pool.commit();
	}
}

class AirlinerAgent implements Agent {
	private readonly pos = new Vector3();
	private readonly dir = AIRLINER_TO.clone().sub(AIRLINER_FROM);
	private readonly duration: number;
	private readonly yaw: number;

	constructor(
		private readonly pool: Pool,
		private readonly index: number,
	) {
		this.duration = this.dir.length() / AIRLINER_SPEED;
		this.dir.normalize();
		this.yaw = Math.atan2(this.dir.x, this.dir.z);
	}

	update(_dt: number, t: number): void {
		const phase = t % AIRLINER_PERIOD;
		if (phase > this.duration) {
			this.pool.hide(this.index);
		} else {
			this.pos
				.copy(AIRLINER_FROM)
				.addScaledVector(this.dir, phase * AIRLINER_SPEED);
			this.pool.write(this.index, this.pos, this.yaw, 0, 0, AIRLINER_SCALE);
		}
		this.pool.commit();
	}
}

/** 2 airport planes + 1 airliner in ONE instanced mesh (one draw call). */
export function createPlanes(ctx: BuildContext): void {
	const loop = buildFlightLoop();
	const pool = new Pool(plane(), MAT_INSTANCED, 3, { shadow: true });
	ctx.group.add(pool.mesh);
	ctx.agents.push(
		new PlaneAgent(pool, 0, loop, 0),
		new PlaneAgent(pool, 1, loop, loop.length / 2),
		new AirlinerAgent(pool, 2),
	);
}
