import {
	type BufferAttribute,
	Color,
	type Group,
	IcosahedronGeometry,
	Matrix4,
	Mesh,
	PlaneGeometry,
	Quaternion,
	Vector2,
	Vector3,
} from "three";
import {
	color,
	exp,
	mix,
	positionLocal,
	sin,
	smoothstep,
	uniform,
	vec3,
} from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { ZONE_BY_ID, zoneAt } from "#/data/zones";
import { simClock, voidMix } from "../env";
import type { CityEvents, StageResult } from "../events";
import { cyl, GLOW, glow, MAT_INSTANCED, MAT_STATIC, paint } from "../geometry";
import { WATER_DEEP, WATER_LIGHT, WHITE } from "../palette";
import { mulberry32, type Rng } from "../rng";
import { type Agent, Pool } from "../sim/agent";
import { flameGeometry } from "../sim/fire";
import { actorMesh } from "./actor";
import type { BuildingIndex, BuildingRecord, VertexRange } from "./buildings";
import {
	type EventEffect,
	type EventSpec,
	eventSpecSchema,
	resolveTarget,
} from "./spec";

export interface DisasterState {
	name: string;
	phase: "running" | "aftermath";
	/** The black hole has taken the whole city; only black space is left. */
	cityHidden: boolean;
}

export interface DirectorDeps {
	/** The built island: static meshes, pools, ocean, clouds (a black hole pulls it in whole). */
	group: Group;
	/** Effects that must not move with the island: actor, flames, smoke, beam, flood. */
	fx: Group;
	events: CityEvents;
	index: BuildingIndex;
	statics: Mesh;
	facades: Mesh | null;
	rng: Rng;
	density: number;
}

/** Seconds the aftermath holds before the city restores itself. */
export const HOLD_SECONDS = 20;
export const COLLAPSE_SECONDS = 0.9;
const BURN_CHAR_SECONDS = 5;
const PULL_SECONDS = 1.2;
const BEAM_SECONDS = 0.7;
const LEAVE_SECONDS = 3;
const SHRINK_SECONDS = 1.5;
const CREST_DECAY_SECONDS = 3;
const FLAME_SLOTS = 64;
const SMOKE_SLOTS = 96;
const RUBBLE = 0x6b6560;
const CHAR = 0x2b2522;
const DUST = 0x9a8f85;
const SMOKE_GREYS = [0x5b5b60, 0x6b6b72, 0x7d7d84] as const;
const DOWN = new Vector3(0, -1, 0);
const DEFAULT_SWEEP = [
	{ x: -120, z: 120 },
	{ x: 120, z: -120 },
];

interface Snapshot {
	mesh: Mesh;
	range: VertexRange;
	position: Float32Array;
	color: Float32Array;
}

type DamageKind = "collapse" | "burn" | "pull";

interface Damage {
	building: BuildingRecord;
	kind: DamageKind;
	/** `elapsed` when the damage began. */
	at: number;
	snapshots: Snapshot[];
	done: boolean;
}

interface Puff {
	slot: number;
	kind: "dust" | "smoke";
	x: number;
	z: number;
	y0: number;
	born: number;
	/** Smoke puffs cycle; dust puffs end after one life. */
	phase: number;
}

interface Flame {
	slot: number;
	x: number;
	y: number;
	z: number;
	scale: number;
	seed: number;
}

interface Point {
	x: number;
	z: number;
}

interface Active {
	spec: EventSpec;
	elapsed: number;
	phase: "running" | "aftermath";
	cityHidden: boolean;
	waypoints: Point[];
	/** Current ground point of the motion (the actor's origin without altitude or bob). */
	x: number;
	z: number;
	yaw: number;
	wp: number;
	dir: 1 | -1;
	/** Sweep: distance travelled along first → last. */
	u: number;
	actor: Mesh | null;
	zapTimer: number;
	beamUntil: number;
	sweepDone: number;
	origin: Point;
	/** Aftermath lift of a hover/roam actor as it leaves. */
	rise: number;
	hidden: boolean;
	/** Building ids whose sweep-crush chance has already been rolled. */
	rolled: Set<number>;
}

