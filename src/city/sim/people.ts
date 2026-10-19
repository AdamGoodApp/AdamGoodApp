import { Vector3 } from "three";
import { MAT_INSTANCED } from "../geometry";
import { BRIGHTS, SHIRTS } from "../palette";
import { cyclist, dog, person } from "../prefabs";
import { mulberry32, type Rng } from "../rng";
import type { BuildContext } from "../world/context";
import { type Agent, Pool, scaled } from "./agent";
import type { Polyline } from "./path";
import { nearestOnLine } from "./routes";

/** A line end within this distance of another line connects to it. */
const END_JOIN = 2;
/** Crossings and joins closer than this to a line end are handled as end joins. */
const EDGE = 0.5;
/** Chance to turn onto a sidewalk that crosses the current one. */
const TURN_CHANCE = 0.35;
const LATERAL = 0.4;
const BOB = 0.05;
const PARK_SPEED = 1.3;
const DOG_BEHIND = 1.2;
const DOG_SIDE = 0.35;

const HIDDEN = 0;
const OUT = 1;
const STROLL = 2;
const BACK = 3;
const IN = 4;

function approachAngle(cur: number, target: number, k: number): number {
	let d = target - cur;
	d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
	return cur + d * k;
}

function mod(a: number, n: number): number {
	return ((a % n) + n) % n;
}

interface Join {
	/** Arc length on this line. */
	s: number;
	other: number;
	/** Arc length on the other line. */
	sOther: number;
}

interface Net {
	lines: readonly Polyline[];
	/** Per line: joins at its start and at its end (forced turns). */
	ends: [Join[], Join[]][];
	/** Per line: joins strictly inside it (optional turns). */
	cross: Join[][];
}

interface Seg {
	ax: number;
	az: number;
	dx: number;
	dz: number;
	len: number;
	s0: number;
}

function segments(line: Polyline): Seg[] {
	const pts = line.points;
	const out: Seg[] = [];
	let s0 = 0;
	for (let i = 0; i < pts.length - 1; i++) {
		const a = pts[i] as Vector3;
		const b = pts[i + 1] as Vector3;
		const dx = b.x - a.x;
		const dz = b.z - a.z;
		const len = Math.hypot(dx, dz);
		out.push({ ax: a.x, az: a.z, dx, dz, len, s0 });
		s0 += len;
	}
	return out;
}

function buildNet(lines: readonly Polyline[]): Net {
	const ends = lines.map((): [Join[], Join[]] => [[], []]);
	const cross = lines.map((): Join[] => []);

	for (let li = 0; li < lines.length; li++) {
		const line = lines[li] as Polyline;
		for (const e of [0, 1] as const) {
			const p = e === 0 ? line.start : line.end;
			const sEnd = e === 0 ? 0 : line.length;
			for (let mi = 0; mi < lines.length; mi++) {
				if (mi === li) continue;
				const other = lines[mi] as Polyline;
				const near = nearestOnLine(other, p);
				if (near.dist > END_JOIN) continue;
				(ends[li] as [Join[], Join[]])[e].push({
					s: sEnd,
					other: mi,
					sOther: near.s,
				});
				if (near.s > EDGE && near.s < other.length - EDGE) {
					(cross[mi] as Join[]).push({ s: near.s, other: li, sOther: sEnd });
				}
			}
		}
	}

	const tables = lines.map(segments);
	for (let a = 0; a < lines.length; a++) {
		for (let b = a + 1; b < lines.length; b++) {
			for (const sa of tables[a] as Seg[]) {
				for (const sb of tables[b] as Seg[]) {
					const den = sa.dx * sb.dz - sa.dz * sb.dx;
					if (Math.abs(den) < 0.2 * sa.len * sb.len) continue;
					const qx = sb.ax - sa.ax;
					const qz = sb.az - sa.az;
					const t = (qx * sb.dz - qz * sb.dx) / den;
					const u = (qx * sa.dz - qz * sa.dx) / den;
					const ma = t * sa.len;
					const mb = u * sb.len;
					if (ma <= EDGE || ma >= sa.len - EDGE) continue;
					if (mb <= EDGE || mb >= sb.len - EDGE) continue;
					const sA = sa.s0 + ma;
					const sB = sb.s0 + mb;
					const list = cross[a] as Join[];
					if (list.some((j) => j.other === b && Math.abs(j.s - sA) < 1.5))
						continue;
					list.push({ s: sA, other: b, sOther: sB });
					(cross[b] as Join[]).push({ s: sB, other: a, sOther: sA });
				}
			}
		}
	}
	return { lines, ends, cross };
}

