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
}

export const uiStore = new Store<UiState>({
	tier: "pending",
	ready: false,
	hovered: null,
	selected: null,
	interacted: false,
	isDesktop: true,
	timeMode: "auto",
});

export function setUi(patch: Partial<UiState>): void {
	uiStore.setState((s) => ({ ...s, ...patch }));
}
