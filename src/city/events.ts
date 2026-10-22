import { ZONE_BY_ID, type ZoneId, zoneAt } from "#/data/zones";

/**
 * What the simulation reports to agents (news ticker, narration) and what it
 * lets them stage. Framework-free: sim agents emit, `CityWorld` exposes.
 */

export const CITY_EVENT_KINDS = [
	"fire_flare_up",
	"fire_engine_dispatched",
	"fire_engine_returned",
	"bus_at_stop",
	"helicopter_takeoff",
	"helicopter_landing",
	"festival_started",
	"festival_ended",
	"disaster_started",
	"disaster_ended",
] as const;
export type CityEventKind = (typeof CITY_EVENT_KINDS)[number];

export const STAGE_KINDS = [
	"fire_flare_up",
	"dispatch_fire_engine",
	"launch_helicopter",
	"park_festival",
	"ufo_attack",
	"tornado",
	"black_hole",
	"tsunami",
] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

export interface CityEvent {
	/** Increasing id; pass the last one seen as `since`. */
	id: number;
	/** Simulation time in seconds. */
	t: number;
	kind: CityEventKind;
	/** District the event happened in; null for the centre park and the outskirts. */
	zone: ZoneId | null;
	text: string;
	x: number;
	z: number;
}

export interface Landmark {
	id: string;
	name: string;
	zone: ZoneId | null;
	x: number;
	z: number;
	/** Rough footprint radius for a highlight ring. */
	radius: number;
}

export interface StageResult {
	ok: boolean;
	text: string;
}

/** Runs a staged event; returns why it could not run, or the announcement. */
export type StageHandler = (t: number) => StageResult;

const CAPACITY = 64;

export class CityEvents {
	private readonly ring: CityEvent[] = [];
	private nextId = 1;
	private readonly handlers = new Map<StageKind, StageHandler>();
	private readonly marks = new Map<string, Landmark>();
	/** Simulation time of the last update; staged events are stamped with it. */
	now = 0;
	/** `{where}` in `text` becomes the district's name ("the city" outside the districts). */
	emit(
		kind: CityEventKind,
		text: string,
		x: number,
		z: number,
		t = this.now,
	): void {
		const zone = zoneAt(x, z);
		const where = zone ? ZONE_BY_ID[zone].district : "the city";
		this.ring.push({
			id: this.nextId++,
			t,
			kind,
			zone,
			text: text.replaceAll("{where}", where),
			x,
			z,
		});
		if (this.ring.length > CAPACITY) this.ring.shift();
	}

	/** Events with an id greater than `since`, oldest first, at most `limit`. */
	since(since = 0, limit = CAPACITY): CityEvent[] {
		const out = this.ring.filter((e) => e.id > since);
		return out.slice(Math.max(0, out.length - limit));
	}

	get lastId(): number {
		return this.nextId - 1;
	}

	onStage(kind: StageKind, handler: StageHandler): void {
		this.handlers.set(kind, handler);
	}

	/** Kinds this city can stage (a lite build may lack some). */
	stageKinds(): StageKind[] {
		return STAGE_KINDS.filter((k) => this.handlers.has(k));
	}

	stage(kind: StageKind): StageResult {
		const handler = this.handlers.get(kind);
		if (!handler) return { ok: false, text: `This city cannot stage ${kind}` };
		return handler(this.now);
	}

	landmark(mark: Omit<Landmark, "zone">): void {
		this.marks.set(mark.id, { ...mark, zone: zoneAt(mark.x, mark.z) });
	}

	landmarks(): Landmark[] {
		return [...this.marks.values()];
	}

	getLandmark(id: string): Landmark | undefined {
		return this.marks.get(id);
	}
}
