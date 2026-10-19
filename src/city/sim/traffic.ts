import { Vector3 } from "three";
import { MAT_INSTANCED } from "../geometry";
import { CARS } from "../palette";
import { bus, car, tram } from "../prefabs";
import type { BuildContext } from "../world/context";
import { type Agent, Pool, scaled } from "./agent";
import type { Polyline } from "./path";
import {
	BUS_RING,
	BUS_RING_REVERSE,
	BUS_STOPS_CCW,
	BUS_STOPS_CW,
	CAR_LOOPS,
	TRAM,
	TRAM_STOPS,
	TRAM_Y,
} from "./routes";

const CAR_HALF_LEN = 2.1;
const BUS_HALF_LEN = 4.5;
/** Bumper-to-bumper gap a vehicle keeps to the one ahead (car-to-car centres: 7 m). */
const GAP = 2.8;
const LOOKAHEAD = 24;
const LANE_CLEARANCE = 1.7;
const ACCEL = 3.5;
const BRAKE = 12;
const SPAWN_GAP = 9;
const BUS_SPEED = 9;
const BUS_DWELL = 3;
const BUS_COMFORT_DECEL = 3;
const BUS_TINTS = [0xf2c94c, 0x3b7dd8] as const;
/** A vehicle blocked for this long ignores others briefly so crossings cannot deadlock. */
const STUCK_AFTER = 4;
const STUCK_RELEASE = 1.5;

const TRAM_SPEED = 7;
const TRAM_DWELL = 4;
const TRAM_SPACING = 7.5;
const TRAM_CARRIAGES = 3;
const TRAM_ACCEL = 1.5;
const TRAM_BRAKE = 6;
const TRAM_COMFORT_DECEL = 2;
/** The tram prefab's body floats 0.3 m above its origin; sink it onto the rails. */
const TRAM_DROP = 0.15;

function approachAngle(cur: number, target: number, k: number): number {
	let d = target - cur;
	d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
	return cur + d * k;
}

/** Walks a sorted list of per-lap stop positions in unwrapped arc length. */
class StopCursor {
	private idx = 0;
	private lap: number;

	constructor(
		private readonly stops: readonly number[],
		private readonly length: number,
		s: number,
	) {
		this.lap = Math.floor(s / length);
		const local = s - this.lap * length;
		const i = stops.findIndex((v) => v > local + 1e-3);
		if (i < 0) this.lap += 1;
		else this.idx = i;
	}

	get next(): number {
		return this.lap * this.length + (this.stops[this.idx] as number);
	}

	advance(): void {
		this.idx += 1;
		if (this.idx >= this.stops.length) {
			this.idx = 0;
			this.lap += 1;
		}
	}
}

class Vehicle {
	v = 0;
	dwell = 0;
	stuck = 0;
	ignore = 0;
	readonly pos = new Vector3();
	readonly dir = new Vector3();
	yaw = 0;

	constructor(
		readonly id: number,
		readonly pool: Pool,
		readonly index: number,
		readonly line: Polyline,
		public s: number,
		readonly cruise: number,
		readonly halfLen: number,
		readonly stops: StopCursor | null,
	) {
		this.refresh();
		this.yaw = Math.atan2(this.dir.x, this.dir.z);
	}

	refresh(): void {
		this.line.pointAt(this.s, this.pos);
		this.line.tangentAt(this.s, this.dir);
	}
}

class RoadTraffic implements Agent {
	constructor(
		private readonly vehicles: readonly Vehicle[],
		private readonly pools: readonly Pool[],
	) {}

	update(dt: number): void {
		for (const a of this.vehicles) this.drive(a, dt);
		const k = 1 - Math.exp(-dt * 12);
		for (const a of this.vehicles) {
			a.refresh();
			a.yaw = approachAngle(a.yaw, Math.atan2(a.dir.x, a.dir.z), k);
			a.pool.write(a.index, a.pos, a.yaw);
		}
		for (const p of this.pools) p.commit();
	}

	private drive(a: Vehicle, dt: number): void {
		let limit = a.cruise;
		const dwelling = a.dwell > 0;
		if (dwelling) {
			a.dwell -= dt;
			limit = 0;
		} else if (a.stops) {
			const dist = Math.max(0, a.stops.next - a.s);
			limit = Math.min(limit, 0.4 + Math.sqrt(2 * BUS_COMFORT_DECEL * dist));
		}

		if (a.ignore > 0) a.ignore -= dt;
		else limit = Math.min(limit, this.blockLimit(a));

		if (!dwelling && limit < 0.2) {
			a.stuck += dt;
			if (a.stuck > STUCK_AFTER) {
				a.stuck = 0;
				a.ignore = STUCK_RELEASE;
			}
		} else a.stuck = 0;

		if (dwelling) a.v = 0;
		else if (limit < a.v) a.v = Math.max(limit, a.v - BRAKE * dt);
		else a.v = Math.min(limit, a.v + ACCEL * dt);

		const ds = a.v * dt;
		if (a.stops && !dwelling && a.s + ds >= a.stops.next) {
			a.s = a.stops.next;
			a.v = 0;
			a.dwell = BUS_DWELL;
			a.stops.advance();
		} else a.s += ds;
	}

	/** Highest speed `a` may drive without closing on whatever is in front of it. */
	private blockLimit(a: Vehicle): number {
		let limit = Number.POSITIVE_INFINITY;
		for (const b of this.vehicles) {
			if (b === a) continue;
			const dx = b.pos.x - a.pos.x;
			const dz = b.pos.z - a.pos.z;
			const along = dx * a.dir.x + dz * a.dir.z;
			if (along <= 0 || along > LOOKAHEAD) continue;
			if (Math.abs(dx * a.dir.z - dz * a.dir.x) > LANE_CLEARANCE) continue;
			const parallel = a.dir.x * b.dir.x + a.dir.z * b.dir.z > 0.7;
			if (!parallel && b.id > a.id) continue;
			const gap = along - (a.halfLen + b.halfLen + GAP);
			limit = Math.min(limit, Math.max(0, (parallel ? b.v : 0) + gap));
		}
		return limit;
	}
}

