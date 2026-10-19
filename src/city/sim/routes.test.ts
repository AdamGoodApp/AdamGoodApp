import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { AVENUE, RING, TRAM_HALF } from "../world/layout";
import {
	BUS_STOPS_CCW,
	BUS_STOPS_CW,
	CAR_LOOPS,
	FIRE_SPOT,
	HOSPITAL_SPOT,
	INNER_CCW,
	INNER_CW,
	nearestOnLine,
	RING_CCW,
	RING_CW,
	TRAM,
	TRAM_STOPS,
} from "./routes";

const HALF_ROAD = 3;

function onRoad(x: number, z: number): boolean {
	const near = (v: number, c: number) => Math.abs(v - c) <= HALF_ROAD;
	const lanes = [-AVENUE, AVENUE, -RING, RING];
	const inLand =
		Math.abs(x) <= RING + HALF_ROAD && Math.abs(z) <= RING + HALF_ROAD;
	return inLand && lanes.some((c) => near(x, c) || near(z, c));
}

function extent(line: {
	length: number;
	pointAt(s: number, out: Vector3): Vector3;
}): number[] {
	const p = new Vector3();
	const out: number[] = [];
	for (let s = 0; s < line.length; s += 0.5) {
		line.pointAt(s, p);
		out.push(Math.max(Math.abs(p.x), Math.abs(p.z)));
	}
	return out;
}

describe("vehicle routes", () => {
	it("stay on road surface", () => {
		const p = new Vector3();
		for (const line of CAR_LOOPS) {
			for (let s = 0; s < line.length; s += 0.5) {
				line.pointAt(s, p);
				expect(onRoad(p.x, p.z)).toBe(true);
			}
		}
	});

	it("keep right: clockwise loops run inside the centreline, counter-clockwise outside", () => {
		expect(Math.max(...extent(RING_CW))).toBeLessThan(RING);
		expect(Math.min(...extent(RING_CCW))).toBeGreaterThan(RING);
		expect(Math.max(...extent(INNER_CW))).toBeLessThan(AVENUE);
		expect(Math.min(...extent(INNER_CCW))).toBeGreaterThan(AVENUE);
	});

	it("travel clockwise / counter-clockwise as named", () => {
		const a = new Vector3();
		const t = new Vector3();
		// North edge of the ring: clockwise travels +X, counter-clockwise -X.
		RING_CW.pointAt(RING_CW.nearestS(new Vector3(0, 0, -RING + 1.5)), a);
		RING_CW.tangentAt(RING_CW.nearestS(a), t);
		expect(t.x).toBeGreaterThan(0.99);
		RING_CCW.tangentAt(RING_CCW.nearestS(new Vector3(0, 0, -RING - 1.5)), t);
		expect(t.x).toBeLessThan(-0.99);
	});

	it("place four stops per ring direction on the route", () => {
		expect(BUS_STOPS_CW).toHaveLength(4);
		expect(BUS_STOPS_CCW).toHaveLength(4);
		const p = new Vector3();
		for (const s of BUS_STOPS_CW) {
			RING_CW.pointAt(s, p);
			expect(nearestOnLine(RING_CW, p).dist).toBeLessThan(1e-6);
		}
	});

	it("keeps the tram on the park rectangle with stops at edge midpoints", () => {
		expect(Math.max(...extent(TRAM))).toBeLessThanOrEqual(TRAM_HALF + 1e-6);
		expect(TRAM_STOPS).toHaveLength(4);
		const p = new Vector3();
		for (const s of TRAM_STOPS) {
			TRAM.pointAt(s, p);
			expect(Math.min(Math.abs(p.x), Math.abs(p.z))).toBeLessThan(1e-6);
			expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeCloseTo(TRAM_HALF, 6);
		}
	});

	it("lets emergency vehicles on the ring pass the hospital and the fire scene", () => {
		for (const line of [RING_CW, RING_CCW]) {
			for (const spot of [HOSPITAL_SPOT, FIRE_SPOT]) {
				expect(nearestOnLine(line, spot).dist).toBeLessThan(20);
			}
		}
	});
});
