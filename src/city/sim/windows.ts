import { Color, Object3D, PlaneGeometry } from "three";
import { instanced, MAT_WINDOW, paint } from "../geometry";
import { GLASS_DARK, WHITE, WINDOW_LIT } from "../palette";
import type { BuildContext, WindowSpec } from "../world/context";
import type { Agent } from "./agent";

const WINDOW_W = 1;
const WINDOW_H = 1.4;
/** Distance a window quad floats in front of its facade. */
const FACADE_OFFSET = 0.05;
const LIT_FRACTION = 0.35;
const FLIP_INTERVAL = 0.4;
const FLIP_FRACTION = 0.01;

interface FacadeOptions {
	faces?: readonly ("x" | "z")[];
	/** Centre height of the lowest window row. */
	y0?: number;
}

/**
 * Register a grid of windows on the +X and/or +Z faces of an axis-aligned box
 * centred at (cx, cz): columns every 2 m, rows every 3 m. `WindowSpec` x/y/z is
 * the window centre on the facade plane.
 */
export function addFacadeWindows(
	out: WindowSpec[],
	cx: number,
	cz: number,
	w: number,
	d: number,
	h: number,
	{ faces = ["x", "z"], y0 = 2.7 }: FacadeOptions = {},
): void {
	const top = h - 0.7 - WINDOW_H / 2;
	for (const face of faces) {
		const span = face === "x" ? d : w;
		const cols = Math.max(0, Math.floor((span - 1) / 2));
		for (let i = 0; i < cols; i++) {
			const u = (i - (cols - 1) / 2) * 2;
			for (let y = y0; y <= top; y += 3) {
				if (face === "x") out.push({ x: cx + w / 2, y, z: cz + u, face });
				else out.push({ x: cx + u, y, z: cz + d / 2, face });
			}
		}
	}
}

/** One InstancedMesh for every registered window; flickers a few lights on and off. */
export function createWindowPool(ctx: BuildContext): Agent {
	const specs = ctx.windows;
	const count = specs.length;
	const mesh = instanced(
		paint(new PlaneGeometry(WINDOW_W, WINDOW_H), WHITE),
		MAT_WINDOW,
		count,
		{ shadow: false },
	);
	const lit = new Uint8Array(count);
	const dummy = new Object3D();
	const dark = new Color(GLASS_DARK);
	const bright = new Color(WINDOW_LIT);

	for (let i = 0; i < count; i++) {
		const s = specs[i] as WindowSpec;
		const isX = s.face === "x";
		dummy.position.set(
			s.x + (isX ? FACADE_OFFSET : 0),
			s.y,
			s.z + (isX ? 0 : FACADE_OFFSET),
		);
		dummy.rotation.set(0, isX ? Math.PI / 2 : 0, 0);
		dummy.updateMatrix();
		mesh.setMatrixAt(i, dummy.matrix);
		lit[i] = ctx.rng() < LIT_FRACTION ? 1 : 0;
		mesh.setColorAt(i, lit[i] ? bright : dark);
	}
	mesh.instanceMatrix.needsUpdate = true;
	ctx.group.add(mesh);

	const flips = Math.max(1, Math.round(count * FLIP_FRACTION));
	let acc = 0;

	return {
		update(dt) {
			if (count === 0) return;
			acc += dt;
			if (acc < FLIP_INTERVAL) return;
			acc -= FLIP_INTERVAL;
			for (let k = 0; k < flips; k++) {
				const i = Math.floor(ctx.rng() * count);
				lit[i] = lit[i] ? 0 : 1;
				mesh.setColorAt(i, lit[i] ? bright : dark);
			}
			if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
		},
	};
}
