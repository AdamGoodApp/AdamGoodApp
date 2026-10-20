import { CV } from "#/data/cv";
import { ZONE_BY_ID, ZONES } from "#/data/zones";
import { setUi, uiStore } from "#/store/ui";
import type { CityControls, CityToolContext } from "./context";
import { DATA_TOOL_BODIES } from "./data-tools";
import {
	closeDistrict,
	controlSimulation,
	DEFAULT_EVENT_LIMIT,
	DEFAULT_FOCUS_ZOOM,
	DEFAULT_MESSAGE_SECONDS,
	DEFAULT_SPOT_SECONDS,
	DEFAULT_TOUR_SECONDS,
	focusDistrict,
	getCityEvents,
	getCityState,
	getContact,
	getDistrictContent,
	getProfile,
	getSiteGuide,
	highlightDistrict,
	highlightSpot,
	listDistricts,
	listExperience,
	listProjects,
	listSkills,
	openDistrict,
	resetView,
	runTour,
	searchCv,
	setTimeOfDay,
	setView,
	showMessage,
	stageEvent,
	TOOL_META,
} from "./definitions";

export const NO_CITY =
	"The 3D city is not running in this browser (static fallback or still loading)";
const NO_HUD =
	"The interactive city is not shown in this browser (static fallback)";

const noCity = { ok: false, error: NO_CITY } as const;
const noHud = { ok: false, error: NO_HUD } as const;

type Ctx = { context: CityToolContext };

function world(ctx: Ctx): CityControls | null {
	return ctx.context.world();
}

function isFallback(): boolean {
	return uiStore.state.tier === "fallback";
}

let noticeSeq = 0;
let activeTour: AbortController | null = null;

/** Show the message bubble; `seconds > 0` hides it later unless replaced. */
function notify(
	text: string,
	title: string | undefined,
	seconds: number,
): void {
	const id = ++noticeSeq;
	setUi({ notice: { id, text, ...(title ? { title } : {}) } });
	if (seconds > 0) {
		setTimeout(() => {
			if (uiStore.state.notice?.id === id) setUi({ notice: null });
		}, seconds * 1000);
	}
}

/** Resolves after `ms`, or as soon as `signal` aborts. */
function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	if (signal?.aborted) {
		resolve();
		return promise;
	}
	const done = () => {
		clearTimeout(timer);
		signal?.removeEventListener("abort", done);
		resolve();
	};
	const timer = setTimeout(done, ms);
	signal?.addEventListener("abort", done, { once: true });
	return promise;
}

