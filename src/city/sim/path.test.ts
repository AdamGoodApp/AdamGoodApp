import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { chamfer, Polyline, rectLoop } from "./path";

const square = () => [
	new Vector3(0, 0, 0),
	new Vector3(10, 0, 0),
	new Vector3(10, 0, 10),
	new Vector3(0, 0, 10),
];

describe("Polyline", () => {
	it("measures and wraps a closed loop", () => {
		const loop = new Polyline(square(), true);
		expect(loop.length).toBe(40);
		const a = loop.pointAt(45, new Vector3());
		const b = loop.pointAt(5, new Vector3());
		expect(a.distanceTo(b)).toBeLessThan(1e-9);
		expect(loop.pointAt(-5, new Vector3()).toArray()).toEqual([0, 0, 5]);
	});

	it("reports the direction of travel", () => {
		const loop = new Polyline(square(), true);
		expect(loop.tangentAt(2, new Vector3()).toArray()).toEqual([1, 0, 0]);
		expect(loop.tangentAt(35, new Vector3()).toArray()).toEqual([0, 0, -1]);
	});

	it("clamps an open polyline at both ends", () => {
		const line = new Polyline(square(), false);
		expect(line.length).toBe(30);
		expect(line.pointAt(-3, new Vector3()).toArray()).toEqual([0, 0, 0]);
		expect(line.pointAt(99, new Vector3()).toArray()).toEqual([0, 0, 10]);
	});
});

describe("chamfer", () => {
	it("replaces each corner with two points cut back by r", () => {
		const pts = chamfer(rectLoop(0, 10, 0, 10, 0), 2);
		expect(pts).toHaveLength(8);
		expect(pts[0]?.toArray()).toEqual([0, 0, 2]);
		expect(pts[1]?.toArray()).toEqual([2, 0, 0]);
		// Each cut shortens the 40 m loop by 4 - 2√2.
		expect(new Polyline(pts, true).length).toBeCloseTo(
			40 - 4 * (4 - 2 * Math.SQRT2),
		);
	});
});
