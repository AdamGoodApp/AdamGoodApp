import { Vector3 } from "three";
import { MAT_INSTANCED } from "../geometry";
import { CARS } from "../palette";
import { ambulance, bus, car, fireTruck, policeCar, tram } from "../prefabs";
import { mulberry32, type Rng } from "../rng";
import type { BuildContext } from "../world/context";
import { type Agent, Pool, scaled } from "./agent";
import { JunctionControl, type Traveller, type Zone } from "./junctions";
import type { Polyline } from "./path";
import {
	BUS_RING,
	BUS_RING_REVERSE,
	BUS_STOPS_CCW,
	BUS_STOPS_CW,
	CAR_LOOPS,
	INNER_CCW,
	LOOP_NW,
	RING_CCW,
	RING_CW,
	TRAM,
	TRAM_STOPS,
	TRAM_Y,
} from "./routes";
import { createSignals, JUNCTIONS } from "./signals";

const CAR_HALF_LEN = 2.1;
const BUS_HALF_LEN = 4.5;
const POLICE_HALF_LEN = 2.2;
const AMBULANCE_HALF_LEN = 2.6;
const FIRE_TRUCK_HALF_LEN = 4.2;
/** Bumper-to-bumper gap a vehicle keeps to the one ahead (car-to-car centres: 7 m). */
const GAP = 2.8;
const LOOKAHEAD = 24;
/** Headings within about 70° count as "same way": a follower waits for the leader, including round chamfered corners. */
const PARALLEL = 0.35;
/** Same-way vehicles this far off the follower's heading still count as in front (corners swing the heading away from the lane). */
const PARALLEL_CLEARANCE = 2.6;
const PARALLEL_SPREAD = 0.6;
/** Heading dot product below which vehicles are oncoming (separate lanes: never in each other's way). */
const OPPOSITE = -0.5;
/** Anything this close in front of the nose stops a vehicle, whatever its route. */
const NOSE_CLEARANCE = 1.6;
const NOSE_GAP = 1;
/** Deceleration a follower plans for when the leader brakes as hard as it can. */
const FOLLOW_DECEL = 6;
/** Follower brake gain per metre of squeeze inside the following gap. */
const FOLLOW_GAIN = 2;
const ACCEL = 3.5;
const BRAKE = 12;
const SPAWN_GAP = 8;
/** Nothing spawns this close to a junction centre. */
const JUNCTION_CLEAR = 9;
const BUS_SPEED = 9;
const BUS_DWELL = 3;
const BUS_COMFORT_DECEL = 3;
const BUS_TINTS = [0xf2c94c, 0x3b7dd8] as const;
/** A vehicle held up this long ignores junction rights briefly so a gridlock always dissolves. */
const STUCK_AFTER = 25;
const STUCK_RELEASE = 2;
/** Emergency vehicles outrank anyone who has been waiting less than this many seconds. */
const EMERGENCY_PRIORITY = 100;

const PATROL_SPEED = 9;
const RESPONDING_SPEED = 13;
const AMBULANCE_SPEED = 12;
const FIRE_TRUCK_SPEED = 10;
/** Seconds the fire truck stays at the station between runs round the ring. */
const FIRE_TRUCK_WAIT: readonly [number, number] = [35, 70];
const FIRE_TRUCK_FIRST_RUN = 6;

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

/** A vehicle that leaves the station, drives one lap and goes back out of sight. */
interface Sortie {
	wait: number;
	lapLeft: number;
	next: number;
	readonly loops: readonly Polyline[];
	readonly waitRange: readonly [number, number];
}

interface VehicleSpec {
	id: number;
	pool: Pool;
	index: number;
	line: Polyline;
	s: number;
	cruise: number;
	halfLen: number;
	stops?: StopCursor;
	emergency?: boolean;
	sortie?: Sortie;
}

class Vehicle implements Traveller {
	v = 0;
	dwell = 0;
	stuck = 0;
	ignore = 0;
	active = true;
	readonly pos = new Vector3();
	readonly dir = new Vector3();
	yaw = 0;
	readonly id: number;
	readonly pool: Pool;
	readonly index: number;
	readonly cruise: number;
	readonly halfLen: number;
	readonly stops: StopCursor | null;
	readonly sortie: Sortie | null;
	readonly priority: number;
	line: Polyline;
	s: number;
	inside: Zone | null = null;
	pending: Zone | null = null;
	pendDist = Number.POSITIVE_INFINITY;
	committed = false;
	wait = 0;
	zoneLimit = Number.POSITIVE_INFINITY;

	constructor(spec: VehicleSpec) {
		this.id = spec.id;
		this.pool = spec.pool;
		this.index = spec.index;
		this.line = spec.line;
		this.s = spec.s;
		this.cruise = spec.cruise;
		this.halfLen = spec.halfLen;
		this.stops = spec.stops ?? null;
		this.sortie = spec.sortie ?? null;
		this.priority = spec.emergency ? EMERGENCY_PRIORITY : 0;
		this.refresh();
		this.yaw = Math.atan2(this.dir.x, this.dir.z);
	}