interface Walker {
	index: number;
	line: number;
	s: number;
	dir: 1 | -1;
	speed: number;
	lat: number;
	/** Current offset from the line point; eases toward the lateral target and absorbs jumps between lines. */
	ox: number;
	oz: number;
	yaw: number;
	/** Footfall bounce: radians per second and height (0 for riders). */
	bobRate: number;
	bobAmp: number;
}

class StreetWalkers {
	private readonly point = new Vector3();
	private readonly tangent = new Vector3();

	constructor(
		private readonly net: Net,
		private readonly walkers: readonly Walker[],
		private readonly pool: Pool,
		private readonly rnd: Rng,
	) {}

	update(dt: number, t: number): void {
		const k = 1 - Math.exp(-dt * 6);
		const ky = 1 - Math.exp(-dt * 10);
		for (const w of this.walkers) {
			if (dt > 0) this.advance(w, w.speed * dt);
			const line = this.net.lines[w.line] as Polyline;
			line.pointAt(w.s, this.point);
			line.tangentAt(w.s, this.tangent);
			w.ox += (-this.tangent.z * w.lat - w.ox) * k;
			w.oz += (this.tangent.x * w.lat - w.oz) * k;
			this.point.x += w.ox;
			this.point.z += w.oz;
			this.point.y += Math.abs(Math.sin(t * w.bobRate + w.index)) * w.bobAmp;
			w.yaw = approachAngle(
				w.yaw,
				Math.atan2(this.tangent.x * w.dir, this.tangent.z * w.dir),
				ky,
			);
			this.pool.write(w.index, this.point, w.yaw);
		}
	}

	private advance(w: Walker, dist: number): void {
		const { lines, ends, cross } = this.net;
		const line = lines[w.line] as Polyline;
		const next = w.s + w.dir * dist;

		for (const j of cross[w.line] as Join[]) {
			const passed =
				w.dir > 0 ? j.s > w.s && j.s <= next : j.s < w.s && j.s >= next;
			if (passed && this.rnd() < TURN_CHANCE) {
				this.retarget(w, j.s, j.other, j.sOther);
				return;
			}
		}

		if (next > 0 && next < line.length) {
			w.s = next;
			return;
		}
		const e = next <= 0 ? 0 : 1;
		const sEnd = e === 0 ? 0 : line.length;
		const options = (ends[w.line] as [Join[], Join[]])[e];
		if (options.length === 0) {
			w.s = sEnd;
			w.dir = w.dir > 0 ? -1 : 1;
			return;
		}
		const pick = options[Math.floor(this.rnd() * options.length)] as Join;
		this.retarget(w, sEnd, pick.other, pick.sOther);
	}

	private retarget(w: Walker, oldS: number, line: number, s: number): void {
		const { lines } = this.net;
		(lines[w.line] as Polyline).pointAt(oldS, this.point);
		const wx = this.point.x + w.ox;
		const wz = this.point.z + w.oz;
		const target = lines[line] as Polyline;
		target.pointAt(s, this.point);
		w.ox = wx - this.point.x;
		w.oz = wz - this.point.z;
		w.line = line;
		w.s = s;
		if (s < EDGE) w.dir = 1;
		else if (s > target.length - EDGE) w.dir = -1;
		else w.dir = this.rnd() < 0.5 ? 1 : -1;
	}
}

