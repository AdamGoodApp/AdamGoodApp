import { expect, test } from "@playwright/test";
import { openCity, zonePoint } from "./helpers";

test.skip(({ isMobile }) => !isMobile, "touch interactions");

test("dragging pans the city and tapping opens the drawer", async ({
	page,
}) => {
	await openCity(page);
	const before = await page.evaluate(() => window.__city?.cameraTarget());

	await page.mouse.move(200, 500);
	await page.mouse.down();
	await page.mouse.move(120, 380, { steps: 10 });
	await page.mouse.up();

	const after = await page.evaluate(() => window.__city?.cameraTarget());
	expect(before && after).toBeTruthy();
	if (!before || !after) return;
	expect(
		Math.max(Math.abs(after.x - before.x), Math.abs(after.z - before.z)),
	).toBeGreaterThan(5);

	const p = await zonePoint(page, "beach");
	await page.mouse.click(p.x, p.y);
	await expect(
		page.getByRole("dialog").getByRole("heading", { name: "About me" }),
	).toBeVisible();
});