const tmpColor = new Color();
const tmpColor2 = new Color();
const tmpV = new Vector3();
const tmpQ = new Quaternion();
const tmpM = new Matrix4();
const tmpM2 = new Matrix4();

const smooth = (k: number) => k * k * (3 - 2 * k);
const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** A float attribute's backing array (the geometries here are built from Float32Arrays). */
function floats(attr: BufferAttribute): Float32Array {
	return attr.array as Float32Array;
}

function markRange(attr: BufferAttribute, range: VertexRange): void {
	attr.addUpdateRange(range.start * attr.itemSize, range.count * attr.itemSize);
	attr.needsUpdate = true;
}

/** The flood plane's shader inputs, driven from the director. */
const floodFront = uniform(-400);
const floodLevel = uniform(0);
const floodCrest = uniform(0);
const floodDir = uniform(new Vector2(Math.SQRT1_2, -Math.SQRT1_2));

function floodPlane(): Mesh {
	// Rotated in the geometry so local x/z are world x/z and positionNode can set y.
	const geo = new PlaneGeometry(600, 600, 96, 96).rotateX(-Math.PI / 2);
	const material = new MeshStandardNodeMaterial({
		roughness: 0.4,
		metalness: 0,
		transparent: true,
		opacity: 0.78,
		depthWrite: false,
	});
	const u = positionLocal.x
		.mul(floodDir.x)
		.add(positionLocal.z.mul(floodDir.y));
	const behind = smoothstep(floodFront.sub(6), floodFront.add(6), u).oneMinus();
	const crest = floodCrest.mul(exp(u.sub(floodFront).div(10).pow(2).negate()));
	const wave = sin(positionLocal.x.mul(0.25).add(simClock.mul(1.2))).mul(0.3);
	const y = mix(-1, floodLevel, behind).add(crest).add(wave);
	material.positionNode = vec3(positionLocal.x, y, positionLocal.z);
	const shimmer = sin(
		positionLocal.x
			.mul(0.35)
			.add(positionLocal.z.mul(0.2))
			.add(simClock.mul(1.5)),
	)
		.mul(sin(positionLocal.z.mul(0.27).sub(simClock.mul(0.9))))
		.mul(0.5)
		.add(0.5);
	material.colorNode = mix(
		color(WATER_DEEP),
		color(WATER_LIGHT),
		shimmer.mul(0.3),
	);
	const mesh = new Mesh(geo, material);
	mesh.renderOrder = 10;
	mesh.visible = false;
	mesh.frustumCulled = false;
	return mesh;
}

function beamMesh(): Mesh {
	// Wide at the actor (y = 0), narrow at y = -1; scale.y stretches it to the target.
	const geo = glow(
		cyl(3, 0.6, 1, 12, 0xffffff).translate(0, -1, 0),
		GLOW.always,
	);
	const mesh = new Mesh(geo, MAT_STATIC);
	mesh.visible = false;
	mesh.frustumCulled = false;
	return mesh;
}

function tint(mesh: Mesh, hex: number): void {
	const attr = mesh.geometry.getAttribute("color") as BufferAttribute;
	tmpColor.setHex(hex);
	const arr = floats(attr);
	for (let i = 0; i < attr.count; i++) {
		arr[i * 3] = tmpColor.r;
		arr[i * 3 + 1] = tmpColor.g;
		arr[i * 3 + 2] = tmpColor.b;
	}
	attr.needsUpdate = true;
}

function whereOf(text: string, x: number, z: number): string {
	const zone = zoneAt(x, z);
	return text.replaceAll(
		"{where}",
		zone ? ZONE_BY_ID[zone].district : "the city",
	);
}

/**
 * Runs one city event at a time from an `EventSpec`: builds the actor, moves
 * it, applies its effects to the registered buildings (vertex edits on the
 * merged meshes, flames, smoke, a beam, a flood plane, the black-hole spiral),
 * holds the aftermath for `HOLD_SECONDS` and then puts everything back.
 */
