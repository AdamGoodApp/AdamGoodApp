import { type BufferGeometry, type Object3D, Vector3 } from "three";
import { box, cyl, GLOW, glow, MAT_INSTANCED, merge, place } from "../geometry";
import { BRIGHTS, SHIRTS, WHITE } from "../palette";
import { coasterCar, gondola, horse } from "../prefabs";
import type { Rng } from "../rng";
import { type Agent, Pool } from "./agent";
import type { Polyline } from "./path";

const GRAVITY = 9.81;
const CAR_COUNT = 4;
const CAR_SPACING = 2;
const CAR_LIFT = 0.12;
const LIFT_SPEED = 2.5;

const pos = new Vector3();
const tan = new Vector3();

export class CoasterAgent implements Agent {
	readonly pool: Pool;
	private s = CAR_SPACING * CAR_COUNT;

	constructor(
		private readonly track: Polyline,
		private readonly liftEnd: number,
		private readonly hMax: number,
	) {
		this.pool = new Pool(coasterCar(), MAT_INSTANCED, CAR_COUNT, {
			shadow: true,
		});
		for (let i = 0; i < CAR_COUNT; i++) {
			this.pool.color(i, BRIGHTS[(i * 2) % BRIGHTS.length] as number);
		}
	}

	update(dt: number): void {
		const { track } = this;
		track.pointAt(this.s, pos);
		const wrapped = ((this.s % track.length) + track.length) % track.length;
		const speed =
			wrapped < this.liftEnd
				? LIFT_SPEED
				: Math.max(
						3,
						0.6 * Math.sqrt(2 * GRAVITY * Math.max(0, this.hMax + 2 - pos.y)),
					);
		this.s += speed * dt;
		for (let i = 0; i < CAR_COUNT; i++) {
			const s = this.s - i * CAR_SPACING;
			track.pointAt(s, pos);
			track.tangentAt(s, tan);
			pos.y += CAR_LIFT;
			this.pool.write(i, pos, Math.atan2(tan.x, tan.z), -Math.asin(tan.y));
		}
		this.pool.commit();
	}
}

const GONDOLAS = 12;

export class FerrisAgent implements Agent {
	readonly pool: Pool;
	private readonly cos: number;
	private readonly sin: number;

	constructor(
		private readonly wheel: Object3D,
		private readonly center: Vector3,
		private readonly groupYaw: number,
		private readonly radius: number,
	) {
		this.pool = new Pool(gondola(), MAT_INSTANCED, GONDOLAS);
		for (let i = 0; i < GONDOLAS; i++) {
			this.pool.color(i, BRIGHTS[i % BRIGHTS.length] as number);
		}
		this.cos = Math.cos(groupYaw);
		this.sin = Math.sin(groupYaw);
	}

	update(dt: number): void {
		this.wheel.rotation.z += 0.15 * dt;
		const base = this.wheel.rotation.z;
		for (let i = 0; i < GONDOLAS; i++) {
			const a = base + (i * Math.PI * 2) / GONDOLAS;
			const lx = Math.cos(a) * this.radius;
			const ly = Math.sin(a) * this.radius;
			pos.set(
				this.center.x + lx * this.cos,
				this.center.y + ly,
				this.center.z - lx * this.sin,
			);
			this.pool.write(i, pos, this.groupYaw);
		}
		this.pool.commit();
	}
}

const HORSES = 8;

export class CarouselAgent implements Agent {
	readonly pool: Pool;

	constructor(
		private readonly center: Vector3,
		private readonly radius: number,
	) {
		this.pool = new Pool(
			merge([horse(), cyl(0.05, 0.05, 3.4, 6, 0xc9ccd1, 0, -0.4, 0)]),
			MAT_INSTANCED,
			HORSES,
		);
		for (let i = 0; i < HORSES; i++) {
			this.pool.color(i, BRIGHTS[i % BRIGHTS.length] as number);
		}
	}

