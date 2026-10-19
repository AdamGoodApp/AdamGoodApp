import { Vector3 } from "three";
import type { Polyline } from "./path";
import { JUNCTIONS } from "./signals";

/** Paths closer to a junction centre than this are inside its box. */
const ZONE_RADIUS = 6.5;
const ZONE_STEP = 0.5;
/** Two routes that enter a box at the same spot never conflict: they only follow or diverge. */
const SAME_ENTRY = 0.8;
/** Routes that pass closer than this inside a box (lanes are 3 m apart) cross or merge. */
const ZONE_CONFLICT = 2.9;
/** Vehicles ask for a box this far before it. */
const REQUEST_DIST = 26;
/** A stopped vehicle's front bumper waits this far before the box. */
const STOP_SHORT = 1.2;
const COMFORT_DECEL = 5;
const MAX_DECEL = 9;
/** A waiting vehicle only holds up crossing traffic once it is this close to the box. */
const OUTRANK_RANGE = 14;
/** A box is not entered while the road just beyond its exit is jammed. */
const EXIT_CHECK = 6;
const EXIT_RADIUS = 5;
const EXIT_SLOW = 2;
const EXIT_LANE = 1.8;
/** Seconds a vehicle waits at a line before queue order and a jammed exit stop holding it back. */
const SOFT_PATIENCE = 6;

/** Stretch of a route inside one junction's box. */
export interface Zone {
	id: number;
	junction: number;
	line: Polyline;
	enter: number;
	len: number;
}

/** What the controller needs from a vehicle; it owns the `inside`…`zoneLimit` fields. */
export interface Traveller {
	readonly id: number;
	readonly halfLen: number;
	/** Added to waiting time when ranking who goes first (emergency vehicles). */
	readonly priority: number;
	readonly pos: Vector3;
	readonly dir: Vector3;
	line: Polyline;
	s: number;
	v: number;
	ignore: number;
	active: boolean;
	inside: Zone | null;
	pending: Zone | null;
	pendDist: number;
	committed: boolean;
	wait: number;
	/** Speed that lets the vehicle stop before a box it has to wait for. */
	zoneLimit: number;
}

function mod(a: number, n: number): number {
	return ((a % n) + n) % n;
}

/**
 * Junction boxes as critical sections. A vehicle may enter a box only when no
 * vehicle inside (or already committed to it) is on a conflicting route and no
 * conflicting vehicle that has waited longer is at the line. Vehicles on the
 * same entry lane never block each other, so platoons flow through together.
 */
export class JunctionControl {
	private readonly zonesByLine = new Map<Polyline, Zone[]>();
	private readonly conflicts: Uint8Array;
	private readonly zoneCount: number;
	private readonly insiders: Traveller[][] = JUNCTIONS.map(() => []);
	private readonly requesters: Traveller[][] = JUNCTIONS.map(() => []);
	private readonly probe = new Vector3();
	private readonly heading = new Vector3();
	private vehicles: readonly Traveller[] = [];

	constructor(lines: readonly Polyline[]) {
		const all: Zone[] = [];
		const a = new Vector3();
		for (const line of lines) {
			const zones: Zone[] = [];
			const n = Math.ceil(line.length / ZONE_STEP);
			for (let j = 0; j < JUNCTIONS.length; j++) {
				const jn = JUNCTIONS[j] as (typeof JUNCTIONS)[number];
				const inside: boolean[] = [];
				for (let i = 0; i < n; i++) {
					line.pointAt(i * ZONE_STEP, a);
					inside.push(Math.hypot(a.x - jn.x, a.z - jn.z) < ZONE_RADIUS);
				}
				for (let i = 0; i < n; i++) {
					if (!inside[i] || inside[(i - 1 + n) % n]) continue;
					let count = 0;
					while (inside[(i + count) % n] && count < n) count += 1;
					const zone = {
						id: all.length,
						junction: j,
						line,
						enter: i * ZONE_STEP,
						len: count * ZONE_STEP,
					};
					zones.push(zone);
					all.push(zone);
				}
			}
			this.zonesByLine.set(line, zones);
		}

		this.zoneCount = all.length;
		this.conflicts = new Uint8Array(all.length * all.length);
		for (const z1 of all) {
			for (const z2 of all) {
				if (z1.id >= z2.id || z1.junction !== z2.junction) continue;
				if (z1.line === z2.line || !this.crosses(z1, z2)) continue;
				this.conflicts[z1.id * this.zoneCount + z2.id] = 1;
				this.conflicts[z2.id * this.zoneCount + z1.id] = 1;
			}
		}
	}

