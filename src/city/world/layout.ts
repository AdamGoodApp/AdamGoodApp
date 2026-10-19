/** Road layout shared by the ground builder and the vehicle routes. */
export const AVENUE = 30;
export const AVENUE_WIDTH = 6;
export const RING = 87;
export const RING_WIDTH = 6;
export const SIDEWALK_WIDTH = 1.5;
export const LAND_HALF = 90;
/** Top of the road surface; vehicles drive at this height. */
export const ROAD_Y = 0.12;
/** Top of the sidewalks; pedestrians walk at this height. */
export const SIDEWALK_Y = 0.18;
/** Top of the district slabs. */
export const CELL_Y = 0.1;
/** Lane offset from a road centreline (right-hand traffic). */
export const LANE_OFFSET = 1.5;
/** The city extends to ±WORLD_HALF beyond the district grid (outskirts fill the screen). */
export const WORLD_HALF = 250;
/**
 * The only sea is south-west of the beach: west of the island edge (x < −LAND_HALF)
 * south of COAST_WEST_Z, and south of the island edge (z > LAND_HALF) west of
 * COAST_SOUTH_X. Everything else is land.
 */
export const COAST_WEST_Z = 25;
export const COAST_SOUTH_X = -25;

export function isSea(x: number, z: number): boolean {
	return (
		(x < -LAND_HALF && z > COAST_WEST_Z) || (z > LAND_HALF && x < COAST_SOUTH_X)
	);
}
/** Mean water level (the land top is y = 0). */
export const WATER_Y = -0.35;
/** Tram loop half-size around the park (inside the avenue sidewalks at ±25.5). */
export const TRAM_HALF = 24;
