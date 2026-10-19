import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { INITIAL_UI, setUi, uiStore } from "#/store/ui";
import { CLIENT_TOOLS, NO_CITY } from "./client-tools";
import type { CityControls, CityToolContext } from "./context";
import { widgetResultSchema } from "./schemas";

interface FakeWorld extends CityControls {
	focusZone: Mock<CityControls["focusZone"]>;
	setPaused: Mock<CityControls["setPaused"]>;
	setSpeed: Mock<CityControls["setSpeed"]>;
}

interface FakeContext extends CityToolContext {
	select: Mock<CityToolContext["select"]>;
	hover: Mock<CityToolContext["hover"]>;
}

function fakeWorld(): FakeWorld {
	return {
		focusZone: vi.fn(),
		setView: vi.fn(),
		resetView: vi.fn(),
		setPaused: vi.fn(),
		setSpeed: vi.fn(),
		zoneScreenPoint: () => ({ x: 10, y: 20 }),
		getView: () => ({ x: 0, z: 0, zoom: 1 }),
		getSimulation: () => ({ paused: false, speed: 2, simTime: 0, agents: 3 }),
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
