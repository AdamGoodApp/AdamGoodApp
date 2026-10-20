import {
	type BufferGeometry,
	ConeGeometry,
	IcosahedronGeometry,
	MathUtils,
	Vector3,
} from "three";
import {
	box,
	cone,
	cyl,
	GLOW,
	glow,
	MAT_INSTANCED,
	merge,
	paint,
	paintBy,
	place,
	prism,
} from "../geometry";
import { WHITE } from "../palette";
import {
	ambulance,
	firefighter,
	fireTruck,
	person,
	policeCar,
} from "../prefabs";
import { mulberry32, type Rng } from "../rng";
import type { BuildContext } from "../world/context";
import { ROAD_Y, SIDEWALK_Y } from "../world/layout";
import { tintWhite } from "../world/tint";
import { type Agent, Pool, scaled } from "./agent";
import { type CrowdSpot, createCrowd } from "./crowd";

/**
 * The burning house: a gable-roofed house whose front (+Z) faces an E–W lane.
 * The lane runs along z = `laneZ`; its sidewalk is 5.25 m in front of the house centre.
 */
export interface FireSite {
	/** House centre; walls rise from y = 0 to `h`, a gable roof rises another 2.4. */
	x: number;
	z: number;
	w: number;
	d: number;
	h: number;
	laneZ: number;
	/** West end of the lane road (where it meets the cross street). */
	laneX0: number;
	/** Centre of the cross street the lane joins. */
	streetX: number;
}

const ROOF_RISE = 2.4;
const ROOF_OVERHANG = 0.4;
const CHAR = 0x2b2522;
const CHAR_DEEP = 0x1b1817;
const HOSE = 0xe0b32a;
const TRUCK_OFFSET_A = -5.4;
const TRUCK_OFFSET_B = 5.6;
/** Distance between the house centre and the lane's sidewalk centreline. */
const WALK_OFFSET = 5.25;
const SMOKE_GREYS = [0x5b5b60, 0x6b6b72, 0x7d7d84, 0x4a4a4f, 0x8c8c92] as const;
const FLAME_TINTS = [0xffffff, 0xffe9c8, 0xffd2a0] as const;
const FLAME_COUNT = 24;
const SMOKE_COUNT = 30;
const DROPS_PER_JET = 22;
const FIGHTER_COUNT = 8;
/** Seconds for the fire to swell and ebb once. */
const PULSE_PERIOD = 40;
/** Extra intensity of a staged flare-up and how fast it fades (per second). */
const FLARE_BOOST = 0.5;
const FLARE_DECAY = 0.04;

function roofHeight(site: FireSite, u: number): number {
	const half = (site.w + ROOF_OVERHANG * 2) / 2;
	return site.h + ROOF_RISE * (1 - Math.min(1, Math.abs(u) / half));
}

/** Dark slices across the gable roof, hugging its slope. */
function charredRoof(site: FireSite, statics: BufferGeometry[]): void {
	const half = (site.w + ROOF_OVERHANG * 2) / 2 + 0.06;
	const slope = ROOF_RISE / (half - 0.06);
	const rise = slope * half;
	const y = site.h + ROOF_RISE + 0.04 - rise;
	const slice = (zc: number, len: number, hex: number): void => {
		statics.push(prism(half * 2, rise, len, hex, site.x, y, site.z + zc));
	};
	slice(1.68, 2.5, CHAR);
	slice(-0.9, 0.9, CHAR_DEEP);
	const wall = (x: number, y0: number, hgt: number, wid: number): void => {
		statics.push(
			box(wid, hgt, 0.06, CHAR, site.x + x, y0, site.z + site.d / 2 + 0.03),
		);
	};
	wall(-1.9, 4.1, 1.8, 1.3);
	wall(0.6, 4.3, 1.6, 1.1);
	wall(2.1, 0.8, 1.4, 1.0);
	statics.push(
		box(0.06, 1.9, 1.4, CHAR, site.x + site.w / 2 + 0.03, 3.6, site.z + 0.4),
		box(0.06, 1.3, 1.1, CHAR, site.x + site.w / 2 + 0.03, 0.9, site.z - 0.9),
	);
}

