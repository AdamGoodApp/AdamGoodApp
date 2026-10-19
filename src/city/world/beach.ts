import {
	BoxGeometry,
	BufferGeometry,
	Float32BufferAttribute,
	Mesh,
	Vector3,
} from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { box, cone, cyl, paint, paintBy, place, prism } from "../geometry";
import {
	BRIGHTS,
	darken,
	FOAM,
	PAVEMENT,
	ROCK,
	SAND,
	SHIRTS,
} from "../palette";
import { lamp, palm, personLying } from "../prefabs";
import type { Agent } from "../sim/agent";
import { createBoats } from "../sim/boats";
import { Polyline } from "../sim/path";
import type { BuildContext } from "./context";
import { CELL_Y, LAND_HALF, SIDEWALK_Y } from "./layout";
import { tintWhite } from "./tint";

const PROM_Z = 36.5;
const PROM_X = -36.5;
const PROM_W = 4;
/** Beach cell interior between the ring sidewalk (x = -82.5) and avenue sidewalk (x = -34.5). */
const BEACH_X0 = -82.5;
const BEACH_X1 = -34.5;
const BEACH_Z1 = 82.5;

const PIER_Z = 70;
const PIER_TOP = 1.2;
const PIER_WOOD = 0x9c7b55;
const PIER_RAIL = 0xf2efe6;

const ISLET = { x: -124, z: PIER_Z };

const SHORE_LEN = 7;
const SHORE_DROP = 0.7;
const FOAM_NEAR = 2.9;
const FOAM_FAR = 3.5;

type Point = [number, number, number];

/** Planar quad a-b-c-d with its triangles wound to face up. */
function slope(
	hex: number,
	a: Point,
	b: Point,
	c: Point,
	d: Point,
): BufferGeometry {
	const normalY = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
	const order = normalY >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
	const geo = new BufferGeometry();
	geo.setAttribute("position", new Float32BufferAttribute(order.flat(), 3));
	return paint(geo, hex);
}

class BeaconAgent implements Agent {
	constructor(private readonly beam: Mesh) {}

	update(dt: number): void {
		this.beam.rotation.y += 1.2 * dt;
	}
}

function buildShore(ctx: BuildContext): void {
	const s = ctx.statics;
	const edge = LAND_HALF;
	const far = edge + SHORE_LEN;
	const foamY = (d: number): number => -(SHORE_DROP / SHORE_LEN) * d + 0.015;

	// Sand ramps along the beach's west edge and the whole south edge, mitred at the corner.
	s.push(
		slope(
			SAND,
			[-edge, 0, 33],
			[-far, -SHORE_DROP, 33],
			[-far, -SHORE_DROP, far],
			[-edge, 0, edge],
		),
		slope(
			SAND,
			[-edge, 0, edge],
			[edge, 0, edge],
			[edge, -SHORE_DROP, far],
			[-far, -SHORE_DROP, far],
		),
		slope(
			FOAM,
			[-edge - FOAM_NEAR, foamY(FOAM_NEAR), 33],
			[-edge - FOAM_FAR, foamY(FOAM_FAR), 33],
			[-edge - FOAM_FAR, foamY(FOAM_FAR), edge + FOAM_FAR],
			[-edge - FOAM_NEAR, foamY(FOAM_NEAR), edge + FOAM_NEAR],
		),
		slope(
			FOAM,
			[-edge - FOAM_NEAR, foamY(FOAM_NEAR), edge + FOAM_NEAR],
			[edge, foamY(FOAM_NEAR), edge + FOAM_NEAR],
			[edge, foamY(FOAM_FAR), edge + FOAM_FAR],
			[-edge - FOAM_FAR, foamY(FOAM_FAR), edge + FOAM_FAR],
		),
	);

	// Rocky two-step bank on the other edges so the island stands in the sea.
	const step = darken(ROCK, 0.85);
	const reach = edge + 1.5;
	const westLen = reach + 33;
	const westMid = (-reach + 33) / 2;
	s.push(
		box(2 * reach, 0.8, 1.5, ROCK, 0, -0.8, -edge - 0.75),
		box(2 * reach + 2, 0.5, 1, step, 0, -0.6, -edge - 2),
		box(1.5, 0.8, 2 * reach, ROCK, edge + 0.75, -0.8, 0),
		box(1, 0.5, 2 * reach + 2, step, edge + 2, -0.6, 0),
		box(1.5, 0.8, westLen, ROCK, -edge - 0.75, -0.8, westMid),
		box(1, 0.5, westLen + 1, step, -edge - 2, -0.6, westMid - 0.5),
	);
}

