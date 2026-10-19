import { Mesh, PlaneGeometry } from "three";
import { color, mix, positionLocal, sin, time, vec3 } from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { box } from "../geometry";
import { darken, WATER_DEEP, WATER_LIGHT } from "../palette";
import type { BuildContext } from "./context";
import { OCEAN_HALF, WATER_Y } from "./layout";

/** Walls reach a hair above the mean water line so the sea reads as a thick tile. */
const WALL_TOP = WATER_Y + 0.15;
const WALL_DEPTH = 3.4;
const WALL_THICKNESS = 0.6;

export function buildOcean(ctx: BuildContext): void {
	// The plane is rotated flat on the mesh, so plane-local z is world up.
	const wave = sin(positionLocal.x.mul(0.25).add(time.mul(1.2)))
		.mul(0.08)
		.add(sin(positionLocal.y.mul(0.18).add(time.mul(0.8))).mul(0.06));
	const shimmer = sin(
		positionLocal.x.mul(0.35).add(positionLocal.y.mul(0.2)).add(time.mul(1.5)),
	)
		.mul(sin(positionLocal.y.mul(0.27).sub(time.mul(0.9))))
		.mul(0.5)
		.add(0.5);

	const material = new MeshStandardNodeMaterial({
		roughness: 0.55,
		metalness: 0,
	});
	material.positionNode = positionLocal.add(vec3(0, 0, wave));
	material.colorNode = mix(
		color(WATER_DEEP),
		color(WATER_LIGHT),
		shimmer.mul(0.3),
	);

	const ocean = new Mesh(
		new PlaneGeometry(OCEAN_HALF * 2, OCEAN_HALF * 2, 128, 128),
		material,
	);
	ocean.rotation.x = -Math.PI / 2;
	ocean.position.y = WATER_Y;
	ocean.receiveShadow = true;
	ctx.group.add(ocean);

	const wall = darken(WATER_DEEP, 0.6);
	const base = WALL_TOP - WALL_DEPTH;
	const span = OCEAN_HALF * 2 + WALL_THICKNESS * 2;
	const centre = OCEAN_HALF + WALL_THICKNESS / 2;
	for (const side of [-1, 1]) {
		ctx.statics.push(
			box(span, WALL_DEPTH, WALL_THICKNESS, wall, 0, base, side * centre),
			box(WALL_THICKNESS, WALL_DEPTH, span, wall, side * centre, base, 0),
		);
	}
}
