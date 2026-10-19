import { Vector3 } from "three";

/** Arc-length parameterised polyline; wraps when closed, clamps when open. */
export class Polyline {
	readonly points: Vector3[];
	readonly closed: boolean;
	readonly length: number;
	private readonly cumulative: number[];

	constructor(points: Vector3[], closed: boolean) {
		if (points.length < 2) throw new Error("Polyline needs ≥ 2 points");
		this.points = points;
		this.closed = closed;
		const n = closed ? points.length : points.length - 1;
		const cum = [0];
		let total = 0;
		for (let i = 0; i < n; i++) {
			const a = points[i] as Vector3;
			const b = points[(i + 1) % points.length] as Vector3;
			total += a.distanceTo(b);
			cum.push(total);
		}
		this.cumulative = cum;
		this.length = total;
	}

	get start(): Vector3 {
		return this.points[0] as Vector3;
	}

	get end(): Vector3 {
		return this.points[this.closed ? 0 : this.points.length - 1] as Vector3;
	}

	private wrap(s: number): number {
		if (this.closed) return ((s % this.length) + this.length) % this.length;
		return Math.min(Math.max(s, 0), this.length);
	}

	private segment(s: number): number {
		const cum = this.cumulative;
		let lo = 0;
		let hi = cum.length - 2;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if ((cum[mid] as number) <= s) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	}

	pointAt(s: number, out: Vector3): Vector3 {
		const w = this.wrap(s);
		const i = this.segment(w);
		const a = this.points[i] as Vector3;
		const b = this.points[(i + 1) % this.points.length] as Vector3;
		const s0 = this.cumulative[i] as number;
		const len = (this.cumulative[i + 1] as number) - s0;
		return out.copy(a).lerp(b, len > 0 ? (w - s0) / len : 0);
	}

	tangentAt(s: number, out: Vector3): Vector3 {
		const w = this.wrap(s);
		const i = this.segment(w);
		const a = this.points[i] as Vector3;
		const b = this.points[(i + 1) % this.points.length] as Vector3;
		return out.subVectors(b, a).normalize();
	}

	/** Arc length of the vertex closest to `p`. */
	nearestS(p: Vector3): number {
		let best = 0;
		let bestD = Number.POSITIVE_INFINITY;
		const n = this.closed ? this.points.length : this.points.length;
		for (let i = 0; i < n; i++) {
			const d = (this.points[i] as Vector3).distanceToSquared(p);
			if (d < bestD) {
				bestD = d;
				best = this.cumulative[i] as number;
			}
		}
		return best;
	}
}

/** Cut every corner of a closed polygon by `r` metres so vehicles turn smoothly. */
export function chamfer(points: Vector3[], r: number): Vector3[] {
	const out: Vector3[] = [];
	const n = points.length;
	for (let i = 0; i < n; i++) {
		const prev = points[(i - 1 + n) % n] as Vector3;
		const cur = points[i] as Vector3;
		const next = points[(i + 1) % n] as Vector3;
		const toPrev = prev.clone().sub(cur);
		const toNext = next.clone().sub(cur);
		const a = Math.min(r, toPrev.length() / 2);
		const b = Math.min(r, toNext.length() / 2);
		out.push(cur.clone().addScaledVector(toPrev.normalize(), a));
		out.push(cur.clone().addScaledVector(toNext.normalize(), b));
	}
	return out;
}

/** Axis-aligned rectangle loop at height y; clockwise when seen from above (+Y). */
export function rectLoop(
	minX: number,
	maxX: number,
	minZ: number,
	maxZ: number,
	y: number,
	clockwise = true,
): Vector3[] {
	// Seen from +Y with +X east and +Z south, clockwise is N edge west→east first.
	const pts = [
		new Vector3(minX, y, minZ),
		new Vector3(maxX, y, minZ),
		new Vector3(maxX, y, maxZ),
		new Vector3(minX, y, maxZ),
	];
	return clockwise ? pts : pts.reverse();
}
