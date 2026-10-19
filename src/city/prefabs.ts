import {
	type BufferGeometry,
	Float32BufferAttribute,
	BufferGeometry as Geo,
	IcosahedronGeometry,
} from "three";
import { box, cone, cyl, merge, paint, place, prism } from "./geometry";
import { darken, LEAF, PINE, TRUNK, WHITE } from "./palette";

/**
 * Procedural prefabs. Every function returns ONE painted, non-indexed geometry
 * at the origin: base on y = 0, "front" facing +Z, length along Z for
 * vehicles (driving direction +Z). Position/rotate it with `place()`.
 * Parts painted WHITE are tinted by InstancedMesh instance colours.
 */

const DARK = 0x222222;
const GLASS = 0x2b3a4a;
const SKIN = 0xf1c9a5;
const TROUSERS = 0x2b2b2b;

export function tower(
	w: number,
	d: number,
	h: number,
	facade: number,
): BufferGeometry {
	const parts = [
		box(w, h, d, facade),
		box(w + 0.4, 0.6, d + 0.4, darken(facade, 0.8), 0, h),
		box(w * 0.3, 2, d * 0.3, darken(facade, 0.7), w * 0.15, h + 0.6, -d * 0.15),
	];
	if (h >= 30)
		parts.push(cyl(0.1, 0.1, 4, 6, 0x777777, -w * 0.2, h + 0.6, d * 0.2));
	return merge(parts);
}

export function shop(
	w: number,
	d: number,
	h: number,
	wall: number,
	awning: number,
): BufferGeometry {
	return merge([
		box(w, h, d, wall),
		box(w * 0.8, 0.25, 1.6, awning, 0, 3, d / 2 + 0.8),
		box(1.2, 2.2, 0.1, 0x3a2f2a, -w * 0.25, 0, d / 2 + 0.05),
		box(w * 0.4, 1.6, 0.08, GLASS, w * 0.15, 0.6, d / 2 + 0.04),
		box(3.6, 0.9, 0.15, WHITE, 0, 4.2, d / 2 + 0.08),
		box(w + 0.3, 0.4, d + 0.3, darken(wall, 0.85), 0, h),
	]);
}

export function house(
	w: number,
	d: number,
	wall: number,
	roof: number,
): BufferGeometry {
	return merge([
		box(w, 3.5, d, wall),
		prism(w + 0.6, 2, d + 0.6, roof, 0, 3.5),
		box(0.6, 1.4, 0.6, 0x7a6b66, w * 0.25, 4.2, -d * 0.2),
		box(1, 2, 0.1, 0x6b4a33, 0, 0, d / 2 + 0.05),
		box(1.2, 1, 0.08, GLASS, -w * 0.3, 1.4, d / 2 + 0.04),
		box(1.2, 1, 0.08, GLASS, w * 0.3, 1.4, d / 2 + 0.04),
	]);
}

export function pine(s = 1): BufferGeometry {
	return merge([
		cyl(0.25 * s, 0.3 * s, 1.2 * s, 6, TRUNK),
		cone(1.3 * s, 2.2 * s, 7, PINE, 0, 1.0 * s),
		cone(1.0 * s, 2.0 * s, 7, darken(PINE, 1.15), 0, 2.2 * s),
	]);
}

export function roundTree(s = 1, leaf = LEAF): BufferGeometry {
	return merge([
		cyl(0.2 * s, 0.28 * s, 1.6 * s, 6, TRUNK),
		place(paint(new IcosahedronGeometry(1.4 * s, 0), leaf), { y: 2.2 * s }),
	]);
}

export function palm(): BufferGeometry {
	const parts: BufferGeometry[] = [
		place(cyl(0.18, 0.28, 5, 6, TRUNK), { rz: 0.14 }),
	];
	const top = { x: -0.7, y: 4.95 };
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * Math.PI * 2;
		const frond = box(0.5, 0.08, 2.6, 0x3f9a4a, 0, 0, 1.3);
		parts.push(place(frond, { x: top.x, y: top.y, rx: 0.44, ry: a }));
	}
	return merge(parts);
}

export function bench(): BufferGeometry {
	return merge([
		box(1.6, 0.1, 0.5, 0x8a5a3c, 0, 0.45),
		box(1.6, 0.4, 0.08, 0x8a5a3c, 0, 0.55, -0.22),
		box(0.08, 0.45, 0.4, 0x444444, -0.7),
		box(0.08, 0.45, 0.4, 0x444444, 0.7),
	]);
}