	update(_dt: number, t: number): void {
		for (let i = 0; i < HORSES; i++) {
			const a = (i * Math.PI) / 4 + 0.5 * t;
			pos.set(
				this.center.x + Math.cos(a) * this.radius,
				1.0 + Math.sin(t * 2 + i * 0.8) * 0.3,
				this.center.z + Math.sin(a) * this.radius,
			);
			this.pool.write(i, pos, Math.atan2(-Math.sin(a), Math.cos(a)));
		}
		this.pool.commit();
	}
}

const SKIN = 0xf1c9a5;
const TROUSERS = 0x2b2b2b;

/** One seated rider facing +Z, hanging below the origin (seat top at y = -0.52). */
function dangler(shirt: number, x: number, z: number, yaw: number) {
	return place(
		merge([
			box(0.7, 0.1, 0.55, 0x333333, 0, -0.62, 0.1),
			box(0.4, 0.5, 0.22, shirt, 0, -0.52, -0.05),
			box(0.24, 0.24, 0.24, SKIN, 0, -0.02, -0.05),
			box(0.14, 0.14, 0.45, TROUSERS, -0.1, -0.66, 0.3),
			box(0.14, 0.14, 0.45, TROUSERS, 0.1, -0.66, 0.3),
			box(0.14, 0.5, 0.14, TROUSERS, -0.1, -1.15, 0.5),
			box(0.14, 0.5, 0.14, TROUSERS, 0.1, -1.15, 0.5),
			box(0.7, 0.08, 0.08, 0xe8463c, 0, -0.42, 0.18),
		]),
		{ x, z, ry: yaw },
	);
}

/** Square gondola ring that rides the drop tower's mast, riders dangling on all four sides. */
function dropRing(): BufferGeometry {
	const parts: BufferGeometry[] = [
		box(4.6, 0.5, 0.8, 0xe8463c, 0, 0, 1.9),
		box(4.6, 0.5, 0.8, 0xe8463c, 0, 0, -1.9),
		box(0.8, 0.5, 3, 0xe8463c, 1.9, 0, 0),
		box(0.8, 0.5, 3, 0xe8463c, -1.9, 0, 0),
		glow(box(4.7, 0.12, 0.12, 0xfff1c4, 0, 0.5, 2.25), GLOW.night),
		glow(box(4.7, 0.12, 0.12, 0xfff1c4, 0, 0.5, -2.25), GLOW.night),
	];
	const seats: [number, number, number][] = [
		[-0.9, 2.3, 0],
		[0.9, 2.3, 0],
		[-0.9, -2.3, Math.PI],
		[0.9, -2.3, Math.PI],
		[2.3, -0.9, Math.PI / 2],
		[2.3, 0.9, Math.PI / 2],
		[-2.3, -0.9, -Math.PI / 2],
		[-2.3, 0.9, -Math.PI / 2],
	];
	seats.forEach(([x, z, yaw], i) => {
		parts.push(dangler(SHIRTS[i % SHIRTS.length] as number, x, z, yaw));
	});
	return merge(parts);
}

const DROP_WAIT = 3;
const DROP_RISE = 7;
const DROP_HOLD = 2.5;
const DROP_REST = 1.5;
/** Fraction of the drop spent braking at the bottom. */
const DROP_BRAKE = 0.28;

/** Tower ride: rises slowly, hangs at the top, free-falls and brakes; one Pool instance. */
export class DropTowerAgent implements Agent {
	readonly pool: Pool;
	private readonly rise: number;
	private readonly free: number;
	private readonly fallTime: number;
	private readonly brakeTime: number;
	private readonly speed: number;
	private readonly period: number;

	constructor(
		private readonly x: number,
		private readonly z: number,
		private readonly bottom: number,
		private readonly top: number,
	) {
		this.pool = new Pool(dropRing(), MAT_INSTANCED, 1);
		this.rise = top - bottom;
		const brake = this.rise * DROP_BRAKE;
		this.free = this.rise - brake;
		this.fallTime = Math.sqrt((2 * this.free) / GRAVITY);
		this.speed = GRAVITY * this.fallTime;
		this.brakeTime = (2 * brake) / this.speed;
		this.period =
			DROP_WAIT +
			DROP_RISE +
			DROP_HOLD +
			this.fallTime +
			this.brakeTime +
			DROP_REST;
	}