	refresh(): void {
		this.line.pointAt(this.s, this.pos);
		this.line.tangentAt(this.s, this.dir);
	}
}

/** First arc length at or after `s0` (within one lap) clear of active vehicles and junction boxes, or null. */
function findSpot(
	line: Polyline,
	s0: number,
	vehicles: readonly Vehicle[],
	scratch: Vector3,
): number | null {
	for (let step = 0; step < line.length; step++) {
		const s = s0 + step;
		line.pointAt(s, scratch);
		if (
			JUNCTIONS.every(
				(j) => Math.hypot(j.x - scratch.x, j.z - scratch.z) >= JUNCTION_CLEAR,
			) &&
			vehicles.every((v) => !v.active || v.pos.distanceTo(scratch) >= SPAWN_GAP)
		)
			return s;
	}
	return null;
}

/** Highest speed `a` may drive while `b` is `dist` metres ahead (centre to centre) and can brake as hard as it likes. */
function follow(a: Vehicle, b: Vehicle, dist: number): number {
	const gap = dist - (a.halfLen + b.halfLen + GAP);
	return gap > 0
		? Math.sqrt(b.v * b.v + 2 * FOLLOW_DECEL * gap)
		: Math.max(0, b.v + FOLLOW_GAIN * gap);
}

class RoadTraffic implements Agent {
	private readonly scratch = new Vector3();

	constructor(
		private readonly vehicles: readonly Vehicle[],
		private readonly pools: readonly Pool[],
		private readonly junctions: JunctionControl,
		private readonly rnd: Rng,
	) {}

	update(dt: number): void {
		this.junctions.update(this.vehicles, dt);
		for (const a of this.vehicles) {
			if (a.active) this.drive(a, dt);
			else this.dispatch(a, dt);
		}
		const k = 1 - Math.exp(-dt * 12);
		for (const a of this.vehicles) {
			if (!a.active) continue;
			a.refresh();
			a.yaw = approachAngle(a.yaw, Math.atan2(a.dir.x, a.dir.z), k);
			a.pool.write(a.index, a.pos, a.yaw);
		}
		for (const p of this.pools) p.commit();
	}

	/** Sends a waiting sortie vehicle out as soon as there is a gap on its route. */
	private dispatch(a: Vehicle, dt: number): void {
		const sortie = a.sortie;
		if (!sortie) return;
		sortie.wait -= dt;
		if (sortie.wait > 0) return;
		const line = sortie.loops[sortie.next % sortie.loops.length] as Polyline;
		const s = findSpot(
			line,
			this.rnd() * line.length,
			this.vehicles,
			this.scratch,
		);
		if (s === null) return;
		sortie.next += 1;
		sortie.lapLeft = line.length;
		a.line = line;
		a.s = s;
		a.v = a.cruise * 0.5;
		a.stuck = 0;
		a.ignore = 0;
		a.committed = false;
		a.wait = 0;
		a.active = true;
		a.refresh();
		a.yaw = Math.atan2(a.dir.x, a.dir.z);
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
		limit = Math.min(limit, a.zoneLimit, this.blockLimit(a));

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

		const sortie = a.sortie;
		if (sortie) {
			sortie.lapLeft -= ds;
			if (sortie.lapLeft <= 0) {
				a.active = false;
				a.v = 0;
				a.pool.hide(a.index);
				sortie.wait = this.rnd.range(sortie.waitRange[0], sortie.waitRange[1]);
			}
		}
	}

