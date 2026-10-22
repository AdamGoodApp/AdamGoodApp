import type { BufferGeometry } from "three";

/** Vertex indices into a merged mesh's attributes. */
export interface VertexRange {
	start: number;
	count: number;
}

/** One kit building: its lot, its height, and where it sits in the merged meshes. */
export interface BuildingRecord {
	id: number;
	x: number;
	z: number;
	w: number;
	d: number;
	h: number;
	ry: number;
	statics: VertexRange | null;
	facades: VertexRange[];
}

interface Pending {
	record: BuildingRecord;
	statics: BufferGeometry | null;
	facades: BufferGeometry[];
}

function topOf(geos: readonly BufferGeometry[]): number {
	let top = 0;
	for (const g of geos) {
		g.computeBoundingBox();
		top = Math.max(top, g.boundingBox?.max.y ?? 0);
	}
	return top;
}

/**
 * Collects what every kit building pushed into the statics and facade lists
 * (`emit` in kit/buildings.ts) so, once the lists are merged into two meshes,
 * each building's vertices can still be found and animated.
 */
export class BuildingRegistry {
	private readonly pending: Pending[] = [];

	add(b: {
		x: number;
		z: number;
		w: number;
		d: number;
		ry: number;
		statics: BufferGeometry | null;
		facades: BufferGeometry[];
	}): void {
		// The walls give the storey height; the statics add roof tanks and spires.
		const h = topOf(
			b.facades.length ? b.facades : b.statics ? [b.statics] : [],
		);
		this.pending.push({
			record: {
				id: this.pending.length + 1,
				x: b.x,
				z: b.z,
				w: b.w,
				d: b.d,
				h,
				ry: b.ry,
				statics: null,
				facades: [],
			},
			statics: b.statics,
			facades: b.facades,
		});
	}

	/**
	 * Vertex ranges of every registered geometry in the lists, in merge order.
	 * Must run before `merge()` disposes the inputs. A geometry missing from
	 * the lists simply has no range.
	 */
	resolve(
		statics: readonly BufferGeometry[],
		facades: readonly BufferGeometry[],
	): BuildingIndex {
		const ranges = (list: readonly BufferGeometry[]) => {
			const map = new Map<BufferGeometry, VertexRange>();
			let start = 0;
			for (const g of list) {
				const count = g.getAttribute("position").count;
				map.set(g, { start, count });
				start += count;
			}
			return map;
		};
		const staticRanges = ranges(statics);
		const facadeRanges = ranges(facades);
		const records = this.pending.map(({ record, statics: s, facades: fs }) => ({
			...record,
			statics: s ? (staticRanges.get(s) ?? null) : null,
			facades: fs.flatMap((f) => {
				const r = facadeRanges.get(f);
				return r ? [r] : [];
			}),
		}));
		return new BuildingIndex(records);
	}
}

/** Spatial queries over the registered buildings (centre distances on the ground). */
export class BuildingIndex {
	constructor(readonly records: readonly BuildingRecord[]) {}

	within(x: number, z: number, radius: number): BuildingRecord[] {
		const r2 = radius * radius;
		return this.records.filter((b) => (b.x - x) ** 2 + (b.z - z) ** 2 <= r2);
	}

	nearest(
		x: number,
		z: number,
		radius: number,
		ok: (b: BuildingRecord) => boolean,
	): BuildingRecord | null {
		let best: BuildingRecord | null = null;
		let bestD = radius * radius;
		for (const b of this.records) {
			const d = (b.x - x) ** 2 + (b.z - z) ** 2;
			if (d <= bestD && ok(b)) {
				best = b;
				bestD = d;
			}
		}
		return best;
	}

	byDistance(x: number, z: number, radius: number): BuildingRecord[] {
		const d = (b: BuildingRecord) => (b.x - x) ** 2 + (b.z - z) ** 2;
		return this.within(x, z, radius).sort((a, b) => d(a) - d(b));
	}
}