export const CLIENT_TOOLS = [
	getCityState.client<CityToolContext>((_input, ctx) => {
		const s = uiStore.state;
		const w = world(ctx);
		return {
			ok: true,
			ready: s.ready,
			tier: s.tier,
			isDesktop: s.isDesktop,
			selected: s.selected,
			hovered: s.hovered,
			timeMode: s.timeMode,
			isNight: s.isNight,
			view: w?.getView() ?? null,
			simulation: w?.getSimulation() ?? null,
			districts: ZONES.map((z) => ({
				id: z.id,
				district: z.district,
				topic: z.topic,
				selected: s.selected === z.id,
				screen: w ? w.zoneScreenPoint(z.id) : null,
			})),
		};
	}),

	focusDistrict.client<CityToolContext>(({ district, zoom }, ctx) => {
		const w = world(ctx);
		if (!w) return noCity;
		w.focusZone(district, zoom ?? DEFAULT_FOCUS_ZOOM);
		return { ok: true };
	}),

	setView.client<CityToolContext>((input, ctx) => {
		const w = world(ctx);
		if (!w) return noCity;
		return { ok: true, view: w.setView(input) };
	}),

	resetView.client<CityToolContext>((_input, ctx) => {
		const w = world(ctx);
		if (!w) return noCity;
		w.resetView();
		return { ok: true };
	}),

	openDistrict.client<CityToolContext>(({ district }, ctx) => {
		if (isFallback()) return noHud;
		ctx.context.select(district);
		return { ok: true, title: CV[district].title };
	}),

	closeDistrict.client<CityToolContext>((_input, ctx) => {
		if (isFallback()) return noHud;
		ctx.context.select(null);
		return { ok: true };
	}),

	highlightDistrict.client<CityToolContext>(({ district }, ctx) => {
		if (!world(ctx)) return noCity;
		ctx.context.hover(district);
		return { ok: true };
	}),

	setTimeOfDay.client<CityToolContext>(({ mode }) => {
		if (isFallback()) return noHud;
		// CityCanvas forwards store changes to the world.
		setUi({ timeMode: mode });
		return { ok: true, mode };
	}),

	controlSimulation.client<CityToolContext>(({ paused, speed }, ctx) => {
		const w = world(ctx);
		if (!w) return noCity;
		if (paused !== undefined) w.setPaused(paused);
		if (speed !== undefined) w.setSpeed(speed);
		const sim = w.getSimulation();
		return { ok: true, paused: sim.paused, speed: sim.speed };
	}),

	showMessage.client<CityToolContext>(({ text, title, seconds }) => {
		if (isFallback()) return noHud;
		notify(text, title, seconds ?? DEFAULT_MESSAGE_SECONDS);
		return { ok: true };
	}),

	runTour.client<CityToolContext>(async ({ stops, zoom }, ctx) => {
		const w = world(ctx);
		if (!w) return noCity;
		// A new tour (e.g. an agent retrying after a timeout) replaces the running one.
		activeTour?.abort();
		const tour = new AbortController();
		activeTour = tour;
		const signal = ctx.abortSignal
			? AbortSignal.any([tour.signal, ctx.abortSignal])
			: tour.signal;
		let done = 0;
		try {
			for (const stop of stops) {
				if (signal.aborted) break;
				const zone = ZONE_BY_ID[stop.district];
				const seconds = stop.seconds ?? DEFAULT_TOUR_SECONDS;
				w.focusZone(stop.district, zoom ?? DEFAULT_FOCUS_ZOOM);
				ctx.context.hover(stop.district);
				notify(
					stop.caption ?? CV[stop.district].tagline,
					`${zone.district} · ${zone.topic}`,
					seconds + 0.5,
				);
				await wait(seconds * 1000, signal);
				if (signal.aborted) break;
				done++;
			}
		} finally {
			if (activeTour === tour) {
				activeTour = null;
				ctx.context.hover(null);
			}
		}
		return signal.aborted
			? { ok: true, stops: done, aborted: true }
			: { ok: true, stops: done };
	}),

	getCityEvents.client<CityToolContext>(({ since, limit }, ctx) => {
		const w = world(ctx);
		if (!w) return noCity;
		const { events, lastId } = w.getEvents(
			since ?? 0,
			limit ?? DEFAULT_EVENT_LIMIT,
		);
		return {
			ok: true,
			lastId,
			simTime: w.getSimulation().simTime,
			events,
			landmarks: w.landmarks(),
			stages: w.stageKinds(),
		};
	}),

	stageEvent.client<CityToolContext>(({ kind }, ctx) => {
		const w = world(ctx);
		if (!w) return noCity;
		const result = w.stageEvent(kind);
		return result.ok
			? { ok: true, text: result.text }
			: { ok: false, error: result.text };
	}),

	highlightSpot.client<CityToolContext>(
		({ landmark, x, z, radius, seconds }, ctx) => {
			const w = world(ctx);
			if (!w) return noCity;
			const time = seconds ?? DEFAULT_SPOT_SECONDS;
			if (landmark !== undefined) {
				return w.highlightSpot({ landmark }, time)
					? { ok: true }
					: { ok: false, error: `Unknown landmark: ${landmark}` };
			}
			if (x !== undefined && z !== undefined) {
				w.highlightSpot({ x, z, ...(radius ? { radius } : {}) }, time);
				return { ok: true };
			}
			if (x !== undefined || z !== undefined)
				return { ok: false, error: "Give both x and z, or a landmark" };
			w.clearSpot();
			return { ok: true };
		},
	),

	getProfile.client<CityToolContext>(DATA_TOOL_BODIES.get_profile),
	listDistricts.client<CityToolContext>(DATA_TOOL_BODIES.list_districts),
	getDistrictContent.client<CityToolContext>(
		DATA_TOOL_BODIES.get_district_content,
	),
	searchCv.client<CityToolContext>(DATA_TOOL_BODIES.search_cv),
	listExperience.client<CityToolContext>(DATA_TOOL_BODIES.list_experience),
	listSkills.client<CityToolContext>(DATA_TOOL_BODIES.list_skills),
	listProjects.client<CityToolContext>(DATA_TOOL_BODIES.list_projects),
	getContact.client<CityToolContext>(DATA_TOOL_BODIES.get_contact),
	getSiteGuide.client<CityToolContext>(DATA_TOOL_BODIES.get_site_guide),
];

export const WEBMCP_TOOL_OPTIONS = Object.fromEntries(
	Object.entries(TOOL_META).map(([name, meta]) => [
		name,
		{ title: meta.title, annotations: { readOnlyHint: meta.readOnly } },
	]),
);
