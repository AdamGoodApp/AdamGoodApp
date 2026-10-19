import { defineConfig, devices } from "@playwright/test";

const gpuArgs = [
	"--use-angle=swiftshader",
	"--enable-unsafe-swiftshader",
	"--ignore-gpu-blocklist",
];

export default defineConfig({
	testDir: "e2e",
	fullyParallel: true,
	// SwiftShader is CPU-bound: parallel workers only slow every first frame down.
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
	// Software (SwiftShader) rendering of the full city is slow; interactions wait on frames.
	timeout: 120_000,
	expect: { timeout: 20_000 },
	use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
	webServer: {
		command: "pnpm preview",
		url: "http://127.0.0.1:4173",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
	projects: [
		{
			name: "desktop",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1440, height: 900 },
				launchOptions: { args: gpuArgs },
			},
		},
		{
			name: "mobile",
			use: { ...devices["Pixel 7"], launchOptions: { args: gpuArgs } },
		},
	],
});
