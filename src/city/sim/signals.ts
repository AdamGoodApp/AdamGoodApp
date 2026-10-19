import { Color, Vector3 } from "three";
import { night } from "../env";
import { box, cyl, GLOW, glow, MAT_INSTANCED } from "../geometry";
import type { BuildContext } from "../world/context";
import { AVENUE, RING, SIDEWALK_Y } from "../world/layout";
import { type Agent, Pool } from "./agent";

export const GREEN = 0;
export const AMBER = 1;
export const RED = 2;
export type Lamp = typeof GREEN | typeof AMBER | typeof RED;

/** Travel axis a signal controls: 0 = vehicles moving along x, 1 = along z. */
export type Axis = 0 | 1;

export const AMBER_TIME = 2;
/** Both axes red between two green phases, so the junction clears. */
export const CLEAR_TIME = 1.5;
/** Every junction runs the same cycle; only the offsets differ. */
export const CYCLE = 25;

export interface Junction {
	x: number;
	z: number;
	kind: "cross" | "tee";
	/** Green seconds for traffic moving along x, then along z. */
	green: readonly [number, number];
	/** Seconds the cycle is shifted by (a staggered "green wave"). */
	offset: number;
	/** Corner poles sit at (x + sx·CORNER, z + sz·CORNER). */
	corners: readonly (readonly [number, number])[];
}

const CORNER = 4.2;
const ALL_CORNERS = [
	[-1, -1],
	[1, -1],
	[-1, 1],
	[1, 1],
] as const;

function buildJunctions(): Junction[] {
	const out: Junction[] = [];
	const add = (
		x: number,
		z: number,
		kind: Junction["kind"],
		green: readonly [number, number],
		corners: Junction["corners"],
	) => {
		out.push({ x, z, kind, green, offset: (out.length * 7) % CYCLE, corners });
	};
	for (const x of [-AVENUE, AVENUE]) {
		for (const z of [-AVENUE, AVENUE]) add(x, z, "cross", [9, 9], ALL_CORNERS);
	}
	// Avenues x = ±30 meet the north/south ring roads (running along x).
	for (const x of [-AVENUE, AVENUE]) {
		for (const z of [-RING, RING]) {
			const sz = -Math.sign(z);
			add(
				x,
				z,
				"tee",
				[12, 6],
				[
					[-1, sz],
					[1, sz],
				],
			);
		}
	}
	// Avenues z = ±30 meet the east/west ring roads (running along z).
	for (const z of [-AVENUE, AVENUE]) {
		for (const x of [-RING, RING]) {
			const sx = -Math.sign(x);
			add(
				x,
				z,
				"tee",
				[6, 12],
				[
					[sx, -1],
					[sx, 1],
				],
			);
		}
	}
	return out;
}

export const JUNCTIONS: readonly Junction[] = buildJunctions();

/** Lamp showing to traffic moving along `axis` at sim time `t`. */
export function lampAt(j: Junction, axis: Axis, t: number): Lamp {
	const p = (((t + j.offset) % CYCLE) + CYCLE) % CYCLE;
	const gx = j.green[0];
	const gz = j.green[1];
	const start = axis === 0 ? 0 : gx + AMBER_TIME + CLEAR_TIME;
	const green = axis === 0 ? gx : gz;
	const u = p - start;
	if (u < 0) return RED;
	if (u < green) return GREEN;
	if (u < green + AMBER_TIME) return AMBER;
	return RED;
}

const LAMP_COLORS = [
	new Color().setRGB(0.08, 1, 0.3),
	new Color().setRGB(1, 0.55, 0.03),
	new Color().setRGB(1, 0.07, 0.05),
] as const;
/** Emission ignores instance colours, so the lens is a mid grey and the colour is pushed through the diffuse term. */
const LENS_GREY = 0x9a9a9a;
const GAIN_DAY = 3;
const GAIN_NIGHT = 12;