	private heightAt(time: number): number {
		let u = time % this.period;
		if (u < DROP_WAIT) return this.bottom;
		u -= DROP_WAIT;
		if (u < DROP_RISE) {
			return (
				this.bottom +
				this.rise * (0.5 - 0.5 * Math.cos((Math.PI * u) / DROP_RISE))
			);
		}
		u -= DROP_RISE;
		if (u < DROP_HOLD) return this.top;
		u -= DROP_HOLD;
		if (u < this.fallTime) return this.top - 0.5 * GRAVITY * u * u;
		u -= this.fallTime;
		if (u < this.brakeTime) {
			const decel = this.speed / this.brakeTime;
			return this.top - this.free - this.speed * u + 0.5 * decel * u * u;
		}
		return this.bottom;
	}

	update(_dt: number, t: number): void {
		pos.set(this.x, this.heightAt(t), this.z);
		this.pool.write(0, pos, 0);
		this.pool.commit();
	}
}

const SWING_SEATS = 12;
const SWING_CHAIN = 4;
const SWING_CYCLE = 28;
const SWING_LEAN = 0.58;

/** A hanging swing seat, origin at the seat, chains running up the +Y axis. */
function swingSeat(): BufferGeometry {
	return merge([
		box(0.8, 0.1, 0.55, 0x333333, 0, -0.05, 0),
		box(0.8, 0.45, 0.08, 0x333333, 0, 0, -0.26),
		cyl(0.025, 0.025, SWING_CHAIN, 4, 0x777777, -0.42, 0, 0),
		cyl(0.025, 0.025, SWING_CHAIN, 4, 0x777777, 0.42, 0, 0),
		box(0.4, 0.5, 0.22, WHITE, 0, 0.05, -0.1),
		box(0.24, 0.24, 0.24, SKIN, 0, 0.58, -0.1),
		box(0.14, 0.14, 0.45, TROUSERS, -0.1, -0.1, 0.25),
		box(0.14, 0.14, 0.45, TROUSERS, 0.1, -0.1, 0.25),
		box(0.14, 0.5, 0.14, TROUSERS, -0.1, -0.6, 0.45),
		box(0.14, 0.5, 0.14, TROUSERS, 0.1, -0.6, 0.45),
	]);
}

/** Chair swing: seats orbit on chains that fly outward as the ride spins up. */
export class SwingAgent implements Agent {
	readonly pool: Pool;
	private angle = 0;

	constructor(
		private readonly cx: number,
		private readonly cz: number,
		private readonly pivotY: number,
		private readonly armRadius: number,
	) {
		this.pool = new Pool(swingSeat(), MAT_INSTANCED, SWING_SEATS);
		for (let i = 0; i < SWING_SEATS; i++) {
			this.pool.color(i, BRIGHTS[i % BRIGHTS.length] as number);
		}
	}

	update(dt: number, t: number): void {
		const u = t % SWING_CYCLE;
		const k = u < 5 ? u / 5 : u < 23 ? 1 : (SWING_CYCLE - u) / 5;
		const s = k * k * (3 - 2 * k);
		this.angle += (0.25 + 1.25 * s) * dt;
		const lean = SWING_LEAN * s;
		const radius = this.armRadius + SWING_CHAIN * Math.sin(lean);
		const y = this.pivotY - SWING_CHAIN * Math.cos(lean);
		for (let i = 0; i < SWING_SEATS; i++) {
			const a = this.angle + (i * Math.PI * 2) / SWING_SEATS;
			pos.set(
				this.cx + Math.cos(a) * radius,
				y,
				this.cz + Math.sin(a) * radius,
			);
			this.pool.write(i, pos, Math.atan2(-Math.sin(a), Math.cos(a)), 0, lean);
		}
		this.pool.commit();
	}
}

const BUMPER_RADIUS = 0.7;