export class DisasterDirector implements Agent {
	onChange: (state: DisasterState | null) => void = () => {};
	private active: Active | null = null;
	private readonly damage = new Map<number, Damage>();
	private readonly flames = new Pool(
		flameGeometry(),
		MAT_INSTANCED,
		FLAME_SLOTS,
	);
	private readonly smoke = new Pool(
		paint(new IcosahedronGeometry(1, 0), WHITE),
		MAT_INSTANCED,
		SMOKE_SLOTS,
	);
	private readonly freeFlames: number[] = [];
	private readonly freeSmoke: number[] = [];
	private readonly lit: Flame[] = [];
	private readonly puffs: Puff[] = [];
	private readonly beam = beamMesh();
	private readonly flood = floodPlane();
	private readonly rnd: Rng;

	constructor(private readonly deps: DirectorDeps) {
		this.rnd = mulberry32(Math.floor(deps.rng() * 0x100000000));
		for (let i = FLAME_SLOTS - 1; i >= 0; i--) {
			this.flames.hide(i);
			this.freeFlames.push(i);
		}
		for (let i = SMOKE_SLOTS - 1; i >= 0; i--) {
			this.smoke.hide(i);
			this.freeSmoke.push(i);
		}
		this.flames.commit();
		this.smoke.commit();
		deps.fx.add(this.flames.mesh, this.smoke.mesh, this.beam, this.flood);
	}

