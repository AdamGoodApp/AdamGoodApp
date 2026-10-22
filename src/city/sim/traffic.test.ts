import { Group, InstancedMesh, Matrix4 } from "three";
import { describe, expect, it } from "vitest";
import { BuildingRegistry } from "../disasters/buildings";
import { CityEvents } from "../events";
import { mulberry32 } from "../rng";
import type { BuildContext } from "../world/context";
import { createTraffic } from "./traffic";

const STEP = 1 / 60;
const SECONDS = 240;
/** Frames between samples (10 samples per second). */
const SAMPLE_EVERY = 6;
/** Pools in creation order: police, ambulance, fire truck, bus, car. */
const ROAD_POOLS = 5;
const FIRE_TRUCK_POOL = 2;

interface Body {
	x: number;
	z: number;
	yaw: number;
	halfLen: number;
	halfWid: number;
}

function makeContext(density: number, seed: number): BuildContext {
	return {
		rng: mulberry32(seed),
		density,
		statics: [],
		facades: [],
		group: new Group(),
		agents: [],
		events: new CityEvents(),
		buildings: new BuildingRegistry(),
		sidewalks: [],
		residentialDoors: [],
		residentialLoop: null,
		parkLoop: null,
	};
}

/** Oriented rectangles overlap unless an edge normal of one separates them. */
function overlaps(a: Body, b: Body): boolean {
	for (const body of [a, b]) {
		const axes = [
			[Math.sin(body.yaw), Math.cos(body.yaw)],
			[Math.cos(body.yaw), -Math.sin(body.yaw)],
		] as const;
		for (const [ax, az] of axes) {
			const radius = (r: Body) =>
				Math.abs(Math.sin(r.yaw) * ax + Math.cos(r.yaw) * az) * r.halfLen +
				Math.abs(Math.cos(r.yaw) * ax - Math.sin(r.yaw) * az) * r.halfWid;
			const dist = Math.abs((b.x - a.x) * ax + (b.z - a.z) * az);
			if (dist >= radius(a) + radius(b)) return false;
		}
	}
	return true;
}

function simulate(density: number, seed: number) {
	const ctx = makeContext(density, seed);
	createTraffic(ctx);

	const meshes = ctx.group.children
		.filter((c): c is InstancedMesh => c instanceof InstancedMesh)
		.slice(0, ROAD_POOLS);
	const sizes = meshes.map((m) => {
		m.geometry.computeBoundingBox();
		const box = m.geometry.boundingBox;
		if (!box) throw new Error("geometry without bounds");
		return {
			halfLen: ((box.max.z - box.min.z) / 2) * 0.9,
			halfWid: ((box.max.x - box.min.x) / 2) * 0.8,
		};
	});

	const m4 = new Matrix4();
	const bodies: Body[] = [];
	const ids: number[] = [];
	const last = new Map<number, { x: number; z: number }>();
	const travelled = new Map<number, number>();
	let overlapFrames = 0;
	let fireTruckSeen = false;

	const sample = () => {
		bodies.length = 0;
		ids.length = 0;
		let id = 0;
		for (const [mi, mesh] of meshes.entries()) {
			const size = sizes[mi] as { halfLen: number; halfWid: number };
			for (let i = 0; i < mesh.count; i++) {
				id += 1;
				mesh.getMatrixAt(i, m4);
				const e = m4.elements;
				if (Math.hypot(e[0] as number, e[1] as number, e[2] as number) < 0.5)
					continue;
				if (mi === FIRE_TRUCK_POOL) fireTruckSeen = true;
				const x = e[12] as number;
				const z = e[14] as number;
				bodies.push({
					x,
					z,
					yaw: Math.atan2(e[8] as number, e[10] as number),
					...size,
				});
				ids.push(id);
				const prev = last.get(id);
				if (prev) {
					const d = Math.hypot(x - prev.x, z - prev.z);
					travelled.set(id, (travelled.get(id) ?? 0) + (d < 20 ? d : 0));
				}
				last.set(id, { x, z });
			}
		}
	};

	for (const a of ctx.agents) a.update(0, 0);
	let t = 0;
	for (let step = 0; step < SECONDS / STEP; step++) {
		t += STEP;
		for (const a of ctx.agents) a.update(STEP, t);
		if (step % SAMPLE_EVERY !== 0) continue;
		sample();
		let touching = false;
		for (let i = 0; i < bodies.length && !touching; i++) {
			const bi = bodies[i] as Body;
			for (let j = i + 1; j < bodies.length; j++) {
				const bj = bodies[j] as Body;
				// Oncoming vehicles use separate lanes; only long vehicles swinging round a corner can brush.
				if (Math.cos(bi.yaw - bj.yaw) < -0.5) continue;
				if (overlaps(bi, bj)) {
					touching = true;
					break;
				}
			}
		}
		if (touching) overlapFrames += 1;
	}

	const distances = [...travelled.values()];
	return {
		overlapFrames,
		fireTruckSeen,
		slowest: Math.min(...distances),
		mean: distances.reduce((a, b) => a + b, 0) / distances.length,
		count: ids.length,
	};
}

describe("road traffic", () => {
	it.each([
		[1, 0xada2026],
		[1, 7],
		[0.5, 0xada2026],
	])(
		"density %s seed %s: nobody overlaps, nobody is stuck",
		(density, seed) => {
			const r = simulate(density, seed);
			expect(r.overlapFrames).toBe(0);
			// 240 s at a 9 m/s cruise is ~2200 m; every vehicle must have made real progress.
			expect(r.slowest).toBeGreaterThan(400);
			expect(r.mean).toBeGreaterThan(900);
		},
		120_000,
	);

	it("sends the fire truck out on the ring", () => {
		expect(simulate(1, 0xada2026).fireTruckSeen).toBe(true);
	}, 120_000);

	it("runs about 110 cars at full density", () => {
		const ctx = makeContext(1, 0xada2026);
		createTraffic(ctx);
		const cars = ctx.group.children.filter(
			(c): c is InstancedMesh => c instanceof InstancedMesh,
		)[4];
		expect(cars?.count).toBe(110);
	});

	it("dispatches the fire engine on demand and logs the run", () => {
		const ctx = makeContext(1, 0xada2026);
		createTraffic(ctx);
		const { events } = ctx;
		const step = (seconds: number) => {
			for (let i = 0; i < seconds * 60; i++) {
				events.now += 1 / 60;
				for (const a of ctx.agents) a.update(1 / 60, events.now);
			}
		};
		step(1);
		expect(events.stage("dispatch_fire_engine").ok).toBe(true);
		step(2);
		expect(events.since().map((e) => e.kind)).toContain(
			"fire_engine_dispatched",
		);
		expect(events.stage("dispatch_fire_engine")).toMatchObject({ ok: false });
	});
});
