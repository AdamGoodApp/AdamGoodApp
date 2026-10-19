export type ZoneId =
	| "downtown"
	| "mountains"
	| "rural"
	| "commercial"
	| "beach"
	| "themepark"
	| "residential";

export interface ZoneRect {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}

export interface ZoneDef {
	id: ZoneId;
	district: string;
	topic: string;
	rect: ZoneRect;
	/** World-space point the zone card points at (top of the district). */
	anchor: [number, number, number];
}

/**
 * World axes: +X east, +Z south. The camera looks from (+X, +Y, +Z), so the
 * top of the screen is NW (downtown) and the bottom is SE (suburbs). The
 * centre cell (sign park) and the NE cell (airport) are not interactive.
 */
export const ZONES: readonly ZoneDef[] = [
	{
		id: "downtown",
		district: "Downtown",
		topic: "Experience",
		rect: { minX: -84, maxX: -33, minZ: -84, maxZ: -33 },
		anchor: [-58, 46, -58],
	},
	{
		id: "mountains",
		district: "The Peaks",
		topic: "FATMAP",
		rect: { minX: -27, maxX: 27, minZ: -84, maxZ: -33 },
		anchor: [0, 38, -58],
	},
	{
		id: "rural",
		district: "Farmland",
		topic: "Roots",
		rect: { minX: -84, maxX: -33, minZ: -27, maxZ: 27 },
		anchor: [-58, 14, 0],
	},
	{
		id: "commercial",
		district: "Shop Street",
		topic: "Technical skills",
		rect: { minX: 33, maxX: 84, minZ: -27, maxZ: 27 },
		anchor: [58, 16, 0],
	},
	{
		id: "beach",
		district: "The Beach",
		topic: "About me",
		rect: { minX: -84, maxX: -33, minZ: 33, maxZ: 84 },
		anchor: [-58, 12, 58],
	},
	{
		id: "themepark",
		district: "Fun Park",
		topic: "Open source",
		rect: { minX: -27, maxX: 27, minZ: 33, maxZ: 84 },
		anchor: [0, 24, 58],
	},
	{
		id: "residential",
		district: "Suburbs",
		topic: "Off the clock",
		rect: { minX: 33, maxX: 84, minZ: 33, maxZ: 84 },
		anchor: [58, 12, 58],
	},
];

export const ZONE_BY_ID = Object.fromEntries(
	ZONES.map((z) => [z.id, z]),
) as Record<ZoneId, ZoneDef>;

export function zoneAt(x: number, z: number): ZoneId | null {
	for (const zone of ZONES) {
		const r = zone.rect;
		if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
			return zone.id;
		}
	}
	return null;
}