export function lamp(): BufferGeometry {
	return merge([
		cyl(0.08, 0.1, 3.5, 6, 0x5a5d62),
		box(0.4, 0.3, 0.4, 0xfff1c4, 0, 3.5),
	]);
}

export function fencePost(): BufferGeometry {
	return box(0.15, 0.9, 0.15, 0xf2efe6);
}

function wheels(xs: number[], zs: number[], r: number): BufferGeometry[] {
	const out: BufferGeometry[] = [];
	for (const x of xs) {
		for (const z of zs) {
			out.push(
				place(cyl(r, r, 0.3, 8, DARK, 0, -0.15, 0), {
					rz: Math.PI / 2,
					x,
					y: r,
					z,
				}),
			);
		}
	}
	return out;
}

export function car(): BufferGeometry {
	return merge([
		box(1.8, 0.6, 4.2, WHITE, 0, 0.35),
		box(1.6, 0.5, 2.0, GLASS, 0, 0.95, -0.2),
		...wheels([-0.85, 0.85], [-1.3, 1.3], 0.35),
	]);
}

export function bus(): BufferGeometry {
	return merge([
		box(2.4, 2.6, 9, WHITE, 0, 0.4),
		box(2.45, 0.9, 8, GLASS, 0, 1.5, -0.2),
		box(2.3, 0.9, 0.05, GLASS, 0, 1.5, 4.5),
		...wheels([-1.1, 1.1], [-3.2, 0, 3.2], 0.45),
	]);
}

export function tram(): BufferGeometry {
	return merge([
		box(2.2, 2.6, 7, 0xffffff, 0, 0.3),
		box(2.25, 0.5, 7, 0x3b7dd8, 0, 0.4),
		box(2.25, 0.8, 6.4, GLASS, 0, 1.6),
		box(0.1, 1, 0.1, 0x444444, 0, 2.9),
	]);
}

export function person(): BufferGeometry {
	return merge([
		box(0.4, 0.6, 0.25, WHITE, 0, 0.7),
		box(0.26, 0.26, 0.26, SKIN, 0, 1.3),
		box(0.14, 0.7, 0.2, TROUSERS, -0.1, 0),
		box(0.14, 0.7, 0.2, TROUSERS, 0.1, 0),
	]);
}

/** Person lying on its back, head toward -Z (for towels and loungers). */
export function personLying(): BufferGeometry {
	return place(person(), { rx: -Math.PI / 2, y: 0.15, z: 0.7 });
}

export function cow(): BufferGeometry {
	return merge([
		box(0.8, 0.7, 1.4, WHITE, 0, 0.7),
		box(0.82, 0.3, 0.6, DARK, 0, 0.9, 0.2),
		box(0.4, 0.4, 0.5, WHITE, 0, 1.1, 0.9),
		...[-0.3, 0.3].flatMap((x) =>
			[-0.5, 0.5].map((z) => box(0.15, 0.7, 0.15, DARK, x, 0, z)),
		),
	]);
}

export function sheep(): BufferGeometry {
	return merge([
		place(paint(new IcosahedronGeometry(0.5, 0), WHITE), { y: 0.8, sz: 1.3 }),
		box(0.25, 0.25, 0.3, DARK, 0, 0.85, 0.65),
		...[-0.2, 0.2].flatMap((x) =>
			[-0.3, 0.3].map((z) => box(0.1, 0.5, 0.1, DARK, x, 0, z)),
		),
	]);
}

export function dog(): BufferGeometry {
	return merge([
		box(0.3, 0.3, 0.7, 0x8a5a3c, 0, 0.3),
		box(0.25, 0.25, 0.3, 0x8a5a3c, 0, 0.5, 0.45),
		place(box(0.08, 0.08, 0.3, 0x8a5a3c), { rx: -0.6, y: 0.55, z: -0.4 }),
		...[-0.1, 0.1].flatMap((x) =>
			[-0.25, 0.25].map((z) => box(0.08, 0.3, 0.08, 0x6b4430, x, 0, z)),
		),
	]);
}

export function bird(): BufferGeometry {
	return merge([
		place(box(0.5, 0.04, 0.18, 0xffffff), { x: -0.24, rz: 0.26 }),
		place(box(0.5, 0.04, 0.18, 0xffffff), { x: 0.24, rz: -0.26 }),
		box(0.15, 0.1, 0.3, 0x333333),
	]);
}

