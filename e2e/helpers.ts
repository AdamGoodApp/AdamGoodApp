import { test as base, expect, type Page } from "@playwright/test";
import type { ZoneId } from "../src/data/zones";

/**
 * Tests that render the city get their own browser process. SwiftShader runs
 * the GPU process on the CPU, and a second city page in the same process waits
 * behind the previous page's teardown long enough to miss its first frame.
 */
export const test = base.extend({
	page: async (
		{
			playwright,
			launchOptions,
			viewport,
			isMobile,
			hasTouch,
			deviceScaleFactor,
			userAgent,
			baseURL,
		},
		use,
	) => {
		const browser = await playwright.chromium.launch(launchOptions);
		const context = await browser.newContext({
			viewport,
			isMobile,
			hasTouch,
			deviceScaleFactor,
			userAgent,
			baseURL,
		});
		await use(await context.newPage());
		await browser.close();
	},
});

export { expect };

export async function openCity(page: Page): Promise<void> {
	await page.goto("/?e2e=1");
	await expect(page.locator('canvas[data-ready="1"]')).toBeAttached({
		// First frame on SwiftShader compiles every pipeline; allow most of the test budget.
		timeout: 100_000,
	});
}

export function zonePoint(page: Page, id: ZoneId) {
	return page.evaluate((zone) => {
		if (!window.__city) throw new Error("window.__city missing");
		return window.__city.zoneScreenPoint(zone);
	}, id);
}