const HOUSING = 0x23272d;
const LENS_DARK = 0x0d0f12;
const POLE = 0x5a5d62;
const POLE_H = 5.2;
const ARM_REACH = 1.4;
/** Housing base and lens centres above the sidewalk, ordered by lamp (green, amber, red). */
const HOUSING_Y = 3.55;
const HOUSING_H = 1.4;
const LENS_Y = [3.9, 4.25, 4.6] as const;

interface Head {
	junction: Junction;
	axis: Axis;
	pos: Vector3;
	yaw: number;
	lamp: number;
}

class SignalAgent implements Agent {
	private readonly pos = new Vector3();
	private readonly color = new Color();
	private gain = -1;

	constructor(
		private readonly heads: readonly Head[],
		private readonly pool: Pool,
	) {}

	update(_dt: number, t: number): void {
		const gain = Math.round(
			(GAIN_DAY + (GAIN_NIGHT - GAIN_DAY) * night.value) * 4,
		);
		const recolour = gain !== this.gain;
		this.gain = gain;
		let dirty = false;
		for (let i = 0; i < this.heads.length; i++) {
			const h = this.heads[i] as Head;
			const lamp = lampAt(h.junction, h.axis, t);
			if (lamp === h.lamp && !recolour) continue;
			dirty = true;
			if (lamp !== h.lamp) {
				h.lamp = lamp;
				this.pos.set(h.pos.x, h.pos.y + (LENS_Y[lamp] as number), h.pos.z);
				this.pool.write(i, this.pos, h.yaw);
			}
			const base = LAMP_COLORS[lamp] as Color;
			this.color.copy(base).multiplyScalar(gain / 4);
			this.pool.mesh.setColorAt(i, this.color);
		}
		if (!dirty) return;
		this.pool.commit();
		if (this.pool.mesh.instanceColor)
			this.pool.mesh.instanceColor.needsUpdate = true;
	}
}

/** Pole + mast arms + dark housings on the sidewalk corners, and one glowing lens per head in a single Pool. */
export function createSignals(ctx: BuildContext): void {
	const heads: Head[] = [];
	const s = ctx.statics;
	const y0 = SIDEWALK_Y;

	for (const j of JUNCTIONS) {
		for (const [sx, sz] of j.corners) {
			const px = j.x + sx * CORNER;
			const pz = j.z + sz * CORNER;
			s.push(cyl(0.1, 0.13, POLE_H, 6, POLE, px, y0, pz));

			// Head for traffic moving along z hangs on an arm reaching toward the junction along x.
			const zx = px - sx * ARM_REACH;
			s.push(box(ARM_REACH, 0.14, 0.14, POLE, (px + zx) / 2, y0 + 4.95, pz));
			s.push(box(0.5, HOUSING_H, 0.4, HOUSING, zx, y0 + HOUSING_Y, pz));
			// Head for traffic moving along x hangs on an arm reaching toward the junction along z.
			const xz = pz - sz * ARM_REACH;
			s.push(box(0.14, 0.14, ARM_REACH, POLE, px, y0 + 4.95, (pz + xz) / 2));
			s.push(box(0.4, HOUSING_H, 0.5, HOUSING, px, y0 + HOUSING_Y, xz));
			for (const ly of LENS_Y) {
				s.push(box(0.3, 0.3, 0.42, LENS_DARK, zx, y0 + ly - 0.15, pz));
				s.push(box(0.42, 0.3, 0.3, LENS_DARK, px, y0 + ly - 0.15, xz));
			}

			heads.push(
				{
					junction: j,
					axis: 1,
					pos: new Vector3(zx, y0, pz),
					yaw: 0,
					lamp: -1,
				},
				{
					junction: j,
					axis: 0,
					pos: new Vector3(px, y0, xz),
					yaw: Math.PI / 2,
					lamp: -1,
				},
			);
		}
	}

	const lens = glow(box(0.3, 0.3, 0.48, LENS_GREY, 0, -0.15, 0), GLOW.always);
	const pool = new Pool(lens, MAT_INSTANCED, heads.length, {
		color: 0xffffff,
	});
	ctx.group.add(pool.mesh);
	ctx.agents.push(new SignalAgent(heads, pool));
}
