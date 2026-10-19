import {
	CatmullRomCurve3,
	Euler,
	MathUtils,
	Matrix4,
	Quaternion,
	Vector3,
} from "three";
import { MAT_INSTANCED } from "../geometry";
import { helicopter, helicopterRotor, plane } from "../prefabs";
import type { BuildContext } from "../world/context";
import { HELIPAD } from "../world/hospital";
import { type Agent, Pool } from "./agent";
import { Polyline } from "./path";

const AIRLINER_SPEED = 35;
const AIRLINER_PERIOD = 45;
const AIRLINER_SCALE = 2.2;
const AIRLINER_FROM = new Vector3(-220, 75, 120);
const AIRLINER_TO = new Vector3(220, 75, -120);

const REST = 16;
const CLIMB = 7;
const FLIGHT = 42;
const DESCEND = 9;
const PERIOD = REST + CLIMB + FLIGHT + DESCEND;
/** Seconds into the cycle at t = 0, so the rotor is already spooling up at load. */
const START_OFFSET = 10;
const CRUISE_Y = 42;
const ORBIT_R = 112;
const ORBIT_STEPS = 24;
const ROTOR_OFFSET = new Vector3(0, 2.9, -0.4);
const ROTOR_OMEGA = 28;
const UP = new Vector3(0, 1, 0);
const UNIT = new Vector3(1, 1, 1);

class AirlinerAgent implements Agent {
	private readonly pos = new Vector3();
	private readonly dir = AIRLINER_TO.clone().sub(AIRLINER_FROM);
	private readonly duration: number;
	private readonly yaw: number;

	constructor(private readonly pool: Pool) {
		this.duration = this.dir.length() / AIRLINER_SPEED;
		this.dir.normalize();
		this.yaw = Math.atan2(this.dir.x, this.dir.z);
	}

	update(_dt: number, t: number): void {
		const phase = t % AIRLINER_PERIOD;
		if (phase > this.duration) {
			this.pool.hide(0);
		} else {
			this.pos
				.copy(AIRLINER_FROM)
				.addScaledVector(this.dir, phase * AIRLINER_SPEED);
			this.pool.write(0, this.pos, this.yaw, 0, 0, AIRLINER_SCALE);
		}
		this.pool.commit();
	}
}

function smooth(x: number): number {
	const c = MathUtils.clamp(x, 0, 1);
	return c * c * (3 - 2 * c);
}

function angleDiff(a: number, b: number): number {
	return MathUtils.euclideanModulo(a - b + Math.PI, Math.PI * 2) - Math.PI;
}

/** One lap around the island at cruise height, starting and ending above the helipad. */
function buildRoute(): Polyline {
	const theta0 = Math.atan2(HELIPAD.z, HELIPAD.x);
	const start = new Vector3(HELIPAD.x, CRUISE_Y, HELIPAD.z);
	const pts = [start];
	for (let k = 0; k < ORBIT_STEPS; k++) {
		const a = theta0 + (k / ORBIT_STEPS) * Math.PI * 2;
		pts.push(
			new Vector3(Math.cos(a) * ORBIT_R, CRUISE_Y, Math.sin(a) * ORBIT_R),
		);
	}
	pts.push(start.clone());
	const curve = new CatmullRomCurve3(pts, false, "centripetal");
	return new Polyline(curve.getSpacedPoints(360), false);
}

/**
 * Medical helicopter: rests on the hospital helipad, spools up, climbs,
 * circles the island, lands and turns back to its departure heading.
 */
class HelicopterAgent implements Agent {
	private readonly route = buildRoute();
	private readonly pos = new Vector3();
	private readonly tan = new Vector3();
	private readonly hub = new Vector3();
	private readonly quat = new Quaternion();
	private readonly spin = new Quaternion();
	private readonly euler = new Euler();
	private readonly matrix = new Matrix4();
	private readonly startYaw: number;
	private readonly endYaw: number;
	private yaw: number;
	private roll = 0;
	private angle = 0;

	constructor(
		private readonly body: Pool,
		private readonly rotor: Pool,
	) {
		this.route.tangentAt(0, this.tan);
		this.startYaw = Math.atan2(this.tan.x, this.tan.z);
		this.route.tangentAt(this.route.length, this.tan);
		this.endYaw = Math.atan2(this.tan.x, this.tan.z);
		this.yaw = this.startYaw;
	}

	update(dt: number, t: number): void {
		const { route, pos, tan } = this;
		const ph = (t + START_OFFSET) % PERIOD;
		let yaw = this.startYaw;
		let spool = 1;
		let forward = 0;
		const start = route.start;

		if (ph < REST) {
			pos.copy(HELIPAD);
			spool = ph < 5 ? 1 - ph / 5 : ph < 10 ? 0 : (ph - 10) / 6;
		} else if (ph < REST + CLIMB) {
			const f = smooth((ph - REST) / CLIMB);
			pos.set(start.x, HELIPAD.y + (CRUISE_Y - HELIPAD.y) * f, start.z);
		} else if (ph < REST + CLIMB + FLIGHT) {
			const f = (ph - REST - CLIMB) / FLIGHT;
			const s = smooth(f) * route.length;
			route.pointAt(s, pos);
			route.tangentAt(s, tan);
			yaw = Math.atan2(tan.x, tan.z);
			forward = 4 * f * (1 - f);
		} else {
			const g = smooth((ph - REST - CLIMB - FLIGHT) / DESCEND);
			pos.set(start.x, CRUISE_Y + (HELIPAD.y - CRUISE_Y) * g, start.z);
			yaw = this.endYaw + angleDiff(this.startYaw, this.endYaw) * g;
		}

		if (dt > 0) {
			const rate = angleDiff(yaw, this.yaw) / dt;
			const target = MathUtils.clamp(-rate * 0.9, -0.25, 0.25);
			this.roll += (target - this.roll) * Math.min(1, dt * 4);
			this.angle += ROTOR_OMEGA * spool * dt;
		}
		this.yaw = yaw;
		const pitch = 0.14 * forward;

		this.body.write(0, pos, yaw, pitch, this.roll);
		this.body.commit();

		this.quat.setFromEuler(this.euler.set(pitch, yaw, this.roll, "YXZ"));
		this.hub.copy(ROTOR_OFFSET).applyQuaternion(this.quat).add(pos);
		this.spin.setFromAxisAngle(UP, this.angle);
		this.quat.multiply(this.spin);
		this.matrix.compose(this.hub, this.quat, UNIT);
		this.rotor.mesh.setMatrixAt(0, this.matrix);
		this.rotor.commit();
	}
}

/** Airliner crossing the sky (1 pool) plus the hospital's medical helicopter (body + rotor pools). */
export function createSkyTraffic(ctx: BuildContext): void {
	const airliner = new Pool(plane(), MAT_INSTANCED, 1, { shadow: true });
	const body = new Pool(helicopter(), MAT_INSTANCED, 1, { shadow: true });
	const rotor = new Pool(helicopterRotor(), MAT_INSTANCED, 1);
	ctx.group.add(airliner.mesh, body.mesh, rotor.mesh);
	ctx.agents.push(
		new AirlinerAgent(airliner),
		new HelicopterAgent(body, rotor),
	);
}
