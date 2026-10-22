import { Group, InstancedMesh, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { BuildingRegistry } from "../disasters/buildings";
import { CityEvents } from "../events";
import { mulberry32 } from "../rng";
import type { BuildContext } from "../world/context";
import { Polyline } from "./path";
import { createPeople } from "./people";

function makeContext(density: number): BuildContext {
	const y = 0.18;
	return {
		rng: mulberry32(0xada2026),
		density,
		statics: [],
		facades: [],
		group: new Group(),
		agents: [],
		events: new CityEvents(),
		buildings: new BuildingRegistry(),
		sidewalks: [
			new Polyline([new Vector3(-80, y, 26), new Vector3(80, y, 26)], false),
			new Polyline([new Vector3(26, y, -80), new Vector3(26, y, 80)], false),
		],
		residentialDoors: [],
		residentialLoop: null,
		parkLoop: null,
	};
}

describe("people", () => {
	it("puts about 260 walkers and joggers plus a few cyclists on the sidewalks", () => {
		const ctx = makeContext(1);
		createPeople(ctx);
		const meshes = ctx.group.children.filter(
			(c): c is InstancedMesh => c instanceof InstancedMesh,
		);
		expect(meshes.map((m) => m.count).sort((a, b) => b - a)).toEqual([260, 6]);
	});

	it("keeps every instance on the sidewalk network and moves it", () => {
		const ctx = makeContext(1);
		createPeople(ctx);
		const meshes = ctx.group.children.filter(
			(c): c is InstancedMesh => c instanceof InstancedMesh,
		);
		const m4 = new Matrix4();
		const before = new Vector3();
		const after = new Vector3();
		for (const a of ctx.agents) a.update(0, 0);
		const start = meshes.map((m) => {
			const out: Vector3[] = [];
			for (let i = 0; i < m.count; i++) {
				m.getMatrixAt(i, m4);
				out.push(before.setFromMatrixPosition(m4).clone());
			}
			return out;
		});
		for (let step = 1; step <= 60 * 20; step++) {
			for (const a of ctx.agents) a.update(1 / 60, step / 60);
		}
		for (const [mi, m] of meshes.entries()) {
			let moved = 0;
			for (let i = 0; i < m.count; i++) {
				m.getMatrixAt(i, m4);
				after.setFromMatrixPosition(m4);
				expect(Number.isFinite(after.x + after.y + after.z)).toBe(true);
				// Walkers stay within a metre of the two sidewalks.
				const onX = Math.abs(after.z - 26) < 1.2 && Math.abs(after.x) < 82;
				const onZ = Math.abs(after.x - 26) < 1.2 && Math.abs(after.z) < 82;
				expect(onX || onZ).toBe(true);
				if (after.distanceTo((start[mi] as Vector3[])[i] as Vector3) > 1)
					moved += 1;
			}
			expect(moved).toBeGreaterThan(m.count * 0.8);
		}
	});
});
