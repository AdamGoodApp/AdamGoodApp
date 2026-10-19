import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { openCity, zonePoint } from "./helpers";

test.skip(({ isMobile }) => isMobile, "desktop interactions");

test("hovering and clicking a district opens its card", async ({ page }) => {
	await openCity(page);
	await expect(page.getByTestId("tier-badge")).toHaveText(/WEBGPU|WEBGL2/);

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

test("keyboard users reach every district from the district menu", async ({
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
});
