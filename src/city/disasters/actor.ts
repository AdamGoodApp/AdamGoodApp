import {
	type BufferGeometry,
	IcosahedronGeometry,
	Mesh,
	TorusGeometry,
} from "three";
import {
	box,
	cone,
	cyl,
	GLOW,
	glow,
	MAT_STATIC,
	merge,
	paint,
	place,
} from "../geometry";
import type { EventPart } from "./spec";

const MIN = 0.1;
const rad = (deg: number) => (deg * Math.PI) / 180;
const dim = (v: number) => Math.max(MIN, v);

/** One part in the actor's local frame, centred on `at`. */
function partGeometry(p: EventPart): BufferGeometry {
	const hex = Number.parseInt(p.color.slice(1), 16);
	const [a, b, c] = p.size;
	let g: BufferGeometry;
	switch (p.shape) {
		case "box": {
			// box() sits its base at y = 0; parts are centred on `at`.
			const h = dim(b);
			g = box(dim(a), h, dim(c), hex).translate(0, -h / 2, 0);
			break;
		}
		case "cylinder": {
			const h = dim(b);
			g = cyl(dim(c), dim(a), h, 16, hex).translate(0, -h / 2, 0);
			break;
		}
		case "cone": {
			const h = dim(b);
			g = cone(dim(a), h, 12, hex).translate(0, -h / 2, 0);
			break;
		}
		case "sphere":
			g = paint(new IcosahedronGeometry(dim(a), 1), hex);
			break;
		case "ring":
			// Lies flat: the torus is built in the XY plane.
			g = paint(new TorusGeometry(dim(a), dim(b), 8, 32), hex).rotateX(
				-Math.PI / 2,
			);
			break;
	}
	if (p.glow) glow(g, GLOW.always);
	return place(g, {
		x: p.at[0],
		y: p.at[1],
		z: p.at[2],
		rx: rad(p.rotate[0]),
		ry: rad(p.rotate[1]),
		rz: rad(p.rotate[2]),
	});
}

/** The actor's merged, painted geometry: the same kit the city's prefabs use. */
export function buildActor(parts: readonly EventPart[]): BufferGeometry {
	return merge(parts.map(partGeometry));
}

/** A ready-to-add mesh of the actor (vertex colours and glow via MAT_STATIC). */
export function actorMesh(parts: readonly EventPart[]): Mesh {
	const mesh = new Mesh(buildActor(parts), MAT_STATIC);
	mesh.castShadow = true;
	return mesh;
}
