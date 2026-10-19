import {
	type BufferGeometry,
	Float32BufferAttribute,
	BufferGeometry as Geo,
	IcosahedronGeometry,
} from "three";
import {
	box,
	cone,
	cyl,
	GLOW,
	glow,
	merge,
	paint,
	place,
	prism,
} from "./geometry";
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
		glow(box(0.4, 0.3, 0.4, 0xfff1c4, 0, 3.5), GLOW.night),
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

/** Headlights (front, +Z) and tail lights that switch on at night. */
function lights(
	halfW: number,
	front: number,
	back: number,
	y: number,
): BufferGeometry[] {
	return [-1, 1].flatMap((side) => [
		glow(
			box(0.35, 0.18, 0.06, 0xfff4d6, side * (halfW - 0.3), y, front),
			GLOW.night,
		),
		glow(
			box(0.35, 0.16, 0.06, 0xff3020, side * (halfW - 0.3), y, back),
			GLOW.night,
		),
	]);
}

/** Roof light bar: red half on -X, blue half on +X; flashes day and night. */
function lightBar(y: number, z: number, w = 1.2): BufferGeometry[] {
	return [
		glow(box(w / 2, 0.18, 0.35, 0xff2020, -w / 4, y, z), GLOW.siren),
		glow(box(w / 2, 0.18, 0.35, 0x2050ff, w / 4, y, z), GLOW.siren),
	];
}

export function car(): BufferGeometry {
	return merge([
		box(1.8, 0.6, 4.2, WHITE, 0, 0.35),
		box(1.6, 0.5, 2.0, GLASS, 0, 0.95, -0.2),
		...lights(0.9, 2.12, -2.12, 0.6),
		...wheels([-0.85, 0.85], [-1.3, 1.3], 0.35),
	]);
}

/** Black-and-white patrol car with a flashing light bar. Use a WHITE instance colour. */
export function policeCar(): BufferGeometry {
	return merge([
		box(1.8, 0.6, 4.4, 0x1c1f26, 0, 0.35),
		box(1.82, 0.3, 2.2, 0xf4f4f4, 0, 0.55, 0),
		box(1.6, 0.5, 2.0, GLASS, 0, 0.95, -0.2),
		...lightBar(1.45, -0.1),
		...lights(0.9, 2.22, -2.22, 0.6),
		...wheels([-0.85, 0.85], [-1.35, 1.35], 0.35),
	]);
}

/** Box-body ambulance with red stripe and light bar. Use a WHITE instance colour. */
export function ambulance(): BufferGeometry {
	return merge([
		box(2.1, 0.9, 1.6, 0xf6f6f6, 0, 0.4, 2.0),
		box(1.9, 0.5, 0.9, GLASS, 0, 1.2, 2.2),
		box(2.3, 2.3, 3.6, 0xf6f6f6, 0, 0.4, -0.6),
		box(2.32, 0.3, 3.6, 0xd62828, 0, 1.2, -0.6),
		box(0.3, 0.9, 0.06, 0xd62828, 0, 1.4, -2.42),
		box(0.9, 0.3, 0.06, 0xd62828, 0, 1.7, -2.42),
		...lightBar(2.75, 1.0, 1.6),
		...lights(1.05, 2.82, -2.42, 0.7),
		...wheels([-1.0, 1.0], [-1.6, 1.8], 0.42),
	]);
}

/** Fire engine with ladder; length along Z. Use a WHITE instance colour. */
export function fireTruck(): BufferGeometry {
	return merge([
		box(2.4, 1.6, 2.2, 0xc8281e, 0, 0.5, 3.3),
		box(2.2, 0.7, 1.0, GLASS, 0, 1.4, 3.9),
		box(2.4, 1.9, 6, 0xc8281e, 0, 0.5, -0.8),
		box(2.42, 0.2, 6, 0xe8e2d0, 0, 1.2, -0.8),
		box(1.0, 0.3, 7, 0xc9ccd1, 0, 2.5, -0.5),
		box(0.08, 0.3, 7, 0x8c9196, -0.45, 2.75, -0.5),
		box(0.08, 0.3, 7, 0x8c9196, 0.45, 2.75, -0.5),
		...lightBar(2.15, 4.0, 2.0),
		...lights(1.15, 4.42, -3.82, 0.8),
		...wheels([-1.1, 1.1], [-2.8, -1.4, 3.0], 0.5),
	]);
}

/** Firefighter in a yellow coat and red helmet. Use a WHITE instance colour. */
export function firefighter(): BufferGeometry {
	return merge([
		box(0.44, 0.65, 0.3, 0xe8c23a, 0, 0.7),
		box(0.28, 0.26, 0.28, SKIN, 0, 1.33),
		box(0.34, 0.12, 0.34, 0xc8281e, 0, 1.55),
		box(0.15, 0.7, 0.2, 0x2b2b2b, -0.1, 0),
		box(0.15, 0.7, 0.2, 0x2b2b2b, 0.1, 0),
	]);
}

