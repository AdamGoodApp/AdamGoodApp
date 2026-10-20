import type { Page } from "@playwright/test";
import { type FakeResponseStep, fakeText } from "@tanstack/ai/testing";
import { createChatHandler } from "../src/chat/server";
import { expect, openCity, test } from "./helpers";

test.skip(({ isMobile }) => isMobile, "desktop interactions");

/**
 * Serve /api/chat from the real handler with a scripted model, so the browser
 * runs the full loop: request, SSE stream, client tools, follow-up request.
 */
async function mockChat(page: Page, responses: FakeResponseStep[]) {
	const fake = fakeText();
	fake.setResponses(responses);
	const handle = createChatHandler({ adapter: () => fake });
	const bodies: string[] = [];
	await page.route("**/api/chat", async (route) => {
		const req = route.request();
		const body = req.postData() ?? "";
		bodies.push(body);
		const res = await handle(
			new Request(req.url(), {
				method: req.method(),
				headers: req.headers(),
				body,
			}),
		);
		await route.fulfill({
			status: res.status,
			headers: Object.fromEntries(res.headers),
			body: Buffer.from(await res.arrayBuffer()),
		});
	});
	return bodies;
}

function distanceToBeach(page: Page) {
	return page.evaluate(() => {
		const t = window.__city?.cameraTarget();
		return t ? Math.hypot(t.x + 58.5, t.z - 58.5) : Number.POSITIVE_INFINITY;
	});
}

test("the Mayor answers, drives the city and keeps the conversation", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await mockChat(page, [
		{ toolCalls: [{ name: "focus_district", input: { district: "beach" } }] },
		{ text: "The Beach holds Adam's About me chapter — I've flown you there." },
	]);
	await openCity(page);

	const dock = page.getByTestId("mayor-dock");
	const messages = page.getByTestId("mayor-messages");
	await expect(dock).toHaveAttribute("data-state", "collapsed");
	await expect(messages).toBeHidden();

	const input = page.getByTestId("mayor-input");
	await input.fill("Where is Adam's about-me chapter?");
	await expect(page.locator(".mayor-ring")).toHaveCSS("opacity", "1");
	await input.press("Enter");

	await expect(dock).toHaveAttribute("data-state", "expanded");
	await expect(messages).toContainText("I've flown you there");
	await expect(messages).toContainText("Mayor");
	await expect(messages).toContainText("Focus a district · The Beach");
	await expect
		.poll(() => distanceToBeach(page), { timeout: 5_000 })
		.toBeLessThan(2);

	await page.getByRole("button", { name: "Minimise chat" }).click();
	await expect(dock).toHaveAttribute("data-state", "collapsed");
	await expect(messages).toBeHidden();

	await openCity(page);
	await page.getByRole("button", { name: "Show conversation" }).click();
	await expect(messages).toContainText("I've flown you there");
});

test("suggestions read the city news and job descriptions get a fit check", async ({
	page,
}) => {
	const bodies = await mockChat(page, [
		{ toolCalls: [{ name: "get_city_events", input: {} }] },
		{ text: "Fresh from the ticker: nothing on fire yet." },
		{ text: "**Fit: 8/10** — strong on Rust." },
	]);
	await openCity(page);

	await page
		.getByRole("button", { name: "What's happening in the city?" })
		.click();
	await expect(page.getByTestId("mayor-dock")).toHaveAttribute(
		"data-state",
		"expanded",
	);
	const messages = page.getByTestId("mayor-messages");
	await expect(messages).toContainText("nothing on fire yet");
	await expect(messages).toContainText("City news feed");
	expect(bodies[0]).toContain("What's happening in the city right now?");

	await page.setInputFiles('[data-testid="mayor-file"]', {
		name: "jd.txt",
		mimeType: "text/plain",
		buffer: Buffer.from("Senior Rust engineer wanted"),
	});
	await expect(page.getByTestId("mayor-attachment")).toContainText("jd.txt");
	await page.getByTestId("mayor-input").fill("Does Adam fit?");
	await page.getByTestId("mayor-input").press("Enter");

	await expect(messages).toContainText("Fit: 8/10");
	const last = bodies.at(-1) ?? "";
	expect(last).toContain('<job_description filename=\\"jd.txt\\">');
	expect(last).toContain("Senior Rust engineer wanted");
});