	/** Highest speed `a` may drive without closing on whatever is in front of it. */
	private blockLimit(a: Vehicle): number {
		let limit = Number.POSITIVE_INFINITY;
		for (const b of this.vehicles) {
			if (b === a || !b.active) continue;
			if (b.line === a.line) {
				const n = a.line.length;
				const ahead = (((b.s - a.s) % n) + n) % n;
				if (ahead < LOOKAHEAD) limit = Math.min(limit, follow(a, b, ahead));
				continue;
			}
			const dx = b.pos.x - a.pos.x;
			const dz = b.pos.z - a.pos.z;
			const along = dx * a.dir.x + dz * a.dir.z;
			if (along <= 0 || along > LOOKAHEAD) continue;
			const lateral = Math.abs(dx * a.dir.z - dz * a.dir.x);
			const heading = a.dir.x * b.dir.x + a.dir.z * b.dir.z;
			if (heading > PARALLEL) {
				if (lateral > PARALLEL_CLEARANCE + along * PARALLEL_SPREAD) continue;
				limit = Math.min(limit, follow(a, b, Math.hypot(dx, dz)));
			} else if (
				heading >= OPPOSITE &&
				lateral < NOSE_CLEARANCE &&
				along < a.halfLen + b.halfLen + NOSE_GAP
			)
				limit = 0;
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

/** Routes of the emergency fleet: responders first so a halved fleet still has both kinds. */
const POLICE_ROUTES: readonly { line: Polyline; speed: number }[] = [
	{ line: RING_CCW, speed: RESPONDING_SPEED },
	{ line: RING_CW, speed: PATROL_SPEED },
	{ line: INNER_CCW, speed: RESPONDING_SPEED },
	{ line: LOOP_NW, speed: PATROL_SPEED },
];
const AMBULANCE_ROUTES: readonly Polyline[] = [RING_CW, RING_CCW];

export function createTraffic(ctx: BuildContext): void {
	const { rng } = ctx;
	const rnd = mulberry32(Math.floor(rng() * 0x100000000));
	const scratch = new Vector3();
	const vehicles: Vehicle[] = [];

	const nPolice = scaled(4, ctx.density);
	const policePool = new Pool(policeCar(), MAT_INSTANCED, nPolice, {
		shadow: true,
	});
	for (let j = 0; j < nPolice; j++) {
		const route = POLICE_ROUTES[j % POLICE_ROUTES.length] as {
			line: Polyline;
			speed: number;
		};
		const s0 = ((j + 0.5) / nPolice) * route.line.length;
		vehicles.push(
			new Vehicle({
				id: vehicles.length,
				pool: policePool,
				index: j,
				line: route.line,
				s: findSpot(route.line, s0, vehicles, scratch) ?? s0,
				cruise: route.speed * rng.range(0.95, 1.05),
				halfLen: POLICE_HALF_LEN,
				emergency: true,
			}),
		);
	}

	const nAmbulances = scaled(2, ctx.density);
	const ambulancePool = new Pool(ambulance(), MAT_INSTANCED, nAmbulances, {
		shadow: true,
	});
	for (let j = 0; j < nAmbulances; j++) {
		const line = AMBULANCE_ROUTES[j % AMBULANCE_ROUTES.length] as Polyline;
		const s0 = (0.3 + 0.3 * j) * line.length;
		vehicles.push(
			new Vehicle({
				id: vehicles.length,
				pool: ambulancePool,
				index: j,
				line,
				s: findSpot(line, s0, vehicles, scratch) ?? s0,
				cruise: AMBULANCE_SPEED * rng.range(0.95, 1.05),
				halfLen: AMBULANCE_HALF_LEN,
				emergency: true,
			}),
		);
	}

	const firePool = new Pool(fireTruck(), MAT_INSTANCED, 1, { shadow: true });
	const fireTruckVehicle = new Vehicle({
		id: vehicles.length,
		pool: firePool,
		index: 0,
		line: RING_CCW,
		s: 0,
		cruise: FIRE_TRUCK_SPEED,
		halfLen: FIRE_TRUCK_HALF_LEN,
		emergency: true,
		sortie: {
			wait: FIRE_TRUCK_FIRST_RUN,
			lapLeft: 0,
			next: 0,
			loops: [RING_CCW, RING_CW],
			waitRange: FIRE_TRUCK_WAIT,
		},
	});
	fireTruckVehicle.active = false;
	firePool.hide(0);
	vehicles.push(fireTruckVehicle);

	const nBuses = scaled(6, ctx.density);
	const busPool = new Pool(bus(), MAT_INSTANCED, nBuses, { shadow: true });
	const perDirection = Math.ceil(nBuses / 2);
	for (let j = 0; j < nBuses; j++) {
		const reverse = j % 2 === 1;
		const line = reverse ? BUS_RING_REVERSE : BUS_RING;
		const slot = Math.floor(j / 2) + (reverse ? 0.5 : 0);
		const s0 = (slot / perDirection) * line.length;
		const s = findSpot(line, s0, vehicles, scratch) ?? s0;
		busPool.color(j, BUS_TINTS[j % BUS_TINTS.length] as number);
		vehicles.push(
			new Vehicle({
				id: vehicles.length,
				pool: busPool,
				index: j,
				line,
				s,
				cruise: BUS_SPEED,
				halfLen: BUS_HALF_LEN,
				stops: new StopCursor(
					reverse ? BUS_STOPS_CCW : BUS_STOPS_CW,
					line.length,
					s,
				),
			}),
		);
	}

	const nCars = scaled(110, ctx.density);
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
			carPool.color(carIndex, rng.pick(CARS));
			const s = findSpot(line, s0, vehicles, scratch);
			if (s === null) carPool.hide(carIndex);
			else
				vehicles.push(
					new Vehicle({
						id: vehicles.length,
						pool: carPool,
						index: carIndex,
						line,
						s,
						cruise: rng.range(8, 11),
						halfLen: CAR_HALF_LEN,
					}),
				);
			carIndex += 1;
		}
	}

	const pools = [
		policePool,
		ambulancePool,
		firePool,
		busPool,
		carPool,
	] as const;
	ctx.group.add(...pools.map((p) => p.mesh));
	ctx.agents.push(
		new RoadTraffic(vehicles, pools, new JunctionControl(CAR_LOOPS), rnd),
	);

	if (scaled(1, ctx.density) > 0) {
		const tramPool = new Pool(tram(), MAT_INSTANCED, TRAM_CARRIAGES, {
			shadow: true,
		});
		ctx.group.add(tramPool.mesh);
		ctx.agents.push(new TramAgent(0, tramPool));
	}

	createSignals(ctx);
}
