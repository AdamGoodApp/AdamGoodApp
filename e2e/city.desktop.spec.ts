import AxeBuilder from "@axe-core/playwright";
import { expect, openCity, test, zonePoint } from "./helpers";

test.skip(({ isMobile }) => isMobile, "desktop interactions");

test("hovering and clicking a district opens its card", async ({ page }) => {
	await openCity(page);
	expect(await page.evaluate(() => window.__city?.tier)).toMatch(
		/^(webgpu|webgl2)$/,
	);

	const p = await zonePoint(page, "downtown");
	await page.mouse.move(p.x, p.y);
	await expect(page.getByTestId("hover-label")).toHaveText(
		"DOWNTOWN · EXPERIENCE",
	);

	await page.mouse.click(p.x, p.y);
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByRole("heading", { name: "Experience" }),
	).toBeVisible();
	await expect(dialog.getByRole("tab", { name: "Tofu" })).toBeVisible();

	const axe = await new AxeBuilder({ page })
		.include('[role="dialog"]')
		.analyze();
	expect(
		axe.violations.filter(
			(v) => v.impact === "serious" || v.impact === "critical",
		),
	).toEqual([]);

	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
});

test("every district has a floating light bulb that opens it", async ({
	page,
}) => {
	await openCity(page);
	const bulbs = page
		.getByRole("navigation", { name: "Districts" })
		.getByRole("button");
	await expect(bulbs).toHaveCount(7);
	await page.getByTestId("bulb-commercial").click();
	await expect(
		page.getByRole("dialog").getByRole("heading", { name: "Technical skills" }),
	).toBeVisible();
});

test("keyboard users reach every district through the light bulbs", async ({
	page,
}) => {
	await openCity(page);
	const target = page.getByRole("button", { name: "Fun Park — Open source" });
	for (let i = 0; i < 12; i++) {
		await page.keyboard.press("Tab");
		if (await target.evaluate((el) => el === document.activeElement)) break;
	}
	await expect(target).toBeFocused();
	await page.keyboard.press("Enter");
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByRole("heading", { name: "Open-source playground" }),
	).toBeVisible();
	const links = dialog.getByRole("link", { name: /OPEN/ });
	await expect(links).toHaveCount(5);
	for (const link of await links.all())
		await expect(link).toHaveAttribute("target", "_blank");
	await page.keyboard.press("Escape");

	await page.getByTestId("events-menu").click();
	await page.getByRole("menuitem", { name: "Tornado" }).click();
	await expect(page.getByTestId("events-menu")).toContainText("TORNADO");
	await expect
		.poll(() => page.evaluate(() => window.__city?.disaster?.phase))
		.toBe("running");
});