	private crosses(z1: Zone, z2: Zone): boolean {
		const p = new Vector3();
		const q = new Vector3();
		z1.line.pointAt(z1.enter, p);
		z2.line.pointAt(z2.enter, q);
		if (Math.hypot(p.x - q.x, p.z - q.z) < SAME_ENTRY) return false;
		for (let s1 = 0; s1 <= z1.len; s1 += 1) {
			z1.line.pointAt(z1.enter + s1, p);
			for (let s2 = 0; s2 <= z2.len; s2 += 1) {
				z2.line.pointAt(z2.enter + s2, q);
				if (Math.hypot(p.x - q.x, p.z - q.z) < ZONE_CONFLICT) return true;
			}
		}
		return false;
	}

	private conflict(a: Zone, b: Zone): boolean {
		return this.conflicts[a.id * this.zoneCount + b.id] === 1;
	}

	update(vehicles: readonly Traveller[], dt: number): void {
		this.vehicles = vehicles;
		for (const list of this.insiders) list.length = 0;
		for (const list of this.requesters) list.length = 0;
		for (const a of vehicles) if (a.active) this.locate(a);
		for (let j = 0; j < this.requesters.length; j++) {
			for (const a of this.requesters[j] as Traveller[])
				this.arbitrate(a, j, dt);
		}
	}

	private locate(a: Traveller): void {
		a.inside = null;
		a.pending = null;
		a.pendDist = Number.POSITIVE_INFINITY;
		a.zoneLimit = Number.POSITIVE_INFINITY;
		const len = a.line.length;
		for (const z of this.zonesByLine.get(a.line) ?? []) {
			if (mod(a.s - z.enter, len) < z.len) {
				a.inside = z;
				break;
			}
			const d = mod(z.enter - a.s, len);
			if (d < a.pendDist) {
				a.pendDist = d;
				a.pending = z;
			}
		}
		if (a.inside) {
			(this.insiders[a.inside.junction] as Traveller[]).push(a);
			a.pending = null;
			a.committed = false;
			a.wait = 0;
		} else if (a.pending && a.pendDist <= REQUEST_DIST) {
			(this.requesters[a.pending.junction] as Traveller[]).push(a);
		} else {
			a.pending = null;
			a.committed = false;
			a.wait = 0;
		}
	}

	private arbitrate(a: Traveller, j: number, dt: number): void {
		const zone = a.pending as Zone;
		if (a.ignore > 0) a.committed = true;
		if (a.committed) return;

		const stopDist = a.halfLen + STOP_SHORT;
		if (this.blocked(a, zone, j)) {
			if ((a.v * a.v) / (2 * MAX_DECEL) > a.pendDist - a.halfLen) {
				a.committed = true;
				return;
			}
			a.zoneLimit = Math.sqrt(
				2 * COMFORT_DECEL * Math.max(0, a.pendDist - stopDist),
			);
			if (a.v < 1) a.wait += dt;
			return;
		}
		if (a.pendDist <= (a.v * a.v) / (2 * COMFORT_DECEL) + stopDist + 0.3)
			a.committed = true;
	}

	/** Hard: a conflicting vehicle is in (or committed to) the box. Soft: queue order and a jammed exit, which stop mattering after SOFT_PATIENCE seconds. */
	private blocked(a: Traveller, zone: Zone, j: number): boolean {
		for (const b of this.insiders[j] as Traveller[]) {
			if (this.conflict(zone, b.inside as Zone)) return true;
		}
		const patient = a.wait > SOFT_PATIENCE;
		for (const r of this.requesters[j] as Traveller[]) {
			if (r === a || !this.conflict(zone, r.pending as Zone)) continue;
			if (r.committed) return true;
			if (!patient && r.pendDist <= OUTRANK_RANGE && this.outranks(r, a))
				return true;
		}
		return !patient && !this.exitClear(a, zone);
	}

	private outranks(r: Traveller, a: Traveller): boolean {
		const rp = r.wait + r.priority;
		const ap = a.wait + a.priority;
		return rp > ap || (rp === ap && r.id < a.id);
	}

	private exitClear(a: Traveller, zone: Zone): boolean {
		const at = zone.enter + zone.len + EXIT_CHECK;
		a.line.pointAt(at, this.probe);
		a.line.tangentAt(at, this.heading);
		for (const b of this.vehicles) {
			if (b === a || !b.active || b.v >= EXIT_SLOW) continue;
			const dx = b.pos.x - this.probe.x;
			const dz = b.pos.z - this.probe.z;
			if (dx * dx + dz * dz >= EXIT_RADIUS * EXIT_RADIUS) continue;
			const lateral = Math.abs(dx * this.heading.z - dz * this.heading.x);
			const sameWay = b.dir.x * this.heading.x + b.dir.z * this.heading.z > 0;
			if (sameWay && lateral < EXIT_LANE) return false;
		}
		return true;
	}
}
