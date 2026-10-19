import { box, cone, cyl, place, prism } from "../geometry";
import { APRON, GLASS_DARK, GRASS, RUNWAY, WHITE } from "../palette";
import { plane } from "../prefabs";
import { createPlanes } from "../sim/planes";
import type { BuildContext } from "./context";
import { CELL_Y } from "./layout";

const RUNWAY_X = 58;
const RUNWAY_Z = -59;
const RUNWAY_LEN = 46;
const RUNWAY_TOP = CELL_Y + 0.06;

export function buildAirport(ctx: BuildContext): void {
	const s = ctx.statics;

	// Grass verges: west of the runway and between runway and taxiway.
	s.push(
		box(18, 0.04, 49, GRASS, 43.5, CELL_Y, RUNWAY_Z),
		box(4, 0.04, 49, GRASS, 64, CELL_Y, RUNWAY_Z),
		box(8, 0.04, 8, GRASS, 80, CELL_Y, -80),
	);

	// Runway, centreline dashes, threshold stripes.
	s.push(box(8, 0.06, RUNWAY_LEN, RUNWAY, RUNWAY_X, CELL_Y, RUNWAY_Z));
	for (
		let z = RUNWAY_Z - RUNWAY_LEN / 2 + 4;
		z < RUNWAY_Z + RUNWAY_LEN / 2 - 2;
		z += 4
	) {
		s.push(box(0.3, 0.02, 2, WHITE, RUNWAY_X, RUNWAY_TOP, z));
	}
	for (const z of [
		RUNWAY_Z - RUNWAY_LEN / 2 + 2.5,
		RUNWAY_Z + RUNWAY_LEN / 2 - 2.5,
	]) {
		for (let i = 0; i < 6; i++) {
			s.push(
				box(0.6, 0.02, 4, WHITE, RUNWAY_X - 3.3 + i * 1.32, RUNWAY_TOP, z),
			);
		}
	}

	// Taxiway, its connectors to the runway, and the apron.
	s.push(
		box(4, 0.06, RUNWAY_LEN, 0x5a5d62, 68, CELL_Y, RUNWAY_Z),
		box(4, 0.06, 4, 0x5a5d62, 63, CELL_Y, -75),
		box(4, 0.06, 4, 0x5a5d62, 63, CELL_Y, -43),
		box(13, 0.06, 20, APRON, 77, CELL_Y, -60),
	);

	// Terminal with a glass stripe, control tower, hangar.
	s.push(
		box(12, 5, 5, 0xe8eaee, 77, CELL_Y, -60),
		box(12.1, 1.3, 5.1, GLASS_DARK, 77, CELL_Y + 1.6, -60),
		box(12.4, 0.4, 5.4, 0xb8bcc2, 77, CELL_Y + 5, -60),
		cyl(1.5, 1.8, 12, 8, 0xd8dde2, 80, CELL_Y, -72),
		box(4, 2, 4, 0x6d7f93, 80, CELL_Y + 12, -72),
		box(4.6, 0.4, 4.6, 0xd8dde2, 80, CELL_Y + 14, -72),
		box(10, 5, 8, 0xb8bcc2, 76, CELL_Y, -44),
		prism(10.6, 2, 8.6, 0x9fa3a8, 76, CELL_Y + 5, -44),
		box(6, 4, 0.1, 0x6d7f93, 76, CELL_Y, -39.95),
	);

	// Windsock.
	s.push(
		cyl(0.06, 0.06, 4, 6, 0x888888, 50, CELL_Y, -40),
		place(cone(0.3, 1.2, 6, 0xf28c28), {
			x: 50,
			y: CELL_Y + 3.7,
			z: -40,
			rz: -Math.PI / 2,
		}),
	);

	// One parked plane on the apron, nose toward the terminal.
	s.push(place(plane(), { x: 76, y: CELL_Y + 0.4, z: -53, ry: Math.PI }));

	createPlanes(ctx);
}
