export interface Rng {
	(): number;
	range(min: number, max: number): number;
	int(min: number, max: number): number;
	pick<T>(items: readonly T[]): T;
}

export const WORLD_SEED = 0xada2026;

/** Deterministic PRNG (mulberry32) so the city is identical on every load. */
export function mulberry32(seed: number): Rng {
	let a = seed >>> 0;
	const next = () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const rng = next as Rng;
	rng.range = (min, max) => min + next() * (max - min);
	rng.int = (min, max) => Math.floor(min + next() * (max - min + 1));
	rng.pick = (items) => items[Math.floor(next() * items.length)] as never;
	return rng;
}
