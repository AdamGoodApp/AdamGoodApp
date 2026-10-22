import type { BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import { type Sink, walkup } from "../kit/buildings";
import { FLOOR_H } from "../kit/facade";
import { mulberry32 } from "../rng";
import { BuildingRegistry } from "./buildings";

function sink(): Sink & { buildings: BuildingRegistry } {
	return {
		rng: mulberry32(7),
		statics: [] as BufferGeometry[],
		facades: [] as BufferGeometry[],
		buildings: new BuildingRegistry(),
	};
}

describe("BuildingRegistry", () => {
	it("records a kit building's lot, height and vertex ranges", () => {
		const s = sink();
		walkup(s, { x: 10, z: -4, w: 8, d: 10 }, { floors: 3 });
		const index = s.buildings.resolve(s.statics, s.facades);
		expect(index.records).toHaveLength(1);
		const [b] = index.records;
		expect(b).toMatchObject({ id: 1, x: 10, z: -4, w: 8, d: 10, ry: 0 });
		expect(Math.abs((b?.h ?? 0) - 3 * FLOOR_H)).toBeLessThan(1);
		expect(b?.statics).toEqual({
			start: 0,
			count: s.statics[0]?.getAttribute("position").count,
		});
		expect(b?.facades.length).toBeGreaterThan(0);
		for (const f of b?.facades ?? []) expect(f.count).toBeGreaterThan(0);
	});

	it("offsets the second building's range by the first one's vertex count", () => {
		const s = sink();
		walkup(s, { x: 0, z: 0, w: 8, d: 8 }, { floors: 2 });
		walkup(s, { x: 30, z: 0, w: 8, d: 8 }, { floors: 2 });
		const index = s.buildings.resolve(s.statics, s.facades);
		const [a, b] = index.records;
		expect(b?.statics?.start).toBe(a?.statics?.count);
		expect(index.within(30, 0, 5).map((r) => r.id)).toEqual([2]);
		expect(index.byDistance(20, 0, 50).map((r) => r.id)).toEqual([2, 1]);
		expect(index.nearest(0, 0, 50, (r) => r.id !== 1)?.id).toBe(2);
		expect(index.nearest(0, 0, 5, (r) => r.id !== 1)).toBeNull();
	});
});