	/** Validates and starts an event, restoring any event still playing. */
	start(input: unknown): StageResult {
		const parsed = eventSpecSchema.safeParse(input);
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			const path = issue?.path.map(String).join(".") || "spec";
			return { ok: false, text: `Invalid event: ${path}: ${issue?.message}` };
		}
		if (this.active) this.restore();
		const spec = parsed.data;
		const waypoints = spec.motion.waypoints.length
			? spec.motion.waypoints.map(resolveTarget)
			: spec.motion.kind === "sweep"
				? DEFAULT_SWEEP
				: [{ x: 0, z: 0 }];
		if (spec.motion.kind === "sweep" && waypoints.length < 2) {
			waypoints.push(DEFAULT_SWEEP[1] as Point);
		}
		const first = waypoints[0] as Point;
		const actor = spec.actor ? actorMesh(spec.actor.parts) : null;
		if (actor) {
			actor.position.set(first.x, spec.motion.altitude, first.z);
			this.deps.fx.add(actor);
		}
		const zap = spec.effects.find((e) => e.kind === "zap");
		if (zap) tint(this.beam, Number.parseInt(zap.color.slice(1), 16));
		this.active = {
			spec,
			elapsed: 0,
			phase: "running",
			cityHidden: false,
			waypoints,
			x: first.x,
			z: first.z,
			yaw: 0,
			wp: 0,
			dir: 1,
			u: 0,
			actor,
			zapTimer: 0,
			beamUntil: -1,
			sweepDone: -1,
			origin: first,
			rise: 0,
			hidden: false,
			rolled: new Set(),
		};
		this.deps.events.emit(
			"disaster_started",
			spec.announcement,
			first.x,
			first.z,
		);
		this.onChange(this.state());
		return { ok: true, text: whereOf(spec.announcement, first.x, first.z) };
	}

	state(): DisasterState | null {
		const a = this.active;
		return a
			? { name: a.spec.name, phase: a.phase, cityHidden: a.cityHidden }
			: null;
	}

	/** Where the camera should look when the event starts. */
	focus(): { x: number; z: number; zoom: number } | null {
		const a = this.active;
		if (!a) return null;
		const wide =
			a.spec.motion.kind === "sweep" ||
			a.spec.effects.some((e) => e.kind === "suck");
		return { x: a.origin.x, z: a.origin.z, zoom: wide ? 1 : 1.4 };
	}

	/** Puts the city back as it was; safe to call when nothing is running. */
	restore(): void {
		const a = this.active;
		if (!a) return;
		for (const d of this.damage.values()) {
			for (const s of d.snapshots) {
				const pos = s.mesh.geometry.getAttribute("position") as BufferAttribute;
				const col = s.mesh.geometry.getAttribute("color") as BufferAttribute;
				floats(pos).set(s.position, s.range.start * 3);
				floats(col).set(s.color, s.range.start * 3);
				markRange(pos, s.range);
				markRange(col, s.range);
			}
		}
		this.damage.clear();
		for (const f of this.lit) {
			this.flames.hide(f.slot);
			this.freeFlames.push(f.slot);
		}
		this.lit.length = 0;
		for (const p of this.puffs) {
			this.smoke.hide(p.slot);
			this.freeSmoke.push(p.slot);
		}
		this.puffs.length = 0;
		this.flames.commit();
		this.smoke.commit();
		this.beam.visible = false;
		if (a.actor) {
			this.deps.fx.remove(a.actor);
			a.actor.geometry.dispose();
		}
		this.flood.visible = false;
		floodFront.value = -400;
		floodLevel.value = 0;
		floodCrest.value = 0;
		const g = this.deps.group;
		g.visible = true;
		g.matrixAutoUpdate = true;
		g.position.set(0, 0, 0);
		g.quaternion.identity();
		g.scale.set(1, 1, 1);
		g.matrix.identity();
		g.matrixWorldNeedsUpdate = true;
		voidMix.value = 0;
		this.active = null;
		this.deps.events.emit(
			"disaster_ended",
			`The city has been rebuilt after the ${a.spec.name.toLowerCase()}`,
			a.origin.x,
			a.origin.z,
		);
		this.onChange(null);
	}

	update(dt: number, t: number): void {
		const a = this.active;
		if (!a) return;
		a.elapsed += dt;
		const { spec } = a;
		if (a.elapsed >= spec.seconds + HOLD_SECONDS) {
			this.restore();
			return;
		}
		if (a.phase === "running" && a.elapsed >= spec.seconds) {
			a.phase = "aftermath";
			this.onChange(this.state());
		}
		this.move(a, dt, t);
		// Damage stops with the event; the hole and the water hold their end state.
		for (const e of spec.effects) {
			if (a.phase === "running" || e.kind === "suck" || e.kind === "flood") {
				this.apply(a, e, dt);
			}
		}
		this.animateDamage(a);
		this.animateFlames(t);
		this.animatePuffs(a);
		this.animateActor(a, dt);
		if (a.beamUntil >= 0 && a.elapsed >= a.beamUntil) {
			this.beam.visible = false;
			a.beamUntil = -1;
		}
	}

	private move(a: Active, dt: number, t: number): void {
		const m = a.spec.motion;
		const pts = a.waypoints;
		if (m.kind === "sweep") {
			const from = pts[0] as Point;
			const to = pts[pts.length - 1] as Point;
			const len = Math.hypot(to.x - from.x, to.z - from.z) || 1;
			a.u = Math.min(len, a.u + m.speed * dt);
			if (a.u >= len && a.sweepDone < 0) a.sweepDone = a.elapsed;
			a.x = from.x + ((to.x - from.x) * a.u) / len;
			a.z = from.z + ((to.z - from.z) * a.u) / len;
		} else if (pts.length > 1 && a.phase === "running") {
			const target = pts[a.wp] as Point;
			const dx = target.x - a.x;
			const dz = target.z - a.z;
			const dist = Math.hypot(dx, dz);
			const step = m.speed * dt;
			if (dist <= Math.max(1, step)) {
				a.x = target.x;
				a.z = target.z;
				if (m.kind === "roam") a.wp = (a.wp + 1) % pts.length;
				else {
					if (a.wp + a.dir < 0 || a.wp + a.dir >= pts.length)
						a.dir = -a.dir as 1 | -1;
					a.wp += a.dir;
				}
			} else {
				a.x += (dx / dist) * step;
				a.z += (dz / dist) * step;
			}
		}
		a.yaw += m.spin * dt;
		const actor = a.actor;
		if (actor && !a.hidden) {
			actor.position.x = a.x;
			actor.position.z = a.z;
			actor.position.y = m.altitude + m.bob * Math.sin(1.3 * t) + a.rise;
			actor.rotation.y = a.yaw;
		}
	}

	private apply(a: Active, e: EventEffect, dt: number): void {
		const { index } = this.deps;
		switch (e.kind) {
			case "crush":
				if (a.spec.motion.kind === "sweep") {
					const from = a.waypoints[0] as Point;
					const to = a.waypoints[a.waypoints.length - 1] as Point;
					const len = Math.hypot(to.x - from.x, to.z - from.z) || 1;
					const dx = (to.x - from.x) / len;
					const dz = (to.z - from.z) / len;
					for (const b of index.records) {
						if (this.damage.has(b.id) || a.rolled.has(b.id)) continue;
						const u = (b.x - from.x) * dx + (b.z - from.z) * dz;
						if (Math.abs(u - a.u) <= e.radius) {
							a.rolled.add(b.id);
							if (this.rnd() < 0.6) this.collapse(a, b);
						}
					}
				} else {
					for (const b of index.within(a.x, a.z, e.radius)) {
						if (!this.damage.has(b.id)) this.collapse(a, b);
					}
				}
				break;
			case "burn":
				for (const b of index.within(a.x, a.z, e.radius)) {
					if (!this.damage.has(b.id)) this.burn(a, b);
				}
				break;
			case "zap": {
				a.zapTimer -= dt;
				if (a.zapTimer > 0) break;
				a.zapTimer = e.every;
				const b = index.nearest(
					a.x,
					a.z,
					e.radius,
					(r) => !this.damage.has(r.id),
				);
				if (!b) break;
				this.burn(a, b);
				const actor = a.actor;
				const origin = actor
					? actor.position
					: tmpV.set(a.x, a.spec.motion.altitude, a.z);
				const target = new Vector3(b.x, b.h, b.z);
				const dir = target.clone().sub(origin);
				const dist = dir.length() || 1;
				dir.divideScalar(dist);
				this.beam.position.copy(origin);
				this.beam.quaternion.copy(tmpQ.setFromUnitVectors(DOWN, dir));
				this.beam.scale.set(1, dist, 1);
				this.beam.visible = true;
				a.beamUntil = a.elapsed + BEAM_SECONDS;
				break;
			}
			case "suck":
				this.suck(a, e.radius);
				break;
			case "flood":
				this.floodStep(a, e.level, e.crest);
				break;
		}
	}

	/** Snapshots a building's vertices on first damage. */
	private damageFor(b: BuildingRecord, kind: DamageKind, at: number): Damage {
		const existing = this.damage.get(b.id);
		if (existing) return existing;
		const snapshots: Snapshot[] = [];
		const take = (mesh: Mesh | null, range: VertexRange | null) => {
			if (!mesh || !range) return;
			const pos = mesh.geometry.getAttribute("position") as BufferAttribute;
			const col = mesh.geometry.getAttribute("color") as BufferAttribute;
			snapshots.push({
				mesh,
				range,
				position: floats(pos).slice(
					range.start * 3,
					(range.start + range.count) * 3,
				),
				color: floats(col).slice(
					range.start * 3,
					(range.start + range.count) * 3,
				),
			});
		};
		take(this.deps.statics, b.statics);
		for (const r of b.facades) take(this.deps.facades, r);
		const d: Damage = { building: b, kind, at, snapshots, done: false };
		this.damage.set(b.id, d);
		return d;
	}

	private collapse(a: Active, b: BuildingRecord): void {
		this.damageFor(b, "collapse", a.elapsed);
		for (let i = 0; i < 6; i++) {
			const slot = this.freeSmoke.pop();
			if (slot === undefined) break;
			this.puffs.push({
				slot,
				kind: "dust",
				x: b.x + this.rnd.range(-b.w / 2, b.w / 2),
				z: b.z + this.rnd.range(-b.d / 2, b.d / 2),
				y0: 0.5,
				born: a.elapsed,
				phase: 0,
			});
		}
	}

	private burn(a: Active, b: BuildingRecord): void {
		this.damageFor(b, "burn", a.elapsed);
		const n = Math.min(8, 3 + Math.floor((b.w * b.d) / 40));
		for (let i = 0; i < n; i++) {
			const slot = this.freeFlames.pop();
			if (slot === undefined) break;
			this.lit.push({
				slot,
				x: b.x + this.rnd.range(-b.w / 2.4, b.w / 2.4),
				y: b.h,
				z: b.z + this.rnd.range(-b.d / 2.4, b.d / 2.4),
				scale: this.rnd.range(1.6, 2.6),
				seed: this.rnd.range(0, Math.PI * 2),
			});
		}
		for (let i = 0; i < 3; i++) {
			const slot = this.freeSmoke.pop();
			if (slot === undefined) break;
			this.smoke.color(slot, this.rnd.pick(SMOKE_GREYS));
			this.puffs.push({
				slot,
				kind: "smoke",
				x: b.x + this.rnd.range(-b.w / 3, b.w / 3),
				z: b.z + this.rnd.range(-b.d / 3, b.d / 3),
				y0: b.h,
				born: a.elapsed,
				phase: i / 3,
			});
		}
	}

	private suck(a: Active, radius: number): void {
		const p = a.elapsed / a.spec.seconds;
		const c = a.origin;
		if (p < 0.65 + PULL_SECONDS / a.spec.seconds) {
			for (const b of this.deps.index.byDistance(c.x, c.z, radius)) {
				if (this.damage.has(b.id)) continue;
				const dist = Math.hypot(b.x - c.x, b.z - c.z);
				if (p >= 0.65 * (dist / radius)) this.damageFor(b, "pull", a.elapsed);
			}
		}
		const g = this.deps.group;
		if (p >= 0.65) {
			const p2 = clamp01((p - 0.65) / 0.35);
			const s = (1 - p2) ** 2 + 0.001;
			const theta = 4 * Math.PI * p2;
			g.matrixAutoUpdate = false;
			g.matrix
				.makeTranslation(c.x, 0, c.z)
				.multiply(tmpM.makeRotationY(theta))
				.multiply(tmpM2.makeScale(s, s, s))
				.multiply(tmpM.makeTranslation(-c.x, 0, -c.z));
			g.matrixWorldNeedsUpdate = true;
			voidMix.value = clamp01((p - 0.75) / 0.25);
			if (p >= 1 && !a.cityHidden) {
				g.visible = false;
				a.cityHidden = true;
				this.onChange(this.state());
			}
		}
	}

	private floodStep(a: Active, level: number, crest: number): void {
		const from = a.waypoints[0] as Point;
		const to = a.waypoints[a.waypoints.length - 1] as Point;
		const len = Math.hypot(to.x - from.x, to.z - from.z) || 1;
		const dx = (to.x - from.x) / len;
		const dz = (to.z - from.z) / len;
		this.flood.visible = true;
		floodDir.value.set(dx, dz);
		floodLevel.value = level;
		floodFront.value = from.x * dx + from.z * dz + a.u;
		if (a.sweepDone >= 0) {
			const k = clamp01((a.elapsed - a.sweepDone) / CREST_DECAY_SECONDS);
			floodCrest.value = crest * (1 - k);
			floodFront.value += 60 * k;
		} else floodCrest.value = crest;
	}

	private animateDamage(a: Active): void {
		const c = a.origin;
		for (const d of this.damage.values()) {
			if (d.done) continue;
			const age = a.elapsed - d.at;
			const b = d.building;
			if (d.kind === "collapse") {
				const k = smooth(clamp01(age / COLLAPSE_SECONDS));
				this.write(d, (p0, c0, pos, col, j, o) => {
					pos[j] = p0[o] + (p0[o] - b.x) * 0.25 * k;
					pos[j + 1] = p0[o + 1] * (1 - 0.92 * k);
					pos[j + 2] = p0[o + 2] + (p0[o + 2] - b.z) * 0.25 * k;
					tmpColor
						.setRGB(c0[o], c0[o + 1], c0[o + 2])
						.lerp(tmpColor2.setHex(RUBBLE), k);
					col[j] = tmpColor.r;
					col[j + 1] = tmpColor.g;
					col[j + 2] = tmpColor.b;
				});
				if (k >= 1) d.done = true;
			} else if (d.kind === "burn") {
				const k = clamp01(age / BURN_CHAR_SECONDS);
				this.write(d, (_p0, c0, _pos, col, j, o) => {
					tmpColor
						.setRGB(c0[o], c0[o + 1], c0[o + 2])
						.lerp(tmpColor2.setHex(CHAR), k);
					col[j] = tmpColor.r;
					col[j + 1] = tmpColor.g;
					col[j + 2] = tmpColor.b;
				});
				if (k >= 1) d.done = true;
			} else {
				const k = smooth(clamp01(age / PULL_SECONDS));
				this.write(d, (p0, _c0, pos, _col, j, o) => {
					pos[j] = lerp(p0[o], c.x, k);
					pos[j + 1] = lerp(p0[o + 1], p0[o + 1] * 0.15, k);
					pos[j + 2] = lerp(p0[o + 2], c.z, k);
				});
				if (k >= 1) d.done = true;
			}
		}
	}

	/**
	 * Rewrites a damaged building's vertices from its snapshots and marks the
	 * ranges. `j` indexes the merged attribute arrays, `o` the snapshot slices.
	 */
	private write(
		d: Damage,
		fn: (
			p0: Float32Array,
			c0: Float32Array,
			pos: Float32Array,
			col: Float32Array,
			j: number,
			o: number,
		) => void,
	): void {
		for (const s of d.snapshots) {
			const posAttr = s.mesh.geometry.getAttribute(
				"position",
			) as BufferAttribute;
			const colAttr = s.mesh.geometry.getAttribute("color") as BufferAttribute;
			const pos = floats(posAttr);
			const col = floats(colAttr);
			const base = s.range.start * 3;
			for (let i = 0; i < s.range.count; i++) {
				fn(s.position, s.color, pos, col, base + i * 3, i * 3);
			}
			markRange(posAttr, s.range);
			markRange(colAttr, s.range);
		}
	}

	private animateFlames(t: number): void {
		if (this.lit.length === 0) return;
		for (const f of this.lit) {
			const s = f.scale * (0.85 + 0.15 * Math.sin(9 * t + f.seed));
			this.flames.write(f.slot, tmpV.set(f.x, f.y, f.z), f.seed, 0, 0, s);
		}
		this.flames.commit();
	}

	private animatePuffs(a: Active): void {
		if (this.puffs.length === 0) return;
		for (let i = this.puffs.length - 1; i >= 0; i--) {
			const p = this.puffs[i] as Puff;
			const age = a.elapsed - p.born;
			if (p.kind === "dust") {
				const k = age / 2.5;
				if (k >= 1) {
					this.smoke.hide(p.slot);
					this.freeSmoke.push(p.slot);
					this.puffs.splice(i, 1);
					continue;
				}
				this.smoke.color(p.slot, DUST);
				this.smoke.write(
					p.slot,
					tmpV.set(p.x, p.y0 + 6 * k, p.z),
					0,
					0,
					0,
					1 + 3 * k,
				);
			} else {
				const u = (age / 3 + p.phase) % 1;
				this.smoke.write(
					p.slot,
					tmpV.set(p.x + u * 1.5, p.y0 + 10 * u, p.z),
					0,
					0,
					0,
					0.6 + 2.2 * u,
				);
			}
		}
		this.smoke.commit();
	}

	private animateActor(a: Active, dt: number): void {
		const actor = a.actor;
		if (!actor || a.hidden) return;
		const suck = a.spec.effects.some((e) => e.kind === "suck");
		if (suck) {
			if (a.cityHidden) {
				const s = Math.max(0, actor.scale.x - dt / SHRINK_SECONDS);
				actor.scale.setScalar(s);
				if (s <= 0) {
					actor.visible = false;
					a.hidden = true;
				}
			}
			return;
		}
		if (a.phase === "aftermath" && a.spec.motion.kind !== "sweep") {
			const k = (a.elapsed - a.spec.seconds) / LEAVE_SECONDS;
			a.rise += (60 / LEAVE_SECONDS) * dt;
			if (k >= 1) {
				actor.visible = false;
				a.hidden = true;
			}
		}
	}
}
