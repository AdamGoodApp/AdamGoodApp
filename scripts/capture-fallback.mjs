// Renders the live city into public/city.jpg (1920×1080) and public/og.jpg (1200×630).
// Needs `pnpm build && pnpm preview` running on http://127.0.0.1:4173.
import { chromium } from "@playwright/test";

const BASE = process.env.CAPTURE_URL ?? "http://127.0.0.1:4173";
const SHOTS = [
	{ file: "public/city.jpg", width: 1920, height: 1080 },
	{ file: "public/og.jpg", width: 1200, height: 630 },
];

try {
	await fetch(BASE);
} catch {
	console.error(
		`Nothing is serving ${BASE}. Run \`pnpm build && pnpm preview\` first.`,
	);
	process.exit(1);
}

const browser = await chromium.launch({
	args: [
		"--use-angle=swiftshader",
		"--enable-unsafe-swiftshader",
		"--ignore-gpu-blocklist",
	],
});
try {
	for (const shot of SHOTS) {
		const page = await browser.newPage({
			viewport: { width: shot.width, height: shot.height },
		});
		await page.goto(`${BASE}/?capture=1&tier=webgl2&time=day`);
		await page
			.locator('canvas[data-ready="1"]')
			.waitFor({ state: "attached", timeout: 120_000 });
		await page.waitForTimeout(1500);
		await page.screenshot({ path: shot.file, type: "jpeg", quality: 82 });
		console.log(`wrote ${shot.file}`);
		await page.close();
	}
} finally {
	await browser.close();
}