export function bus(): BufferGeometry {
	return merge([
		box(2.4, 2.6, 9, WHITE, 0, 0.4),
		box(2.45, 0.9, 8, GLASS, 0, 1.5, -0.2),
		box(2.3, 0.9, 0.05, GLASS, 0, 1.5, 4.5),
		...lights(1.2, 4.52, -4.52, 0.8),
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

/** Protest sign on a stick (base y = 0, faces +Z); the board is WHITE so instance colours tint it. */
export function placard(): BufferGeometry {
	return merge([
		box(0.05, 1.6, 0.05, 0x8a6a40),
		box(0.9, 0.62, 0.05, WHITE, 0, 1.45),
		box(0.62, 0.1, 0.07, 0x222222, 0, 1.78),
		box(0.46, 0.1, 0.07, 0x222222, 0, 1.58),
	]);
}

/** Cyclist riding toward +Z (base y = 0); the jersey is WHITE so instance colours tint it. */
export function cyclist(): BufferGeometry {
	const wheel = (z: number) =>
		place(cyl(0.34, 0.34, 0.06, 8, DARK, 0, -0.03, 0), {
			rz: Math.PI / 2,
			y: 0.34,
			z,
		});
	return merge([
		wheel(0.55),
		wheel(-0.55),
		box(0.06, 0.07, 1.1, 0x2a6fd6, 0, 0.45, 0),
		box(0.05, 0.4, 0.05, 0x2a6fd6, 0, 0.45, 0.5),
		box(0.5, 0.05, 0.05, DARK, 0, 0.88, 0.5),
		box(0.14, 0.08, 0.3, DARK, 0, 0.84, -0.25),
		place(box(0.36, 0.55, 0.24, WHITE, 0, 0, 0), {
			rx: 0.55,
			y: 0.9,
			z: -0.15,
		}),
		box(0.24, 0.24, 0.24, SKIN, 0, 1.34, 0.2),
		box(0.27, 0.1, 0.27, 0xc8281e, 0, 1.54, 0.2),
		...[-0.12, 0.12].map((x) =>
			place(box(0.12, 0.55, 0.14, TROUSERS, 0, -0.55, 0), {
				rx: -0.5,
				x,
				y: 0.85,
				z: -0.1,
			}),
		),
	]);
}

/** Medical helicopter, nose +Z, skids on y = 0. The main rotor is `helicopterRotor()` (own pool, spins). */
export function helicopter(): BufferGeometry {
	const body = 0xf4f5f6;
	const red = 0xd62828;
	return merge([
		box(1.7, 1.5, 3.4, body, 0, 0.55, -0.2),
		box(1.5, 0.9, 1.0, body, 0, 0.6, 1.6),
		box(1.56, 0.8, 0.7, GLASS, 0, 1.0, 1.85),
		box(1.74, 0.3, 3.2, red, 0, 0.85, -0.3),
		box(1.74, 0.5, 1.0, GLASS, 0, 1.4, 0.95),
		...[-1, 1].flatMap((side) => [
			box(0.04, 0.5, 0.14, red, side * 0.87, 1.3, -0.45),
			box(0.04, 0.14, 0.5, red, side * 0.87, 1.48, -0.45),
		]),
		box(1.2, 0.3, 2.0, body, 0, 2.05, -0.4),
		cyl(0.12, 0.12, 0.5, 6, DARK, 0, 2.35, -0.4),
		box(0.45, 0.5, 3.0, body, 0, 1.0, -3.3),
		box(0.12, 1.3, 0.9, red, 0, 1.1, -4.6),
		box(1.6, 0.08, 0.5, body, 0, 1.2, -4.3),
		box(0.06, 1.0, 0.12, DARK, 0.3, 1.0, -4.85),
		box(0.06, 0.12, 1.0, DARK, 0.3, 1.4, -4.85),
		...[-0.75, 0.75].flatMap((x) => [
			box(0.1, 0.1, 3.4, DARK, x, 0, -0.1),
			box(0.08, 0.55, 0.08, DARK, x, 0.1, 0.8),
			box(0.08, 0.55, 0.08, DARK, x, 0.1, -0.9),
		]),
	]);
}

/** Two-blade-pair rotor disc centred on the origin (hub at y = 0); spun by its own pool. */
export function helicopterRotor(): BufferGeometry {
	return merge([
		box(8.6, 0.06, 0.4, DARK, 0, 0, 0),
		box(0.4, 0.06, 8.6, DARK, 0, 0.001, 0),
		cyl(0.3, 0.3, 0.22, 8, 0x555555, 0, -0.08, 0),
	]);
}
