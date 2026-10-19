import { Store } from "@tanstack/store";
import type { TimeMode } from "#/city/env";
import type { ZoneId } from "#/data/zones";

export type RendererTier = "pending" | "webgpu" | "webgl2" | "fallback";

export interface UiState {
	tier: RendererTier;
	ready: boolean;
	hovered: ZoneId | null;
	selected: ZoneId | null;
	interacted: boolean;
	isDesktop: boolean;
	timeMode: TimeMode;
	/** What the scene currently shows (night factor ≥ 0.5), whatever the mode. */
	isNight: boolean;
	/** Bumped whenever the camera view changes, so screen-anchored HUD re-measures. */
	viewVersion: number;
}

export const uiStore = new Store<UiState>({
	tier: "pending",
	ready: false,
	hovered: null,
	selected: null,
	interacted: false,
	isDesktop: true,
	timeMode: "auto",
	isNight: false,
	viewVersion: 0,
});

export function setUi(patch: Partial<UiState>): void {
	uiStore.setState((s) => ({ ...s, ...patch }));
}
