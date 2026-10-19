import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { LINKS } from "../src/data/links";

async function expectCenteredFallback(page: Page) {
	await expect(
		page.getByRole("heading", { level: 1, name: "ADAMGOODAPP" }),
	).toBeVisible();
	const nav = page.getByRole("navigation", { name: "Contact" });
	const hrefs = await nav
		.getByRole("link")
		.evaluateAll((els) => els.map((a) => a.getAttribute("href")));
	expect(hrefs).toEqual([LINKS.linkedin, LINKS.github, LINKS.email]);

	const viewport = page.viewportSize();
	if (!viewport) throw new Error("no viewport");
	const column = await page.getByTestId("fallback-center").boundingBox();
	const buttons = await nav.boundingBox();
	if (!column || !buttons) throw new Error("fallback not laid out");
	expect(
		Math.abs(column.x + column.width / 2 - viewport.width / 2),
	).toBeLessThan(3);
	expect(
		Math.abs(column.y + column.height / 2 - viewport.height / 2),
	).toBeLessThan(3);
	expect(
		Math.abs(buttons.x + buttons.width / 2 - viewport.width / 2),
	).toBeLessThan(3);

	const axe = await new AxeBuilder({ page }).analyze();
	expect(
		axe.violations.filter(
			(v) => v.impact === "serious" || v.impact === "critical",
		),
	).toEqual([]);
}

test("without WebGPU or WebGL the snapshot fallback is shown", async ({
	page,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "gpu", { value: undefined });
		const getContext = HTMLCanvasElement.prototype.getContext;
		Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
			value(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
				return type === "webgl2" || type === "webgl"
					? null
					: Reflect.apply(getContext, this, [type, ...args]);
			},
		});
	});
	await page.goto("/");
	await expectCenteredFallback(page);
});

test("?tier=fallback forces the snapshot", async ({ page }) => {
	await page.goto("/?tier=fallback");
	await expectCenteredFallback(page);
});