function ladderBetween(a: Vector3, b: Vector3): BufferGeometry {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const dz = b.z - a.z;
	const horiz = Math.hypot(dx, dz);
	const len = Math.hypot(horiz, dy);
	const parts: BufferGeometry[] = [
		box(0.07, 0.1, len, 0xd8dde2, -0.32, -0.05, 0),
		box(0.07, 0.1, len, 0xd8dde2, 0.32, -0.05, 0),
	];
	for (let k = 0.3; k < len - 0.1; k += 0.45) {
		parts.push(box(0.64, 0.06, 0.06, 0x8c9196, 0, -0.03, k - len / 2));
	}
	const g = merge(parts);
	place(g, { rx: -Math.atan2(dy, horiz) });
	return place(g, {
		ry: Math.atan2(dx, dz),
		x: (a.x + b.x) / 2,
		y: (a.y + b.y) / 2,
		z: (a.z + b.z) / 2,
	});
}

/**
 * Fire-fighting scene around a burning house: charred roof and soot, flickering
 * flames, rising smoke, two water jets, parked emergency vehicles, firefighters
 * and a crowd of onlookers. Adds 4 pools (flames, smoke, water, firefighters)
 * plus the crowd's pool.
 */
export function buildFireScene(ctx: BuildContext, site: FireSite): void {
	const { statics } = ctx;
	const truckZ = site.laneZ - 0.4;
	const xA = site.x + TRUCK_OFFSET_A;
	const xB = site.x + TRUCK_OFFSET_B;
	const walkZ = site.z + WALK_OFFSET;

	charredRoof(site, statics);

	statics.push(
		place(fireTruck(), { x: xA, y: ROAD_Y, z: truckZ, ry: Math.PI / 2 }),
		place(fireTruck(), { x: xB, y: ROAD_Y, z: truckZ, ry: -Math.PI / 2 }),
		place(policeCar(), {
			x: site.laneX0 + 0.9,
			y: ROAD_Y,
			z: site.laneZ,
			ry: 0.1,
		}),
		place(ambulance(), {
			x: site.streetX + 0.6,
			y: ROAD_Y,
			z: site.laneZ - 1,
			ry: -0.05,
		}),
	);

	statics.push(
		box(5.4, 0.02, 2.2, 0x3d5668, site.x, ROAD_Y, truckZ),
		box(0.14, 0.12, 2.8, HOSE, xA + 0.8, SIDEWALK_Y, truckZ - 1.9),
		box(0.14, 0.12, 2.8, HOSE, xB - 0.8, SIDEWALK_Y, truckZ - 1.9),
		box(0.3, 0.2, 0.3, 0x8c9196, xA + 0.8, SIDEWALK_Y, truckZ - 1.9),
		box(0.3, 0.2, 0.3, 0x8c9196, xB - 0.8, SIDEWALK_Y, truckZ - 1.9),
		cyl(0.17, 0.2, 0.65, 8, 0xd62828, site.x, SIDEWALK_Y, walkZ + 0.45),
		box(0.5, 0.12, 0.14, 0xd62828, site.x, SIDEWALK_Y + 0.4, walkZ + 0.45),
	);
	for (const cz of [site.laneZ - 2.2, site.laneZ + 2.2]) {
		statics.push(
			cone(0.22, 0.6, 6, 0xff6a1a, site.laneX0 + 2.0, ROAD_Y, cz),
			box(0.46, 0.04, 0.46, 0x2b2b2b, site.laneX0 + 2.0, ROAD_Y, cz),
		);
	}
	statics.push(
		ladderBetween(
			new Vector3(xB - 0.6, 3.05, truckZ),
			new Vector3(site.x + 2.5, 5.5, site.z + site.d / 2 + 0.15),
		),
	);
	// Police tape across the lane between the cones, and paramedics with a stretcher behind the ambulance.
	const ambX = site.streetX + 0.6;
	statics.push(
		box(0.04, 0.05, 4.4, 0xffd400, site.laneX0 + 2.0, ROAD_Y + 0.5, site.laneZ),
		box(0.7, 0.1, 1.9, 0xe8eaee, ambX, ROAD_Y + 0.55, site.laneZ - 5.2),
		box(0.7, 0.06, 1.9, 0x3b7dd8, ambX, ROAD_Y + 0.65, site.laneZ - 5.2),
		box(0.06, 0.55, 0.06, 0x8c9196, ambX - 0.3, ROAD_Y, site.laneZ - 5.9),
		box(0.06, 0.55, 0.06, 0x8c9196, ambX + 0.3, ROAD_Y, site.laneZ - 5.9),
		box(0.06, 0.55, 0.06, 0x8c9196, ambX - 0.3, ROAD_Y, site.laneZ - 4.5),
		box(0.06, 0.55, 0.06, 0x8c9196, ambX + 0.3, ROAD_Y, site.laneZ - 4.5),
	);
	for (const dx of [-0.9, 0.9]) {
		statics.push(
			place(tintWhite(person(), ctx.rng.pick([0x2f7a4a, 0x3b7dd8])), {
				x: ambX + dx,
				y: ROAD_Y,
				z: site.laneZ - 5.2,
				ry: dx < 0 ? Math.PI / 2 : -Math.PI / 2,
			}),
		);
	}

	const spots: CrowdSpot[] = [];
	for (let x = site.laneX0 + 3.5; x <= site.laneX0 + 20; x += 1.15) {
		spots.push({ x, z: site.laneZ + 3.3, y: SIDEWALK_Y, ry: Math.PI });
	}
	for (const x of [1.4, 2.2, 3.0]) {
		spots.push({ x: site.streetX + x, z: site.laneZ + 3.4, y: SIDEWALK_Y });
	}
	for (const x of [site.laneX0 + 2.2, site.laneX0 + 2.9, site.x + 8.4]) {
		spots.push({ x, z: walkZ, y: SIDEWALK_Y, ry: Math.PI });
	}
	for (let x = site.laneX0 + 4; x <= site.laneX0 + 19.5; x += 2.3) {
		spots.push({ x, z: site.laneZ + 3.8, y: SIDEWALK_Y, ry: Math.PI });
	}
	for (const x of [
		site.laneX0 + 3.4,
		site.laneX0 + 4.3,
		site.x + 7.0,
		site.x + 9.2,
	]) {
		spots.push({ x, z: walkZ - 0.3, y: SIDEWALK_Y, ry: Math.PI });
	}
	createCrowd(ctx, spots, { count: spots.length, spread: 0.3 });

	ctx.agents.push(createFireAgent(ctx, site, xA, xB, truckZ, walkZ));
}

