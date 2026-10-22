import { Color, type DirectionalLight, type HemisphereLight } from "three";
import { uniform } from "three/tsl";

export type TimeMode = "auto" | "day" | "night";

/**
 * Simulation time in seconds as a shader uniform. Advanced only by the fixed
 * step in `CityWorld.tick`, so pausing (hidden tab, reduced motion) also
 * freezes shader animation instead of letting it jump on the next render.
 */
export const simClock = uniform(0);
/** 0 = full day, 1 = full night. Drives emissive windows, lamps, sky and bloom. */
export const night = uniform(0);
export const skyTop = uniform(new Color());
export const skyBottom = uniform(new Color());
export const bloomStrength = uniform(0);
/** 0 = the sky, 1 = black space (a black hole has swallowed the city). */
export const voidMix = uniform(0);

/** Seconds for one full day in auto mode. */
const DAY_LENGTH = 180;
/** Seconds a manual day/night switch takes to blend. */
const BLEND_SECONDS = 2.5;

/** Night factor over the cycle: day, dusk, night, dawn. */
export function nightAt(phase: number): number {
	const p = phase - Math.floor(phase);
	if (p < 0.55) return 0;
	if (p < 0.65) return smooth((p - 0.55) / 0.1);
	if (p < 0.92) return 1;
	return 1 - smooth((p - 0.92) / 0.08);
}

function smooth(t: number): number {
	return t * t * (3 - 2 * t);
}

const SUN_DAY = new Color(0xfff2d6);
const SUN_DUSK = new Color(0xff9a5c);
const MOON = new Color(0x9fb4ff);
const HEMI_SKY_DAY = new Color(0xbfe3ff);
const HEMI_SKY_NIGHT = new Color(0x2a3d6b);
const HEMI_GROUND_DAY = new Color(0xcfe9b8);
const HEMI_GROUND_NIGHT = new Color(0x141b2e);
const SKY_TOP_DAY = new Color(0x86c5fb);
const SKY_TOP_NIGHT = new Color(0x050a1a);
const SKY_BOTTOM_DAY = new Color(0xe6f4ff);
const SKY_BOTTOM_DUSK = new Color(0xffb784);
const SKY_BOTTOM_NIGHT = new Color(0x1a2a52);
const tmp = new Color();

export class DayNight {
	private phase = 0.2;
	private mode: TimeMode = "auto";
	private value = 0;
	private isNight = false;

	constructor(
		private readonly sun: DirectionalLight,
		private readonly hemi: HemisphereLight,
		/** Called whenever the scene crosses from day to night or back. */
		private readonly onNightChange: (isNight: boolean) => void,
	) {
		this.apply();
	}

	setMode(mode: TimeMode): void {
		this.mode = mode;
	}

	/** Advance the cycle; returns true while the lighting is still changing. */
	update(dt: number, advance: boolean): boolean {
		if (advance && this.mode === "auto") this.phase += dt / DAY_LENGTH;
		const target =
			this.mode === "auto"
				? nightAt(this.phase)
				: this.mode === "night"
					? 1
					: 0;
		const prev = this.value;
		const step = dt / BLEND_SECONDS;
		this.value += Math.max(-step, Math.min(step, target - prev));
		if (this.value === prev) return false;
		this.apply();
		return true;
	}

	private apply(): void {
		const n = this.value;
		if (n >= 0.5 !== this.isNight) {
			this.isNight = n >= 0.5;
			this.onNightChange(this.isNight);
		}
		const dusk = 1 - Math.abs(2 * n - 1);
		night.value = n;
		bloomStrength.value = 0.1 + 0.35 * n;

		this.sun.intensity = 2.2 + (0.6 - 2.2) * n;
		this.sun.color
			.copy(SUN_DAY)
			.lerp(MOON, n)
			.lerp(SUN_DUSK, dusk * 0.6);
		this.hemi.intensity = 0.9 + (0.65 - 0.9) * n;
		this.hemi.color.copy(HEMI_SKY_DAY).lerp(HEMI_SKY_NIGHT, n);
		this.hemi.groundColor.copy(HEMI_GROUND_DAY).lerp(HEMI_GROUND_NIGHT, n);

		skyTop.value.copy(SKY_TOP_DAY).lerp(SKY_TOP_NIGHT, n);
		tmp.copy(SKY_BOTTOM_DAY).lerp(SKY_BOTTOM_NIGHT, n);
		skyBottom.value.copy(tmp.lerp(SKY_BOTTOM_DUSK, dusk * 0.7));
	}
}
