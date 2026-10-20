import type { BufferGeometry, Group, Vector3 } from "three";
import type { CityEvents } from "../events";
import type { Rng } from "../rng";
import type { Agent } from "../sim/agent";
import type { Polyline } from "../sim/path";

/**
 * Shared state every district builder writes into. Builders run first (in
 * `buildWorld`), then the shared pools (people, traffic) are created
 * from what they registered.
 */
export interface BuildContext {
	readonly rng: Rng;
	/** 1 on desktop, 0.5 on mobile: multiply every agent count by it (`scaled`). */
	readonly density: number;
	/** Painted, non-indexed geometries baked into the single static mesh. */
	readonly statics: BufferGeometry[];
	/** Textured building walls from `facadeBox` (kit/facade.ts), merged into one mesh. */
	readonly facades: BufferGeometry[];
	/** Scene objects that are not part of the static merge (pools, textured meshes, ocean). */
	readonly group: Group;
	readonly agents: Agent[];
	/** Event log, stageable events and landmarks the agent tools read. */
	readonly events: CityEvents;
	/** Pedestrian network: open polylines; endpoints within 2 m are connected. */
	readonly sidewalks: Polyline[];
	/** Door positions residents walk out of. */
	readonly residentialDoors: Vector3[];
	/** Residential sidewalk loop residents stroll along. */
	residentialLoop: Polyline | null;
	/** Closed loop in the park that dog walkers use. */
	parkLoop: Polyline | null;
}
