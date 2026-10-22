import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { DISASTER_PRESETS } from "#/city/disasters/presets";
import type { EventSpec } from "#/city/disasters/spec";
import { CityEvents } from "#/city/events";
import { INITIAL_UI, setUi, uiStore } from "#/store/ui";
import { CLIENT_TOOLS, NO_CITY } from "./client-tools";
import type { CityControls, CityToolContext } from "./context";
import { widgetResultSchema } from "./schemas";

interface FakeWorld extends CityControls {
	focusZone: Mock<CityControls["focusZone"]>;
	setPaused: Mock<CityControls["setPaused"]>;
	setSpeed: Mock<CityControls["setSpeed"]>;
	highlightSpot: Mock<CityControls["highlightSpot"]>;
	clearSpot: Mock<CityControls["clearSpot"]>;
	stageCustomEvent: Mock<CityControls["stageCustomEvent"]>;
	log: CityEvents;
}

interface FakeContext extends CityToolContext {
	select: Mock<CityToolContext["select"]>;
	hover: Mock<CityToolContext["hover"]>;
}

function fakeWorld(): FakeWorld {
	const log = new CityEvents();
	log.landmark({ id: "helipad", name: "Helipad", x: 40, z: -40, radius: 6 });
	log.onStage("park_festival", () => {
		log.emit("festival_started", "Party in {where}", 0, 0);
		return { ok: true, text: "Party" };
	});
	return {
		log,
		focusZone: vi.fn(),
		setView: (v) => ({ x: v.x ?? 0, z: v.z ?? 0, zoom: v.zoom ?? 1 }),
		resetView: vi.fn(),
		setPaused: vi.fn(),
		setSpeed: vi.fn(),
		zoneScreenPoint: () => ({ x: 10, y: 20 }),
		getView: () => ({ x: 0, z: 0, zoom: 1 }),
		getSimulation: () => ({ paused: false, speed: 2, simTime: 0, agents: 3 }),
		getEvents: (since, limit) => ({
			events: log.since(since, limit),
			lastId: log.lastId,
		}),
		landmarks: () => log.landmarks(),
		stageKinds: () => log.stageKinds(),
		stageEvent: (kind) => log.stage(kind),
		stageCustomEvent: vi.fn((spec: unknown) => ({
			ok: true,
			text: `Staged ${(spec as EventSpec).name}`,
		})),
		getDisaster: () => null,
		highlightSpot: vi.fn(
			(target: Parameters<CityControls["highlightSpot"]>[0]) =>
				!("landmark" in target) ||
				log.getLandmark(target.landmark) !== undefined,
		),
		clearSpot: vi.fn(),
	};
}

function makeContext(world: FakeWorld | null): FakeContext {
	return { world: () => world, select: vi.fn(), hover: vi.fn() };
}

/** Runs a tool the way WebMCP does: input parsed by its schema, then `execute`, then output parsed. */
async function run(
	name: string,
	input: unknown,
	context: CityToolContext,
): Promise<Record<string, unknown>> {
	const tool = CLIENT_TOOLS.find((t) => t.name === name);
	if (!tool?.execute) throw new Error(`no tool ${name}`);
	const args = tool.inputSchema.parse(input);
	const out = await Reflect.apply(tool.execute, undefined, [args, { context }]);
	return tool.outputSchema.parse(out);
}

beforeEach(() => {
	uiStore.setState(() => ({ ...INITIAL_UI }));
});