interface Resident {
	index: number;
	door: Vector3;
	join: Vector3;
	joinS: number;
	outYaw: number;
	walkLen: number;
	phase: number;
	timer: number;
	u: number;
	s: number;
	dir: 1 | -1;
	speed: number;
	lat: number;
	yaw: number;
}

class Residents {
	private readonly pos = new Vector3();
	private readonly tangent = new Vector3();

	constructor(
		private readonly loop: Polyline,
		private readonly residents: readonly Resident[],
		private readonly pool: Pool,
		private readonly rnd: Rng,
	) {}

	update(dt: number, t: number): void {
		const ky = 1 - Math.exp(-dt * 10);
		for (const r of this.residents) {
			if (r.phase === HIDDEN) {
				r.timer -= dt;
				if (r.timer > 0) {
					this.pool.hide(r.index);
					continue;
				}
				r.phase = OUT;
				r.u = 0;
				r.yaw = r.outYaw;
			}

			const step = r.speed * dt;
			let targetYaw = r.yaw;
			if (r.phase === OUT || r.phase === IN) {
				const leaving = r.phase === OUT;
				r.u = Math.min(1, r.u + step / r.walkLen);
				if (leaving) this.pos.lerpVectors(r.door, r.join, r.u);
				else this.pos.lerpVectors(r.join, r.door, r.u);
				targetYaw = leaving ? r.outYaw : r.outYaw + Math.PI;
				if (r.u >= 1) {
					if (leaving) {
						r.phase = STROLL;
						r.s = r.joinS;
						r.dir = this.rnd() < 0.5 ? 1 : -1;
						r.timer = 20 + this.rnd() * 20;
					} else {
						r.phase = HIDDEN;
						r.timer = 4 + this.rnd() * 10;
						this.pool.hide(r.index);
						continue;
					}
				}
			} else {
				this.walkLoop(r, step, dt);
				this.loop.pointAt(r.s, this.pos);
				this.loop.tangentAt(r.s, this.tangent);
				this.pos.x -= this.tangent.z * r.lat;
				this.pos.z += this.tangent.x * r.lat;
				targetYaw = Math.atan2(this.tangent.x * r.dir, this.tangent.z * r.dir);
			}

			r.yaw = approachAngle(r.yaw, targetYaw, ky);
			this.pos.y += Math.abs(Math.sin(t * 10 + r.index)) * BOB;
			this.pool.write(r.index, this.pos, r.yaw);
		}
	}

	private walkLoop(r: Resident, step: number, dt: number): void {
		const len = this.loop.length;
		if (r.phase === STROLL) {
			r.s += r.dir * step;
			if (!this.loop.closed) {
				if (r.s < 0) {
					r.s = 0;
					r.dir = 1;
				} else if (r.s > len) {
					r.s = len;
					r.dir = -1;
				}
			}
			r.timer -= dt;
			if (r.timer <= 0) r.phase = BACK;
			return;
		}
		let remaining: number;
		if (this.loop.closed) {
			remaining = r.dir > 0 ? mod(r.joinS - r.s, len) : mod(r.s - r.joinS, len);
		} else {
			r.dir = r.joinS >= r.s ? 1 : -1;
			remaining = Math.abs(r.joinS - r.s);
		}
		if (remaining <= step) {
			r.s = r.joinS;
			r.phase = IN;
			r.u = 0;
		} else r.s += r.dir * step;
	}
}

/** Dog walkers strolling the park loop, each trailed by a dog. */
class ParkStrollers {
	private readonly pos = new Vector3();
	private readonly tangent = new Vector3();
	private readonly yaws: number[];

	constructor(
		private readonly loop: Polyline,
		private readonly s: number[],
		private readonly dirs: (1 | -1)[],
		private readonly firstIndex: number,
		private readonly people: Pool,
		private readonly dogs: Pool,
	) {
		this.yaws = s.map((sv, i) => {
			loop.tangentAt(sv, this.tangent);
			const d = dirs[i] as 1 | -1;
			return Math.atan2(this.tangent.x * d, this.tangent.z * d);
		});
	}

