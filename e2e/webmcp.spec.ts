import type { Page } from "@playwright/test";
import { expect, openCity, test } from "./helpers";

test.skip(({ isMobile }) => isMobile, "desktop interactions");

const TOOLS = [
	"get_city_state",
	"focus_district",
	"set_view",
	"reset_view",
	"open_district",
	"close_district",
	"highlight_district",
	"set_time_of_day",
	"control_simulation",
	"show_message",
	"run_tour",
	"get_city_events",
	"stage_event",
	"highlight_spot",
	"get_profile",
	"list_districts",
	"get_district_content",
	"search_cv",
	"list_experience",
	"list_skills",
	"list_projects",
	"get_contact",
	"get_site_guide",
];

function toolNames(page: Page): Promise<string[]> {
	return page.evaluate(async () => {
		const tools = await document.modelContext?.getTools();
		return tools?.map((t) => t.name) ?? [];
	});
}

/** Calls a page tool through WebMCP, as a browser agent would. */
function executeTool(
	page: Page,
	name: string,
	input: object,
): Promise<Record<string, unknown>> {
	return page.evaluate(
		async ([toolName, toolInput]) => {
			const ctx = document.modelContext;
			if (!ctx) throw new Error("no document.modelContext");
			const tool = (await ctx.getTools()).find((t) => t.name === toolName);
			if (!tool) throw new Error(`missing tool ${toolName}`);
			return JSON.parse(await ctx.executeTool(tool, toolInput));
		},
		[name, input] as const,
	);
}

test("the city registers its WebMCP tools and agents can drive it", async ({
	page,
}) => {
	await openCity(page);
	await expect
		.poll(() => toolNames(page), { timeout: 30_000 })
		.toContain("open_district");
	expect((await toolNames(page)).sort()).toEqual([...TOOLS].sort());

	expect(
		await executeTool(page, "open_district", { district: "beach" }),
	).toEqual({ ok: true, title: "About me" });
	const card = page.getByTestId("zone-card");
	await expect(card.getByRole("heading", { name: "About me" })).toBeVisible();
	expect(await executeTool(page, "close_district", {})).toEqual({ ok: true });
	await expect(card).toBeHidden();

	expect(
		await executeTool(page, "focus_district", { district: "downtown" }),
	).toEqual({ ok: true });
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const t = window.__city?.cameraTarget();
					return t
						? Math.hypot(t.x + 58.5, t.z + 58.5)
						: Number.POSITIVE_INFINITY;
				}),
			{ timeout: 5_000 },
		)
		.toBeLessThan(2);

	await executeTool(page, "set_time_of_day", { mode: "night" });
	await expect(page.getByTestId("time-toggle")).toContainText("NIGHT");

	await executeTool(page, "show_message", {
		text: "Hello from MCP",
		seconds: 0,
	});
	const notice = page.getByTestId("agent-notice");
	await expect(notice).toContainText("Hello from MCP");
	await page.getByRole("button", { name: "Dismiss" }).click();
	await expect(notice).toBeHidden();

	const feed = await executeTool(page, "get_city_events", {});
	expect(feed.stages).toEqual(
		expect.arrayContaining([
			"fire_flare_up",
			"dispatch_fire_engine",
			"launch_helicopter",
			"park_festival",
		]),
	);
	expect(
		await executeTool(page, "stage_event", { kind: "park_festival" }),
	).toMatchObject({ ok: true });
	const after = await executeTool(page, "get_city_events", {
		since: Number(feed.lastId),
	});
	expect(after.events).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ kind: "festival_started" }),
		]),
	);
	expect(
		await executeTool(page, "highlight_spot", { landmark: "park_bandstand" }),
	).toEqual({ ok: true });

	const profile = await executeTool(page, "get_profile", {});
	expect(profile).toMatchObject({ kind: "profile", name: "Adam Rais" });
});
