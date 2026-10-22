import { Store } from "@tanstack/store";
import type { DisasterState } from "#/city/disasters/director";
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
	/** Message bubble shown by an agent through the `show_message` / `run_tour` tools. */
	notice: AgentNoticeState | null;
	/** The disaster playing in the city (Events menu, stage_event, stage_custom_event), if any. */
	disaster: DisasterState | null;
}

export interface AgentNoticeState {
	id: number;
	title?: string;
	text: string;
}

export const INITIAL_UI: UiState = {
	tier: "pending",
	ready: false,
	hovered: null,
	selected: null,
	interacted: false,
	isDesktop: true,
	timeMode: "auto",
	isNight: false,
	viewVersion: 0,
	notice: null,
	disaster: null,
};

export const uiStore = new Store<UiState>({ ...INITIAL_UI });

export function setUi(patch: Partial<UiState>): void {
	uiStore.setState((s) => ({ ...s, ...patch }));
}