	update(dt: number, t: number): void {
		const len = this.loop.length;
		const ky = 1 - Math.exp(-dt * 10);
		for (let i = 0; i < this.s.length; i++) {
			const dir = this.dirs[i] as 1 | -1;
			let s = (this.s[i] as number) + dir * PARK_SPEED * dt;
			if (!this.loop.closed) {
				if (s < 0) {
					s = 0;
					this.dirs[i] = 1;
				} else if (s > len) {
					s = len;
					this.dirs[i] = -1;
				}
			}
			this.s[i] = s;
			const d = this.dirs[i] as 1 | -1;

			this.loop.pointAt(s, this.pos);
			this.loop.tangentAt(s, this.tangent);
			const yaw = approachAngle(
				this.yaws[i] as number,
				Math.atan2(this.tangent.x * d, this.tangent.z * d),
				ky,
			);
			this.yaws[i] = yaw;
			this.pos.y += Math.abs(Math.sin(t * 10 + i)) * BOB;
			this.people.write(this.firstIndex + i, this.pos, yaw);

			const sDog = s - d * DOG_BEHIND;
			this.loop.pointAt(sDog, this.pos);
			this.loop.tangentAt(sDog, this.tangent);
			this.pos.x -= this.tangent.z * DOG_SIDE;
			this.pos.z += this.tangent.x * DOG_SIDE;
			this.pos.y += Math.abs(Math.sin(t * 14 + i)) * 0.03;
			this.dogs.write(i, this.pos, yaw);
		}
	}
}

class PeopleAgent implements Agent {
	constructor(
		private readonly parts: readonly Agent[],
		private readonly pools: readonly Pool[],
	) {}

	update(dt: number, t: number): void {
		for (const p of this.parts) p.update(dt, t);
		for (const p of this.pools) p.commit();
	}
}

interface WalkerKind {
	speed: readonly [number, number];
	lateral: number;
	bobRate: number;
	bobAmp: number;
}

const WALKING: WalkerKind = {
	speed: [1.2, 1.6],
	lateral: LATERAL,
	bobRate: 10,
	bobAmp: BOB,
};
const JOGGING: WalkerKind = {
	speed: [2.8, 3.6],
	lateral: LATERAL,
	bobRate: 17,
	bobAmp: 0.09,
};
const CYCLING: WalkerKind = {
	speed: [4, 5.5],
	lateral: 0.3,
	bobRate: 0,
	bobAmp: 0,
};

/** Scatters `count` walkers of one kind over the sidewalk network, weighted by sidewalk length. */
function spawnWalkers(
	net: Net,
	rng: Rng,
	kind: WalkerKind,
	count: number,
	first: number,
): Walker[] {
	const sumLen = net.lines.reduce((a, l) => a + l.length, 0);
	const tangent = new Vector3();
	const walkers: Walker[] = [];
	for (let i = 0; i < count; i++) {
		let pick = rng.range(0, sumLen);
		let li = 0;
		while (
			li < net.lines.length - 1 &&
			pick > (net.lines[li] as Polyline).length
		) {
			pick -= (net.lines[li] as Polyline).length;
			li += 1;
		}
		const line = net.lines[li] as Polyline;
		const s = rng.range(0, line.length);
		const dir = rng.range(0, 1) < 0.5 ? 1 : -1;
		const lat = rng.range(-kind.lateral, kind.lateral);
		line.tangentAt(s, tangent);
		walkers.push({
			index: first + i,
			line: li,
			s,
			dir,
			speed: rng.range(kind.speed[0], kind.speed[1]),
			lat,
			ox: -tangent.z * lat,
			oz: tangent.x * lat,
			yaw: Math.atan2(tangent.x * dir, tangent.z * dir),
			bobRate: kind.bobRate,
			bobAmp: kind.bobAmp,
		});
	}
	return walkers;
}