export function plane(): BufferGeometry {
	return merge([
		box(1.2, 1.2, 8, WHITE, 0, 0),
		box(10, 0.2, 1.8, WHITE, 0, 0.4, 0.5),
		box(0.2, 1.6, 1.4, 0xe8463c, 0, 0.8, -3.2),
		box(3.5, 0.15, 1.0, WHITE, 0, 0.6, -3.3),
		box(1.0, 0.3, 0.3, GLASS, 0, 0.8, 3.7),
		place(cyl(0.3, 0.3, 1.2, 8, 0x555555), {
			rx: Math.PI / 2,
			x: -2.4,
			y: 0.2,
			z: 0.9,
		}),
		place(cyl(0.3, 0.3, 1.2, 8, 0x555555), {
			rx: Math.PI / 2,
			x: 2.4,
			y: 0.2,
			z: 0.9,
		}),
	]);
}

export function sailboat(): BufferGeometry {
	const sail = new Geo();
	sail.setAttribute(
		"position",
		new Float32BufferAttribute([0, 0.8, 0, 0, 4.6, 0, 0, 1.0, -2.2], 3),
	);
	sail.computeVertexNormals();
	return merge([
		box(1.6, 0.6, 4, WHITE),
		box(1.2, 0.3, 1.2, 0x8a5a3c, 0, 0.6, -0.8),
		cyl(0.06, 0.06, 4.5, 6, 0x444444, 0, 0.6, 0),
		paint(sail, 0xffffff),
	]);
}

export function ferry(): BufferGeometry {
	return merge([
		box(4, 1, 12, 0x2e5c8a),
		box(3.6, 1.2, 8, WHITE, 0, 1, -0.5),
		box(2.6, 1, 4, WHITE, 0, 2.2, -1),
		box(3.7, 0.4, 7.8, GLASS, 0, 1.5, -0.5),
		cyl(0.4, 0.4, 1.2, 8, 0xe8463c, 0, 3.2, -1.5),
	]);
}

export function tractor(): BufferGeometry {
	return merge([
		box(1.4, 1.0, 2.6, 0xe8463c, 0, 0.6),
		box(1.2, 1.0, 1.2, GLASS, 0, 1.6, -0.5),
		...wheels([-0.8, 0.8], [-0.7], 0.7),
		...wheels([-0.7, 0.7], [0.9], 0.4),
	]);
}

export function skier(): BufferGeometry {
	return merge([
		person(),
		box(0.12, 0.04, 1.7, 0x3b7dd8, -0.12, 0),
		box(0.12, 0.04, 1.7, 0x3b7dd8, 0.12, 0),
	]);
}

export function snowboarder(): BufferGeometry {
	return merge([
		place(person(), { ry: Math.PI / 2 }),
		box(0.3, 0.04, 1.5, 0xf2c94c),
	]);
}

export function liftChair(): BufferGeometry {
	return merge([
		box(1.2, 0.4, 0.5, 0x444444),
		box(1.2, 0.6, 0.1, 0x444444, 0, 0.4, -0.25),
		box(0.08, 2.4, 0.08, 0x444444, 0, 0.5),
	]);
}

export function coasterCar(): BufferGeometry {
	return merge([
		box(1.1, 0.8, 1.8, WHITE),
		box(0.4, 0.3, 0.4, 0x2b2b2b, 0, 0.8, -0.4),
		box(0.4, 0.3, 0.4, 0x2b2b2b, 0, 0.8, 0.4),
	]);
}

export function gondola(): BufferGeometry {
	return merge([
		box(1.4, 1.2, 1.2, WHITE, 0, -1.2),
		prism(1.6, 0.5, 1.4, 0x444444, 0, 0),
	]);
}

export function horse(): BufferGeometry {
	return merge([
		box(0.9, 0.7, 1.6, WHITE, 0, 0.9),
		box(0.3, 0.5, 0.4, WHITE, 0, 1.5, 0.9),
		...[-0.3, 0.3].flatMap((x) =>
			[-0.55, 0.55].map((z) => box(0.12, 0.9, 0.12, 0x6b4430, x, 0, z)),
		),
	]);
}

export function cloud(radii: number[]): BufferGeometry {
	let x = 0;
	const parts = radii.map((r, i) => {
		const g = place(paint(new IcosahedronGeometry(r, 1), 0xffffff), {
			x,
			y: i % 2 ? r * 0.2 : 0,
			sy: 0.55,
		});
		x += r * 0.9;
		return g;
	});
	const geo = merge(parts);
	geo.translate(-x / 2, 0, 0);
	return geo;
}