function buildPromenade(ctx: BuildContext): void {
	const s = ctx.statics;
	s.push(
		box(
			BEACH_X1 - BEACH_X0,
			0.08,
			PROM_W,
			PAVEMENT,
			(BEACH_X0 + BEACH_X1) / 2,
			CELL_Y,
			PROM_Z,
		),
		box(
			PROM_W,
			0.08,
			BEACH_Z1 - (PROM_Z + PROM_W / 2),
			PAVEMENT,
			PROM_X,
			CELL_Y,
			(PROM_Z + PROM_W / 2 + BEACH_Z1) / 2,
		),
	);
	const y = SIDEWALK_Y;
	ctx.sidewalks.push(
		new Polyline(
			[new Vector3(BEACH_X0, y, PROM_Z), new Vector3(PROM_X, y, PROM_Z)],
			false,
		),
		new Polyline(
			[
				new Vector3(PROM_X, y, PROM_Z),
				new Vector3(PROM_X, y, 83.25),
				new Vector3(-33.75, y, 83.25),
			],
			false,
		),
	);

	for (let i = 0; i < 5; i++) {
		const along = -79 + i * 8;
		s.push(
			place(palm(), {
				x: along,
				y: CELL_Y,
				z: PROM_Z + 3,
				ry: ctx.rng.range(0, Math.PI * 2),
			}),
		);
		s.push(
			place(palm(), {
				x: PROM_X - 3,
				y: CELL_Y,
				z: 46 + i * 8,
				ry: ctx.rng.range(0, Math.PI * 2),
			}),
		);
	}
}

function buildSunbathers(ctx: BuildContext): void {
	const { rng, statics } = ctx;
	const spots: { x: number; z: number }[] = [];
	while (spots.length < 14) {
		const x = rng.range(-80, -45);
		const z = rng.range(50, 80);
		if (spots.every((p) => Math.hypot(p.x - x, p.z - z) >= 3))
			spots.push({ x, z });
	}

	spots.forEach(({ x, z }, i) => {
		const ry = rng.range(0, Math.PI * 2);
		statics.push(
			place(box(1, 0.05, 2, rng.pick(BRIGHTS)), { x, y: CELL_Y, z, ry }),
		);
		if (i < 10) {
			const body = tintWhite(personLying(), rng.pick(SHIRTS));
			statics.push(place(body, { x, y: CELL_Y + 0.05, z, ry }));
		}
		// Parasol pole stands beside the towel's head, canopy overhanging it.
		const px = x + 0.9 * Math.cos(ry) - 0.5 * Math.sin(ry);
		const pz = z - 0.9 * Math.sin(ry) - 0.5 * Math.cos(ry);
		statics.push(
			cyl(0.04, 0.04, 1.8, 6, 0xeeeeee, px, CELL_Y, pz),
			cone(1.2, 0.5, 8, rng.pick(BRIGHTS), px, CELL_Y + 1.8, pz),
		);
	});
}

function buildBar(ctx: BuildContext): void {
	const s = ctx.statics;
	const x = -50;
	const z = 45;
	s.push(
		box(5, 3, 4, 0xd9a066, x, CELL_Y, z),
		prism(6, 1.5, 5, 0x8a5a3c, x, CELL_Y + 3, z),
		box(1.2, 2.1, 0.1, 0x3a2f2a, x - 1.4, CELL_Y, z + 2.05),
		box(2, 1, 0.1, 0x2b3a4a, x + 1, CELL_Y + 1.2, z + 2.05),
		box(4.6, 0.15, 1.4, 0xe8463c, x, CELL_Y + 2.4, z + 2.7),
		box(0.1, 2.4, 0.1, 0xf2efe6, x - 2.2, CELL_Y, z + 3.3),
		box(0.1, 2.4, 0.1, 0xf2efe6, x + 2.2, CELL_Y, z + 3.3),
	);
}

