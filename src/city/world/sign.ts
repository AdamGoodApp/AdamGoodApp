import { Matrix4 } from "three";
import { box, cyl, GLOW, glow } from "../geometry";
import { WHITE } from "../palette";
import type { BuildContext } from "./context";

export const GLYPHS: Record<string, string[]> = {
	A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
	d: ["....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"],
	a: [".....", ".....", ".###.", "....#", ".####", "#...#", ".####"],
	m: [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#...#", "#...#"],
	G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
	o: [".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."],
	p: [".....", ".....", "####.", "#...#", "####.", "#....", "#...."],
};

export const SIGN_TEXT = "AdamGoodApp";
export const HILL_HALF_LENGTH = 24;
export const HILL_HEIGHT = 6;
export const HILL_HALF_WIDTH = 10;

const CUBE = 0.7;
/** Cells are taller than wide so the letters survive the 35° camera foreshortening. */
const CUBE_H = 1.1;
const PITCH = 6;
const BASE_LIFT = 0.4;

/** Hill ridge height at local x `u` along the text axis. */
export function hillHeight(u: number): number {
	const f = u / HILL_HALF_LENGTH;
	return HILL_HEIGHT * Math.sqrt(Math.max(0, 1 - f * f));
}

export function buildSign(ctx: BuildContext): void {
	const total = SIGN_TEXT.length * PITCH * CUBE;
	const parts = [];
	for (let i = 0; i < SIGN_TEXT.length; i++) {
		const rows = GLYPHS[SIGN_TEXT.charAt(i)];
		if (!rows) continue;
		const x0 = -total / 2 + i * PITCH * CUBE + CUBE / 2;
		const baseY = hillHeight(x0 + 2 * CUBE) + BASE_LIFT;
		for (let r = 0; r < rows.length; r++) {
			const row = rows[r] as string;
			for (let c = 0; c < row.length; c++) {
				if (row.charAt(c) !== "#") continue;
				parts.push(
					glow(
						box(
							CUBE,
							CUBE_H,
							CUBE,
							WHITE,
							x0 + c * CUBE,
							baseY + (rows.length - 1 - r) * CUBE_H,
							0,
						),
						GLOW.night,
					),
				);
			}
		}
		for (const c of [1, 3]) {
			const px = x0 + c * CUBE;
			const bottom = hillHeight(px) - 0.6;
			parts.push(
				cyl(0.06, 0.06, baseY - bottom, 6, 0x8a8a8a, px, bottom, -0.5),
			);
		}
	}
	const rot = new Matrix4().makeRotationY(Math.PI / 4);
	for (const g of parts) {
		g.applyMatrix4(rot);
		ctx.statics.push(g);
	}
}
