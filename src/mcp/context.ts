import type { CityWorld } from "#/city/world";
import type { ZoneId } from "#/data/zones";

/** The part of the 3D city the in-page tools drive. */
export type CityControls = Pick<
	CityWorld,
	| "focusZone"
	| "setView"
	| "resetView"
	| "getView"
	| "setPaused"
	| "setSpeed"
	| "zoneScreenPoint"
	| "getEvents"
	| "landmarks"
	| "stageKinds"
	| "stageEvent"
	| "highlightSpot"
	| "clearSpot"
	| "getSimulation"
>;

/** What the in-page tools need from the running page. */
export interface CityToolContext {
	/** The live 3D city, or null while loading and on the static fallback. */
	world(): CityControls | null;
	/** Open (or with null, close) a district card; same path as a click. */
	select(id: ZoneId | null): void;
	/** Draw (or with null, clear) the hover ring and label. */
	hover(id: ZoneId | null): void;
}