export function createPeople(ctx: BuildContext): void {
	const { rng } = ctx;
	const rnd = mulberry32(Math.floor(rng() * 0x100000000));
	const net = buildNet(ctx.sidewalks);
	const loop = ctx.residentialLoop;
	const park = ctx.parkLoop;

	const hasNet = net.lines.length > 0;
	const nWalk = hasNet ? scaled(232, ctx.density) : 0;
	const nJog = hasNet ? scaled(28, ctx.density) : 0;
	const nCyclists = hasNet ? scaled(6, ctx.density) : 0;
	const nStreet = nWalk + nJog;
	const nRes =
		loop && ctx.residentialDoors.length > 0 ? scaled(20, ctx.density) : 0;
	const nPark = park ? scaled(4, ctx.density) : 0;
	const total = nStreet + nRes + nPark;
	if (total === 0 && nCyclists === 0) return;

	const people = new Pool(person(), MAT_INSTANCED, total);
	for (let i = 0; i < total; i++)
		people.color(i, rng.pick(i >= nWalk && i < nStreet ? BRIGHTS : SHIRTS));
	const parts: Agent[] = [];
	const pools = [people];
	const scratch = new Vector3();
	const tangent = new Vector3();

	if (nStreet > 0) {
		const walkers = [
			...spawnWalkers(net, rng, WALKING, nWalk, 0),
			...spawnWalkers(net, rng, JOGGING, nJog, nWalk),
		];
		parts.push(new StreetWalkers(net, walkers, people, rnd));
	}

	if (nCyclists > 0) {
		const bikes = new Pool(cyclist(), MAT_INSTANCED, nCyclists);
		for (let i = 0; i < nCyclists; i++) bikes.color(i, rng.pick(BRIGHTS));
		parts.push(
			new StreetWalkers(
				net,
				spawnWalkers(net, rng, CYCLING, nCyclists, 0),
				bikes,
				rnd,
			),
		);
		pools.push(bikes);
		ctx.group.add(bikes.mesh);
	}

	if (loop && nRes > 0) {
		const doors = ctx.residentialDoors;
		const residents: Resident[] = [];
		for (let i = 0; i < nRes; i++) {
			const door = doors[i % doors.length] as Vector3;
			const near = nearestOnLine(loop, door);
			const lat = rng.range(-LATERAL, LATERAL);
			loop.pointAt(near.s, scratch);
			loop.tangentAt(near.s, tangent);
			const join = new Vector3(
				scratch.x - tangent.z * lat,
				scratch.y,
				scratch.z + tangent.x * lat,
			);
			const outYaw = Math.atan2(join.x - door.x, join.z - door.z);
			residents.push({
				index: nStreet + i,
				door,
				join,
				joinS: near.s,
				outYaw,
				walkLen: Math.max(0.1, door.distanceTo(join)),
				phase: HIDDEN,
				timer: rng.range(4, 14),
				u: 0,
				s: near.s,
				dir: 1,
				speed: rng.range(1.2, 1.6),
				lat,
				yaw: outYaw,
			});
		}
		parts.push(new Residents(loop, residents, people, rnd));
	}

	if (park && nPark > 0) {
		const dogPool = new Pool(dog(), MAT_INSTANCED, nPark);
		const s: number[] = [];
		const dirs: (1 | -1)[] = [];
		for (let i = 0; i < nPark; i++) {
			s.push(((i + rng.range(0, 0.5)) / nPark) * park.length);
			dirs.push(i % 2 === 0 ? 1 : -1);
		}
		parts.push(
			new ParkStrollers(park, s, dirs, nStreet + nRes, people, dogPool),
		);
		pools.push(dogPool);
		ctx.group.add(dogPool.mesh);
	}

	ctx.group.add(people.mesh);
	ctx.agents.push(new PeopleAgent(parts, pools));
}