class TramAgent implements Agent {
	private v = 0;
	private dwell = 0;
	private readonly point = new Vector3();
	private readonly tangent = new Vector3();
	private readonly stops: StopCursor;

	/** `s` is the arc length of the middle carriage. */
	constructor(
		private s: number,
		private readonly pool: Pool,
	) {
		this.stops = new StopCursor(TRAM_STOPS, TRAM.length, s);
	}

	update(dt: number): void {
		if (this.dwell > 0) {
			this.dwell -= dt;
			this.v = 0;
		} else {
			const dist = Math.max(0, this.stops.next - this.s);
			const limit = Math.min(
				TRAM_SPEED,
				0.4 + Math.sqrt(2 * TRAM_COMFORT_DECEL * dist),
			);
			if (limit < this.v) this.v = Math.max(limit, this.v - TRAM_BRAKE * dt);
			else this.v = Math.min(limit, this.v + TRAM_ACCEL * dt);
			const ds = this.v * dt;
			if (this.s + ds >= this.stops.next) {
				this.s = this.stops.next;
				this.v = 0;
				this.dwell = TRAM_DWELL;
				this.stops.advance();
			} else this.s += ds;
		}

		for (let i = 0; i < TRAM_CARRIAGES; i++) {
			const cs = this.s + (1 - i) * TRAM_SPACING;
			TRAM.pointAt(cs, this.point);
			TRAM.tangentAt(cs, this.tangent);
			this.point.y = TRAM_Y - TRAM_DROP;
			this.pool.write(
				i,
				this.point,
				Math.atan2(this.tangent.x, this.tangent.z),
			);
		}
		this.pool.commit();
	}
}

/** First arc length at or after `s0` where no placed vehicle is within SPAWN_GAP. */
function freeSpot(
	line: Polyline,
	s0: number,
	vehicles: readonly Vehicle[],
	scratch: Vector3,
): number {
	let s = s0;
	for (let tries = 0; tries < 200; tries++) {
		line.pointAt(s, scratch);
		if (vehicles.every((v) => v.pos.distanceTo(scratch) >= SPAWN_GAP)) return s;
		s += 2;
	}
	return s;
}

export function createTraffic(ctx: BuildContext): void {
	const { rng } = ctx;
	const scratch = new Vector3();
	const vehicles: Vehicle[] = [];

	const nBuses = scaled(6, ctx.density);
	const busPool = new Pool(bus(), MAT_INSTANCED, nBuses, { shadow: true });
	const perDirection = Math.ceil(nBuses / 2);
	for (let j = 0; j < nBuses; j++) {
		const reverse = j % 2 === 1;
		const line = reverse ? BUS_RING_REVERSE : BUS_RING;
		const slot = Math.floor(j / 2) + (reverse ? 0.5 : 0);
		const s = freeSpot(
			line,
			(slot / perDirection) * line.length,
			vehicles,
			scratch,
		);
		const stops = new StopCursor(
			reverse ? BUS_STOPS_CCW : BUS_STOPS_CW,
			line.length,
			s,
		);
		busPool.color(j, BUS_TINTS[j % BUS_TINTS.length] as number);
		vehicles.push(
			new Vehicle(
				vehicles.length,
				busPool,
				j,
				line,
				s,
				BUS_SPEED,
				BUS_HALF_LEN,
				stops,
			),
		);
	}

	const nCars = scaled(60, ctx.density);
	const carPool = new Pool(car(), MAT_INSTANCED, nCars, { shadow: true });
	// Share cars over the loops in proportion to sqrt(length): busy everywhere, denser on the ring.
	const weights = CAR_LOOPS.map((l) => Math.sqrt(l.length));
	const weightSum = weights.reduce((a, b) => a + b, 0);
	const counts = CAR_LOOPS.map(() => 0);
	for (let k = 0; k < nCars; k++) {
		let best = 0;
		let bestDeficit = Number.NEGATIVE_INFINITY;
		for (let j = 0; j < CAR_LOOPS.length; j++) {
			const deficit =
				((weights[j] as number) / weightSum) * (k + 1) - (counts[j] as number);
			if (deficit > bestDeficit) {
				bestDeficit = deficit;
				best = j;
			}
		}
		counts[best] = (counts[best] as number) + 1;
	}

	let carIndex = 0;
	for (let j = 0; j < CAR_LOOPS.length; j++) {
		const line = CAR_LOOPS[j] as Polyline;
		const m = counts[j] as number;
		for (let i = 0; i < m; i++) {
			const s0 = (i / m) * line.length + j * 7 + rng.range(-1.5, 1.5);
			const s = freeSpot(line, s0, vehicles, scratch);
			carPool.color(carIndex, rng.pick(CARS));
			vehicles.push(
				new Vehicle(
					vehicles.length,
					carPool,
					carIndex,
					line,
					s,
					rng.range(8, 11),
					CAR_HALF_LEN,
					null,
				),
			);
			carIndex += 1;
		}
	}

	ctx.group.add(busPool.mesh, carPool.mesh);
	ctx.agents.push(new RoadTraffic(vehicles, [busPool, carPool]));

	if (scaled(1, ctx.density) > 0) {
		const tramPool = new Pool(tram(), MAT_INSTANCED, TRAM_CARRIAGES, {
			shadow: true,
		});
		ctx.group.add(tramPool.mesh);
		ctx.agents.push(new TramAgent(0, tramPool));
	}
}
