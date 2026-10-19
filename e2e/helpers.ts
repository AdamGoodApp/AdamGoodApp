import { expect, type Page } from "@playwright/test";
import type { ZoneId } from "../src/data/zones";

export async function openCity(page: Page): Promise<void> {
	await page.goto("/?e2e=1");
	await expect(page.locator('canvas[data-ready="1"]')).toBeAttached({
		timeout: 60_000,
	});
}

export function zonePoint(page: Page, id: ZoneId) {
	return page.evaluate((zone) => {
		if (!window.__city) throw new Error("window.__city missing");
		return window.__city.zoneScreenPoint(zone);
	}, id);
}
