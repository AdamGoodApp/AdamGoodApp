import { type Object3D, Vector3 } from "three";
import { cyl, MAT_INSTANCED, merge } from "../geometry";
import { BRIGHTS } from "../palette";
import { coasterCar, gondola, horse } from "../prefabs";
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
