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

describe("IsoCamera.zoomAt", () => {
	it("keeps the ground under the pointer in place", () => {
		const cam = new IsoCamera("fixed");
		cam.fit(1.6);
		const before = cam.groundPoint(0.5, 0.3);
		cam.zoomAt(2, 0.5, 0.3);
		const after = cam.groundPoint(0.5, 0.3);
		expect(cam.zoomFactor).toBeCloseTo(2);
		expect(after?.x).toBeCloseTo(before?.x ?? Number.NaN, 5);
		expect(after?.z).toBeCloseTo(before?.z ?? Number.NaN, 5);
	});

	it("never zooms out past the default framing", () => {
		const cam = new IsoCamera("fixed");
		cam.fit(1.6);
		cam.zoomAt(0.2, -0.8, 0.8);
		expect(cam.zoomFactor).toBe(1);
		expect(Math.hypot(cam.target.x, cam.target.z)).toBeLessThan(1e-9);
	});
});

describe("IsoCamera.setView", () => {
	it("clamps zoom and target like user input", () => {
		const cam = new IsoCamera("pannable");
		cam.fit(412 / 839);
		cam.setView(300, 300, 9);
		const b = viewBounds(cam);
		expect(cam.view.zoom).toBe(3.5);
		expect(b.maxU).toBeLessThanOrEqual(215 + 1e-6);
		expect(b.maxV).toBeLessThanOrEqual(115 + 1e-6);
	});

	it("centres on a reachable point", () => {
		const cam = new IsoCamera("fixed");
		cam.fit(1.6);
		cam.setView(-58.5, -58.5, 2.2);
		expect(cam.view.x).toBeCloseTo(-58.5, 5);
		expect(cam.view.z).toBeCloseTo(-58.5, 5);
		expect(cam.view.zoom).toBeCloseTo(2.2);
	});
});