describe("city tools", () => {
	it("open_district opens the card and returns its title", async () => {
		const ctx = makeContext(null);
		const out = await run("open_district", { district: "beach" }, ctx);
		expect(ctx.select).toHaveBeenCalledWith("beach");
		expect(out).toEqual({ ok: true, title: "About me" });
	});

	it("refuses HUD tools on the static fallback", async () => {
		setUi({ tier: "fallback" });
		const ctx = makeContext(null);
		const out = await run("open_district", { district: "beach" }, ctx);
		expect(out.ok).toBe(false);
		expect(ctx.select).not.toHaveBeenCalled();
	});

	it("camera tools need the running city", async () => {
		const out = await run(
			"focus_district",
			{ district: "downtown" },
			makeContext(null),
		);
		expect(out).toEqual({ ok: false, error: NO_CITY });
	});

	it("focus_district flies to the district with the default zoom", async () => {
		const world = fakeWorld();
		const out = await run(
			"focus_district",
			{ district: "downtown" },
			makeContext(world),
		);
		expect(out).toEqual({ ok: true });
		expect(world.focusZone).toHaveBeenCalledWith("downtown", 2.2);
	});

	it("control_simulation forwards pause and speed", async () => {
		const world = fakeWorld();
		const out = await run(
			"control_simulation",
			{ paused: true, speed: 2 },
			makeContext(world),
		);
		expect(world.setPaused).toHaveBeenCalledWith(true);
		expect(world.setSpeed).toHaveBeenCalledWith(2);
		expect(out).toEqual({ ok: true, paused: false, speed: 2 });
	});

	it("rejects out-of-range input before running", async () => {
		const world = fakeWorld();
		await expect(
			run("control_simulation", { speed: 10 }, makeContext(world)),
		).rejects.toThrow();
		expect(world.setSpeed).not.toHaveBeenCalled();
	});

	it("set_time_of_day updates the store", async () => {
		await run("set_time_of_day", { mode: "night" }, makeContext(null));
		expect(uiStore.state.timeMode).toBe("night");
	});

	it("show_message with 0 seconds stays until dismissed; otherwise it expires", async () => {
		vi.useFakeTimers();
		try {
			await run("show_message", { text: "hi", seconds: 0 }, makeContext(null));
			vi.advanceTimersByTime(120_000);
			expect(uiStore.state.notice?.text).toBe("hi");
			await run("show_message", { text: "bye", seconds: 1 }, makeContext(null));
			expect(uiStore.state.notice?.text).toBe("bye");
			vi.advanceTimersByTime(1_000);
			expect(uiStore.state.notice).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("get_city_state reports every district and the live view", async () => {
		const out = await run("get_city_state", {}, makeContext(fakeWorld()));
		expect(out.districts).toHaveLength(7);
		expect(out.view).toEqual({ x: 0, z: 0, zoom: 1 });
	});

	it("run_tour visits each stop and clears the highlight", async () => {
		vi.useFakeTimers();
		try {
			const world = fakeWorld();
			const ctx = makeContext(world);
			const done = run(
				"run_tour",
				{
					stops: [
						{ district: "downtown", seconds: 1 },
						{ district: "themepark", caption: "Side projects", seconds: 1 },
					],
				},
				ctx,
			);
			await vi.advanceTimersByTimeAsync(1_000);
			expect(uiStore.state.notice?.text).toBe("Side projects");
			await vi.advanceTimersByTimeAsync(1_000);
			expect(await done).toEqual({ ok: true, stops: 2 });
			expect(world.focusZone.mock.calls.map((c) => c[0])).toEqual([
				"downtown",
				"themepark",
			]);
			expect(ctx.hover).toHaveBeenLastCalledWith(null);
		} finally {
			vi.useRealTimers();
		}
	});

	it("a new tour replaces the running one without clearing its highlight", async () => {
		vi.useFakeTimers();
		try {
			const ctx = makeContext(fakeWorld());
			const first = run(
				"run_tour",
				{ stops: [{ district: "downtown", seconds: 8 }] },
				ctx,
			);
			await vi.advanceTimersByTimeAsync(100);
			const second = run(
				"run_tour",
				{ stops: [{ district: "beach", seconds: 1 }] },
				ctx,
			);
			expect(await first).toEqual({ ok: true, stops: 0, aborted: true });
			expect(ctx.hover).toHaveBeenLastCalledWith("beach");
			await vi.advanceTimersByTimeAsync(1_000);
			expect(await second).toEqual({ ok: true, stops: 1 });
			expect(ctx.hover).toHaveBeenLastCalledWith(null);
		} finally {
			vi.useRealTimers();
		}
	});

	it("stage_event runs a stage and get_city_events pages the log", async () => {
		const world = fakeWorld();
		const ctx = makeContext(world);
		expect(await run("stage_event", { kind: "park_festival" }, ctx)).toEqual({
			ok: true,
			text: "Party",
		});
		const feed = await run("get_city_events", {}, ctx);
		expect(feed).toMatchObject({
			ok: true,
			lastId: 1,
			stages: ["park_festival"],
			events: [{ kind: "festival_started", text: "Party in the city" }],
		});
		const newer = await run("get_city_events", { since: 1 }, ctx);
		expect(newer.events).toEqual([]);
		expect(
			await run("stage_event", { kind: "launch_helicopter" }, ctx),
		).toMatchObject({
			ok: false,
		});
	});

	it("stage_custom_event hands a validated spec to the city", async () => {
		const world = fakeWorld();
		const ctx = makeContext(world);
		expect(
			await run("stage_custom_event", DISASTER_PRESETS.tornado, ctx),
		).toEqual({ ok: true, text: "Staged Tornado" });
		const spec = world.stageCustomEvent.mock.calls[0]?.[0] as EventSpec;
		expect(spec.effects[0]?.kind).toBe("crush");
		expect(spec.motion.waypoints).toHaveLength(4);
		expect(
			await run(
				"stage_custom_event",
				DISASTER_PRESETS.tsunami,
				makeContext(null),
			),
		).toEqual({ ok: false, error: NO_CITY });
	});

	it("highlight_spot rings a landmark or a point, and clears", async () => {
		const world = fakeWorld();
		const ctx = makeContext(world);
		expect(await run("highlight_spot", { landmark: "helipad" }, ctx)).toEqual({
			ok: true,
		});
		expect(world.highlightSpot).toHaveBeenLastCalledWith(
			{ landmark: "helipad" },
			8,
		);
		expect((await run("highlight_spot", { landmark: "moon" }, ctx)).ok).toBe(
			false,
		);
		await run("highlight_spot", { x: 5, z: 6, radius: 10, seconds: 0 }, ctx);
		expect(world.highlightSpot).toHaveBeenLastCalledWith(
			{ x: 5, z: 6, radius: 10 },
			0,
		);
		expect((await run("highlight_spot", { x: 5 }, ctx)).ok).toBe(false);
		await run("highlight_spot", {}, ctx);
		expect(world.clearSpot).toHaveBeenCalled();
	});

	it("keeps a tour under the 60 s client timeout", async () => {
		await expect(
			run(
				"run_tour",
				{ stops: [{ district: "downtown", seconds: 20 }] },
				makeContext(fakeWorld()),
			),
		).rejects.toThrow();
	});
});

describe("data tools", () => {
	it.each([
		["get_profile", {}],
		["get_district_content", { district: "themepark" }],
		["search_cv", { query: "Rust" }],
		["list_experience", {}],
		["list_skills", {}],
		["list_projects", {}],
	])("%s returns a result the widget renders", async (name, input) => {
		const out = await run(name, input, makeContext(null));
		expect(widgetResultSchema.safeParse(out).success).toBe(true);
	});
});
