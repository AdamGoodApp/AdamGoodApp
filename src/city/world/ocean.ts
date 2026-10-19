import { Mesh, PlaneGeometry } from "three";
import { color, mix, positionLocal, sin, vec3 } from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { simClock as time } from "../env";
import { WATER_DEEP, WATER_LIGHT } from "../palette";
import type { BuildContext } from "./context";
import { COAST_SOUTH_X, COAST_WEST_Z, WATER_Y } from "./layout";

const SEA_SIZE = 360;
const SEA_CENTRE_X = COAST_SOUTH_X + 20 - SEA_SIZE / 2;
const SEA_CENTRE_Z = COAST_WEST_Z - 20 + SEA_SIZE / 2;

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

	// The sea only lies south-west of the beach; the plane runs under the
	// neighbouring land slabs, which hide its overlap.
	const ocean = new Mesh(
		new PlaneGeometry(SEA_SIZE, SEA_SIZE, 128, 128),
		material,
	);
	ocean.rotation.x = -Math.PI / 2;
	ocean.position.set(SEA_CENTRE_X, WATER_Y, SEA_CENTRE_Z);
	ocean.receiveShadow = true;
	ctx.group.add(ocean);
}