interface Flame {
	pos: Vector3;
	scale: number;
	yaw: number;
	threshold: number;
	phase: number;
	speed: number;
}

function makeFlames(site: FireSite, rnd: Rng, n: number): Flame[] {
	const make = (
		x: number,
		y: number,
		z: number,
		scale: number,
		thr: number,
	) => {
		return {
			pos: new Vector3(x, y, z),
			scale,
			yaw: rnd.range(0, Math.PI * 2),
			threshold: thr,
			phase: rnd.range(0, Math.PI * 2),
			speed: rnd.range(6, 11),
		};
	};
	const roof: Flame[] = [];
	for (let i = 0; i < 11; i++) {
		const u = rnd.range(-2.7, 2.7);
		const z = i % 3 === 0 ? rnd.range(-1.4, -0.5) : rnd.range(0.6, 2.5);
		roof.push(
			make(
				site.x + u,
				roofHeight(site, u) - 0.1,
				site.z + z,
				rnd.range(1.0, 1.7),
				rnd.range(0, 0.3),
			),
		);
	}
	const front: Flame[] = [];
	for (let i = 0; i < 7; i++) {
		const y = i % 2 ? rnd.range(3.7, 4.2) : rnd.range(0.9, 1.3);
		front.push(
			make(
				site.x + rnd.range(-2.5, 2.5),
				y,
				site.z + site.d / 2 + 0.2,
				rnd.range(0.8, 1.3),
				rnd.range(0.2, 0.6),
			),
		);
	}
	const side: Flame[] = [];
	for (let i = 0; i < 6; i++) {
		side.push(
			make(
				site.x + site.w / 2 + 0.2,
				rnd.range(1.0, 4.6),
				site.z + rnd.range(-1.8, 1.8),
				rnd.range(0.7, 1.1),
				rnd.range(0.25, 0.6),
			),
		);
	}
	const out: Flame[] = [];
	for (let i = 0; out.length < n && i < 11; i++) {
		for (const list of [roof, front, side]) {
			const f = list[i];
			if (f && out.length < n) out.push(f);
		}
	}
	return out;
}

interface Puff {
	origin: Vector3;
	life: number;
	offset: number;
	yaw: number;
}