function buildPier(ctx: BuildContext): void {
	const s = ctx.statics;
	const rampRun = 8;
	const flatStart = -LAND_HALF - rampRun;
	const flatEnd = -119;
	const flatLen = flatStart - flatEnd;
	const flatMid = (flatStart + flatEnd) / 2;
	const angle = Math.atan2(PIER_TOP - 0.2, rampRun);
	const rampLen = Math.hypot(rampRun, PIER_TOP - 0.2);

	// Ramp from the island edge (deck top 0.2) up to the main deck (top 1.2).
	s.push(
		place(box(rampLen, 0.3, 4, PIER_WOOD, 0, -0.3, 0), {
			rz: -angle,
			x: -LAND_HALF - rampRun / 2,
			y: (0.2 + PIER_TOP) / 2,
			z: PIER_Z,
		}),
		box(flatLen, 0.3, 4, PIER_WOOD, flatMid, PIER_TOP - 0.3, PIER_Z),
	);

	for (const side of [-1, 1]) {
		const z = PIER_Z + side * 1.85;
		s.push(
			box(flatLen, 0.08, 0.1, PIER_RAIL, flatMid, PIER_TOP + 0.85, z),
			box(flatLen, 0.06, 0.06, PIER_RAIL, flatMid, PIER_TOP + 0.45, z),
		);
		for (let x = flatStart - 0.5; x >= flatEnd + 0.5; x -= 4) {
			s.push(
				cyl(
					0.25,
					0.25,
					PIER_TOP - 0.3 + 2,
					6,
					0x6b4f33,
					x,
					-2,
					PIER_Z + side * 1.7,
				),
				box(0.1, 0.9, 0.1, PIER_RAIL, x, PIER_TOP, z),
			);
		}
	}
	s.push(
		place(lamp(), { x: flatEnd + 0.8, y: PIER_TOP, z: PIER_Z - 1.6 }),
		place(lamp(), { x: flatEnd + 0.8, y: PIER_TOP, z: PIER_Z + 1.6 }),
	);
}

function buildLighthouse(ctx: BuildContext): void {
	const s = ctx.statics;
	const { x, z } = ISLET;
	const rockTop = 1;
	const height = 8;
	const bands = 6;

	s.push(
		cyl(3, 3.5, 1.5, 8, ROCK, x, -0.5, z),
		cyl(1.5, 2, 1, 6, darken(ROCK, 0.9), x + 2.5, -0.5, z + 2),
	);
	const tower = cyl(1.2, 1.4, height, 8, 0xffffff, x, rockTop, z);
	s.push(
		paintBy(tower, (_x, y) =>
			Math.floor(((y - rockTop) / height) * bands) % 2 === 0
				? 0xd8453a
				: 0xffffff,
		),
	);
	const top = rockTop + height;
	s.push(
		box(2.4, 0.3, 2.4, 0x333333, x, top, z),
		box(1.6, 1.2, 1.6, 0xfff1a8, x, top + 0.3, z),
		cone(1.4, 1.1, 8, 0xd8453a, x, top + 1.5, z),
	);

	const beam = new Mesh(
		new BoxGeometry(14, 0.3, 0.6),
		new MeshBasicNodeMaterial({
			color: 0xfff1a8,
			transparent: true,
			opacity: 0.45,
			depthWrite: false,
		}),
	);
	beam.position.set(x, top + 0.9, z);
	ctx.group.add(beam);
	ctx.agents.push(new BeaconAgent(beam));
}

/**
 * Beach cell, island shoreline, pier + lighthouse and the boats that sail around them.
 * Also creates the sailboat and ferry pools (`createBoats`), so do not call that separately.
 */
export function buildBeach(ctx: BuildContext): void {
	buildShore(ctx);
	buildPromenade(ctx);
	buildSunbathers(ctx);
	buildBar(ctx);
	buildPier(ctx);
	buildLighthouse(ctx);
	createBoats(ctx);
}
