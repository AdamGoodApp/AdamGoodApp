import { expect, test } from "@playwright/test";
import { openCity, zonePoint } from "./helpers";

test.skip(({ isMobile }) => !isMobile, "touch interactions");

test("tapping a district opens the drawer and dragging pans the city", async ({
	page,
}) => {
	await openCity(page);

	// The suburbs sit just below the centre of the zoomed-in mobile view.
	const p = await zonePoint(page, "residential");
	await page.mouse.click(p.x, p.y);
	const drawer = page.getByRole("dialog");
	await expect(
		drawer.getByRole("heading", { name: "Off the clock" }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(drawer).toBeHidden();

	const before = await page.evaluate(() => window.__city?.cameraTarget());
	await page.mouse.move(200, 500);
	await page.mouse.down();
	await page.mouse.move(120, 380, { steps: 10 });
	await page.mouse.up();
	const after = await page.evaluate(() => window.__city?.cameraTarget());
	if (!before || !after) throw new Error("window.__city missing");
	expect(
		Math.max(Math.abs(after.x - before.x), Math.abs(after.z - before.z)),
	).toBeGreaterThan(5);
});