function bumperCar(): BufferGeometry {
	return merge([
		box(1.2, 0.2, 1.6, 0x555555, 0, 0),
		box(1, 0.4, 1.3, WHITE, 0, 0.2, -0.05),
		box(0.8, 0.5, 0.15, 0x2b2b2b, 0, 0.5, -0.45),
		box(0.36, 0.4, 0.2, WHITE, 0, 0.55, -0.2),
		box(0.22, 0.22, 0.22, SKIN, 0, 0.98, -0.2),
		cyl(0.03, 0.03, 2.2, 5, 0x888888, 0, 0.6, -0.5),
		glow(box(0.2, 0.1, 0.05, 0xfff4d6, -0.3, 0.3, 0.66), GLOW.night),
		glow(box(0.2, 0.1, 0.05, 0xfff4d6, 0.3, 0.3, 0.66), GLOW.night),
	]);
}

/** Dodgem cars wandering a walled arena and bouncing off its walls and each other. */
export class BumperCarsAgent implements Agent {
	readonly pool: Pool;
	private readonly x: Float32Array;
	private readonly z: Float32Array;
	private readonly heading: Float32Array;
	private readonly speed: Float32Array;
	private readonly phase: Float32Array;

	constructor(
		rng: Rng,
		count: number,
		private readonly cx: number,
		private readonly cz: number,
		private readonly halfX: number,
		private readonly halfZ: number,
		private readonly y: number,
	) {
		this.pool = new Pool(bumperCar(), MAT_INSTANCED, count);
		this.x = new Float32Array(count);
		this.z = new Float32Array(count);
		this.heading = new Float32Array(count);
		this.speed = new Float32Array(count);
		this.phase = new Float32Array(count);
		for (let i = 0; i < count; i++) {
			this.x[i] = cx + ((i % 3) - 1) * (halfX * 0.6);
			this.z[i] = cz + (Math.floor(i / 3) % 2 === 0 ? -1 : 1) * (halfZ * 0.4);
			this.heading[i] = rng.range(0, Math.PI * 2);
			this.speed[i] = rng.range(1.4, 2.4);
			this.phase[i] = rng.range(0, Math.PI * 2);
			this.pool.color(i, BRIGHTS[i % BRIGHTS.length] as number);
		}
	}

	update(dt: number, t: number): void {
		const { x, z, heading, speed, phase, pool } = this;
		const n = pool.count;
		const minX = this.cx - this.halfX;
		const maxX = this.cx + this.halfX;
		const minZ = this.cz - this.halfZ;
		const maxZ = this.cz + this.halfZ;
		for (let i = 0; i < n; i++) {
			let h =
				(heading[i] as number) +
				Math.sin(t * 0.9 + (phase[i] as number)) * 0.9 * dt;
			let px = (x[i] as number) + Math.sin(h) * (speed[i] as number) * dt;
			let pz = (z[i] as number) + Math.cos(h) * (speed[i] as number) * dt;
			if (px < minX || px > maxX) {
				px = Math.min(maxX, Math.max(minX, px));
				h = -h;
			}
			if (pz < minZ || pz > maxZ) {
				pz = Math.min(maxZ, Math.max(minZ, pz));
				h = Math.PI - h;
			}
			x[i] = px;
			z[i] = pz;
			heading[i] = h;
		}
		const gap = BUMPER_RADIUS * 2;
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				const dx = (x[i] as number) - (x[j] as number);
				const dz = (z[i] as number) - (z[j] as number);
				const d = Math.hypot(dx, dz);
				if (d >= gap || d < 1e-4) continue;
				const push = (gap - d) / 2 / d;
				x[i] = (x[i] as number) + dx * push;
				z[i] = (z[i] as number) + dz * push;
				x[j] = (x[j] as number) - dx * push;
				z[j] = (z[j] as number) - dz * push;
				heading[i] = Math.atan2(dx, dz);
				heading[j] = Math.atan2(-dx, -dz);
			}
		}
		for (let i = 0; i < n; i++) {
			pos.set(x[i] as number, this.y, z[i] as number);
			pool.write(i, pos, heading[i] as number);
		}
		pool.commit();
	}
}
