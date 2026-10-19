import { describe, expect, it } from "vitest";
import { IsoCamera } from "./camera";

/** View-space extent of what the camera shows: target ± frustum half-sizes. */
function viewBounds(cam: IsoCamera) {
	const t = cam.target;
	const u = (t.x - t.z) / Math.SQRT2;
	const v = -(t.x + t.z) / Math.sqrt(6);
	return {
		maxU: Math.abs(u) + cam.camera.right,
		maxV: Math.abs(v) + cam.camera.top,
	};
}

describe("IsoCamera (pannable)", () => {
	it("never zooms or pans past the built city", () => {
		const cam = new IsoCamera("pannable");
		cam.fit(412 / 839);
		cam.zoomBy(0.01);
		const drags: [number, number][] = [
			[5000, 0],
			[-5000, 0],
			[0, 5000],
			[0, -5000],
			[4000, 4000],
			[-4000, -4000],
		];
		for (const [dx, dy] of drags) {
			cam.pan(dx, dy, 412, 839);
			const b = viewBounds(cam);
			expect(b.maxU).toBeLessThanOrEqual(215 + 1e-6);
			expect(b.maxV).toBeLessThanOrEqual(115 + 1e-6);
		}
	});

	it("still pans freely inside the city when zoomed in", () => {
		const cam = new IsoCamera("pannable");
		cam.fit(412 / 839);
		cam.pan(-200, 0, 412, 839);
		expect(Math.hypot(cam.target.x, cam.target.z)).toBeGreaterThan(20);
	});
});