interface Jet {
	nozzle: Vector3;
	roof: Vector3;
	wall: Vector3;
	phase: number;
	offset: number;
}

interface Fighter {
	base: Vector3;
	ax: number;
	az: number;
	yaw: number;
	speed: number;
	phase: number;
}

function flameGeometry(): BufferGeometry {
	const g = new ConeGeometry(0.5, 1.5, 5).translate(0, 0.75, 0);
	return glow(
		paintBy(g, (_x, y) => (y < 0.5 ? 0xff4a10 : y < 1.0 ? 0xff8c1a : 0xffc13a)),
		GLOW.always,
	);
}

function createFireAgent(
	ctx: BuildContext,
	site: FireSite,
	xA: number,
	xB: number,
	truckZ: number,
	walkZ: number,
): Agent {
	const rnd = mulberry32(Math.floor(ctx.rng() * 0x100000000));
	const flames = makeFlames(site, rnd, scaled(FLAME_COUNT, ctx.density));
	const flamePool = new Pool(flameGeometry(), MAT_INSTANCED, flames.length);
	flames.forEach((_, i) => {
		flamePool.color(i, rnd.pick(FLAME_TINTS));
	});

	const nSmoke = scaled(SMOKE_COUNT, ctx.density);
	const smokePool = new Pool(
		paint(new IcosahedronGeometry(1, 0), WHITE),
		MAT_INSTANCED,
		nSmoke,
	);
	const puffs: Puff[] = [];
	for (let i = 0; i < nSmoke; i++) {
		puffs.push({
			origin: new Vector3(
				site.x + rnd.range(-2.4, 2.4),
				site.h + ROOF_RISE * 0.7,
				site.z + rnd.range(-1.2, 2.2),
			),
			life: rnd.range(6.5, 9.5),
			offset: i / nSmoke + rnd.range(0, 0.05),
			yaw: rnd.range(0, Math.PI * 2),
		});
		smokePool.color(i, rnd.pick(SMOKE_GREYS));
	}

	const nDrops = scaled(DROPS_PER_JET, ctx.density);
	const waterPool = new Pool(
		glow(box(0.1, 0.1, 0.34, 0xa8e0ff, 0, -0.05, -0.17), GLOW.always),
		MAT_INSTANCED,
		nDrops * 2,
	);
	const roofY = roofHeight(site, 1.2);
	const frontZ = site.z + site.d / 2 + 0.05;
	const jets: Jet[] = [
		{
			nozzle: new Vector3(xA + 3.0, 3.3, truckZ),
			roof: new Vector3(site.x - 1.2, roofY, site.z + 1.6),
			wall: new Vector3(site.x - 1.6, 4.0, frontZ),
			phase: 0,
			offset: 0,
		},
		{
			nozzle: new Vector3(xB - 3.0, 3.3, truckZ),
			roof: new Vector3(site.x + 1.2, roofY, site.z + 1.6),
			wall: new Vector3(site.x + 1.6, 4.0, frontZ),
			phase: 2.1,
			offset: 0.37,
		},
	];

	const fighterPool = new Pool(firefighter(), MAT_INSTANCED, FIGHTER_COUNT);
	const north = Math.PI;
	const mk = (
		x: number,
		y: number,
		z: number,
		yaw: number,
		ax: number,
		az: number,
	): Fighter => ({
		base: new Vector3(x, y, z),
		ax,
		az,
		yaw,
		speed: rnd.range(0.35, 0.6),
		phase: rnd.range(0, Math.PI * 2),
	});
	const fighters: Fighter[] = [
		mk(xA + 3.2, SIDEWALK_Y, walkZ, north, 0.5, 0),
		mk(xB - 3.2, SIDEWALK_Y, walkZ, north, 0.5, 0),
		mk(site.x, ROAD_Y, site.laneZ + 1.35, north, 1.2, 0),
		mk(xA - 3.0, ROAD_Y, site.laneZ + 1.35, north, 0.6, 0),
		mk(xB + 3.0, SIDEWALK_Y, walkZ, north, 0.4, 0.2),
		mk(xA - 2.0, SIDEWALK_Y, walkZ, north, 0.6, 0.3),
		mk(xA + 1.0, ROAD_Y, site.laneZ + 1.35, north, 0.5, 0),
		mk(xB - 1.0, ROAD_Y, site.laneZ + 1.35, north, 0.5, 0),
	];

	ctx.group.add(
		flamePool.mesh,
		smokePool.mesh,
		waterPool.mesh,
		fighterPool.mesh,
	);

	const pos = new Vector3();
	const target = new Vector3();
	const pulseK = (Math.PI * 2) / PULSE_PERIOD;

	// Agents can stage a flare-up; it fades back into the regular pulse.
	let boost = 0;
	let lastPulse = 0;
	const { events } = ctx;
	events.landmark({
		id: "house_fire",
		name: "Burning house (fire crews on scene)",
		x: site.x,
		z: site.z,
		radius: Math.max(site.w, site.d) * 0.8,
	});
	events.onStage("fire_flare_up", () => {
		boost = FLARE_BOOST;
		const text =
			"Flames suddenly leap from the burning house; the crews turn their hoses on it";
		events.emit("fire_flare_up", text, site.x, site.z);
		return { ok: true, text };
	});

	return {
		update(dt, t) {
			const pulse = Math.sin(t * pulseK);
			// The regular pulse peaking is news too.
			if (pulse > 0.98 && lastPulse <= 0.98) {
				events.emit(
					"fire_flare_up",
					"The house fire in the suburbs flares up again",
					site.x,
					site.z,
					t,
				);
			}
			lastPulse = pulse;
			boost = Math.max(0, boost - dt * FLARE_DECAY);
			const intensity = 0.62 + 0.38 * pulse + boost;

			flames.forEach((f, i) => {
				const lvl = MathUtils.clamp((intensity - f.threshold) / 0.35, 0, 1);
				const flicker =
					0.8 +
					0.2 * Math.sin(t * f.speed + f.phase) +
					0.12 * Math.sin(t * 13 + f.phase * 2);
				flamePool.write(
					i,
					f.pos,
					f.yaw + t * 0.8,
					Math.sin(t * 3 + f.phase) * 0.18,
					Math.cos(t * 2.3 + f.phase) * 0.18,
					f.scale * (0.38 + 0.62 * lvl) * flicker,
				);
			});
			flamePool.commit();

			const swell = 0.6 + 0.5 * intensity;
			puffs.forEach((p, i) => {
				const u = (t / p.life + p.offset) % 1;
				const fade = u > 0.75 ? (1 - u) / 0.25 : 1;
				pos.set(
					p.origin.x + u * p.life * 0.9 + Math.sin(t * 0.7 + p.yaw) * 0.3,
					p.origin.y + 11 * u ** 0.9,
					p.origin.z - u * p.life * 0.45,
				);
				smokePool.write(
					i,
					pos,
					p.yaw,
					0,
					0,
					(0.5 + 2.4 * u ** 0.7) * fade * swell,
				);
			});
			smokePool.commit();

			jets.forEach((jet, j) => {
				const w = 0.5 + 0.5 * Math.sin(t * 0.45 + jet.phase);
				target.lerpVectors(jet.wall, jet.roof, w);
				const dx = target.x - jet.nozzle.x;
				const dz = target.z - jet.nozzle.z;
				const lift = 2.0;
				for (let k = 0; k < nDrops; k++) {
					const u = (t * 0.85 + k / nDrops + jet.offset) % 1;
					const arc = 4 * lift * u * (1 - u);
					const dy = target.y - jet.nozzle.y + 4 * lift * (1 - 2 * u);
					pos.set(
						jet.nozzle.x + dx * u + Math.sin(k * 7.3 + jet.phase) * 0.12 * u,
						jet.nozzle.y + (target.y - jet.nozzle.y) * u + arc,
						jet.nozzle.z + dz * u,
					);
					const edge = Math.min(u / 0.05, (1 - u) / 0.1, 1);
					waterPool.write(
						j * nDrops + k,
						pos,
						Math.atan2(dx, dz),
						-Math.atan2(dy, Math.hypot(dx, dz)),
						0,
						edge,
					);
				}
			});
			waterPool.commit();

			fighters.forEach((f, i) => {
				const s = Math.sin(t * f.speed + f.phase);
				pos.set(
					f.base.x + s * f.ax,
					f.base.y + Math.abs(s) * 0.03,
					f.base.z + Math.cos(t * f.speed * 0.7 + f.phase) * f.az,
				);
				fighterPool.write(i, pos, f.yaw + Math.sin(t * 0.5 + f.phase) * 0.4);
			});
			fighterPool.commit();
		},
	};
}
