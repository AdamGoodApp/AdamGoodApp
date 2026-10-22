import { type BufferAttribute, type BufferGeometry, Group, Mesh } from "three";
import { describe, expect, it } from "vitest";
import { CityEvents } from "../events";
import { MAT_STATIC, merge } from "../geometry";
import { type Sink, walkup } from "../kit/buildings";
import { mulberry32 } from "../rng";
import { BuildingRegistry } from "./buildings";
import { DisasterDirector, HOLD_SECONDS } from "./director";
import type { EventSpecInput } from "./spec";

const STEP = 1 / 60;

function city() {
	const sink: Sink & { buildings: BuildingRegistry } = {
		rng: mulberry32(3),
		statics: [] as BufferGeometry[],
		facades: [] as BufferGeometry[],
		buildings: new BuildingRegistry(),
	};
	walkup(sink, { x: 20, z: 10, w: 8, d: 8 }, { floors: 3 });
	walkup(sink, { x: -40, z: -40, w: 8, d: 8 }, { floors: 3 });
	const index = sink.buildings.resolve(sink.statics, sink.facades);
	const statics = new Mesh(merge(sink.statics), MAT_STATIC);
	const facades = new Mesh(merge(sink.facades), MAT_STATIC);
	const events = new CityEvents();
	const group = new Group();
	const fx = new Group();
	group.add(statics, facades);
	const director = new DisasterDirector({
		group,
		fx,
		events,
		index,
		statics,
		facades,
		rng: mulberry32(9),
		density: 1,
	});
	return { director, events, index, statics, facades, group, fx };
}

function positions(mesh: Mesh): Float32Array {
	const attr = mesh.geometry.getAttribute("position") as BufferAttribute;
	return (attr.array as Float32Array).slice();
}

function ys(
	mesh: Mesh,
	range: { start: number; count: number } | null,
): number[] {
	const arr = positions(mesh);
	const out: number[] = [];
	if (!range) return out;
	for (let i = range.start; i < range.start + range.count; i++) {
		out.push(arr[i * 3 + 1] as number);
	}
	return out;
}

const crushSpec: EventSpecInput = {
	name: "Stomp",
	announcement: "Something is stomping on {where}",
	actor: {
		parts: [{ shape: "box", size: [4, 4, 4], color: "#ff0000", at: [0, 2, 0] }],
	},
	motion: { kind: "hover", waypoints: [{ x: 20, z: 10 }], altitude: 0 },
	effects: [{ kind: "crush", radius: 6 }],
	seconds: 5,
};

describe("DisasterDirector", () => {
	it("crushes the buildings in reach, holds the aftermath, then restores the city", () => {
		const c = city();
		const [b1, b2] = c.index.records;
		const before = positions(c.statics);
		const beforeFacades = positions(c.facades);
		const b1Top = Math.max(...ys(c.statics, b1?.statics ?? null));
		const states: (string | null)[] = [];
		c.director.onChange = (s) => states.push(s ? `${s.name}:${s.phase}` : null);

		const result = c.director.start(crushSpec);
		expect(result).toEqual({
			ok: true,
			text: "Something is stomping on the city",
		});
		expect(c.events.since().at(-1)).toMatchObject({ kind: "disaster_started" });
		expect(c.fx.children.length).toBeGreaterThan(4);

		let t = 0;
		for (; t < 2; t += STEP) c.director.update(STEP, t);
		expect(Math.max(...ys(c.statics, b1?.statics ?? null))).toBeLessThanOrEqual(
			0.1 * b1Top,
		);
		const untouched = b2?.statics;
		expect(untouched).not.toBeNull();
		if (untouched) {
			const now = positions(c.statics);
			for (
				let i = untouched.start * 3;
				i < (untouched.start + untouched.count) * 3;
				i++
			) {
				expect(now[i]).toBe(before[i]);
			}
		}
		expect(c.director.state()).toEqual({
			name: "Stomp",
			phase: "running",
			cityHidden: false,
		});

		for (; t < 5 + HOLD_SECONDS + 1; t += STEP) c.director.update(STEP, t);
		expect(positions(c.statics)).toEqual(before);
		expect(positions(c.facades)).toEqual(beforeFacades);
		expect(c.director.state()).toBeNull();
		expect(c.events.since().map((e) => e.kind)).toEqual([
			"disaster_started",
			"disaster_ended",
		]);
		expect(states).toEqual(["Stomp:running", "Stomp:aftermath", null]);
	});

	it("keeps every written value finite for a building whose range starts past 0", () => {
		for (const kind of ["crush", "burn"] as const) {
			const c = city();
			const [, b2] = c.index.records;
			expect(b2?.statics?.start).toBeGreaterThan(0);
			c.director.start({
				...crushSpec,
				motion: { kind: "hover", waypoints: [{ x: -40, z: -40 }], altitude: 0 },
				effects: [{ kind, radius: 6 }],
			});
			for (let t = 0; t < 1.5; t += STEP) c.director.update(STEP, t);
			for (const mesh of [c.statics, c.facades]) {
				for (const name of ["position", "color"]) {
					const arr = (mesh.geometry.getAttribute(name) as BufferAttribute)
						.array;
					for (let i = 0; i < arr.length; i++) {
						if (!Number.isFinite(arr[i] as number)) {
							throw new Error(`${kind}: ${name}[${i}] is ${arr[i]}`);
						}
					}
				}
			}
			if (kind === "burn") {
				// Charring darkens the walls (white tint → char) but leaves them standing.
				const col = (
					c.facades.geometry.getAttribute("color") as BufferAttribute
				).array;
				const r = b2?.facades[0];
				expect(r).toBeDefined();
				if (r) expect(col[r.start * 3]).toBeLessThan(0.95);
				expect(Math.max(...ys(c.statics, b2?.statics ?? null))).toBeGreaterThan(
					5,
				);
			} else {
				expect(Math.max(...ys(c.statics, b2?.statics ?? null))).toBeLessThan(2);
			}
		}
	});

	it("refuses an invalid spec without touching anything", () => {
		const c = city();
		const result = c.director.start({ bogus: true });
		expect(result.ok).toBe(false);
		expect(result.text).toMatch(/^Invalid event: /);
		expect(c.events.since()).toEqual([]);
		expect(c.director.state()).toBeNull();
	});

	it("replaces a running event, restoring the city first", () => {
		const c = city();
		c.director.start(crushSpec);
		for (let t = 0; t < 2; t += STEP) c.director.update(STEP, t);
		const result = c.director.start({ ...crushSpec, name: "Second" });
		expect(result.ok).toBe(true);
		expect(c.events.since().map((e) => e.kind)).toEqual([
			"disaster_started",
			"disaster_ended",
			"disaster_started",
		]);
		expect(c.director.state()?.name).toBe("Second");
	});
});
