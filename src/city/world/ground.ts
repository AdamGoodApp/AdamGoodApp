import { box } from "../geometry";
import { APRON, CONCRETE, GRASS, PARK, PAVEMENT, SAND } from "../palette";
import type { BuildContext } from "./context";
import { CELL_Y } from "./layout";

/** Cell slabs keyed by centre; each cell is 51 m (outer) or 54 m (centre) wide. */
const CELLS: { x: [number, number]; z: [number, number]; color: number }[] = [
	{ x: [-84, -33], z: [-84, -33], color: CONCRETE }, // downtown
	{ x: [-27, 27], z: [-84, -33], color: 0x8fae7a }, // mountains
	{ x: [33, 84], z: [-84, -33], color: APRON }, // arena + hospital
	{ x: [-84, -33], z: [-27, 27], color: GRASS }, // rural
	{ x: [-27, 27], z: [-27, 27], color: PARK }, // park
	{ x: [33, 84], z: [-27, 27], color: PAVEMENT }, // commercial
	{ x: [-84, -33], z: [33, 84], color: SAND }, // beach
	{ x: [-27, 27], z: [33, 84], color: 0xb9d99a }, // theme park
	{ x: [33, 84], z: [33, 84], color: GRASS }, // residential
];

export function buildGround(ctx: BuildContext): void {
	for (const c of CELLS) {
		const w = c.x[1] - c.x[0];
		const d = c.z[1] - c.z[0];
		ctx.statics.push(
			box(
				w,
				CELL_Y,
				d,
				c.color,
				(c.x[0] + c.x[1]) / 2,
				0,
				(c.z[0] + c.z[1]) / 2,
			),
		);
	}
}
