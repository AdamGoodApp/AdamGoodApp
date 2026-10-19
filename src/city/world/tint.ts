import type { BufferGeometry } from "three";
import { Color } from "three";

const target = new Color();

/** Repaint every pure-white vertex of a painted prefab (body, shirt) in `hex`. */
export function tintWhite(geo: BufferGeometry, hex: number): BufferGeometry {
	const colors = geo.getAttribute("color");
	target.setHex(hex);
	for (let i = 0; i < colors.count; i++) {
		if (
			colors.getX(i) > 0.99 &&
			colors.getY(i) > 0.99 &&
			colors.getZ(i) > 0.99
		) {
			colors.setXYZ(i, target.r, target.g, target.b);
		}
	}
	colors.needsUpdate = true;
	return geo;
}
