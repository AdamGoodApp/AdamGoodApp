import { Box3, type Ray, Vector3 } from "three";
import { ZONES, type ZoneId } from "#/data/zones";

/**
 * Each district is picked as a box from the ground up to its anchor height,
 * so pointing at a tower top selects the tower's district, not the ground
 * behind it. The nearest box along the view ray wins.
 */
const BOXES = ZONES.map((zone) => ({
	id: zone.id,
	box: new Box3(
		new Vector3(zone.rect.minX, 0, zone.rect.minZ),
		new Vector3(zone.rect.maxX, zone.anchor[1], zone.rect.maxZ),
	),
}));

const hit = new Vector3();

export function pickZone(ray: Ray): ZoneId | null {
	let best: ZoneId | null = null;
	let bestDist = Number.POSITIVE_INFINITY;
	for (const { id, box } of BOXES) {
		if (!ray.intersectBox(box, hit)) continue;
		const d = hit.distanceToSquared(ray.origin);
		if (d < bestDist) {
			bestDist = d;
			best = id;
		}
	}
	return best;
}
