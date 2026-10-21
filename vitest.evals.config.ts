import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

/**
 * `pnpm eval`: model and retrieval evals against real Cloudflare services
 * (Workers AI, Vectorize, AI Gateway). Credentials come from the environment
 * or `.env.evals.local`; see evals/cloudflare.ts.
 */
export default defineConfig(({ mode }) => ({
	resolve: { alias: { "#": new URL("./src", import.meta.url).pathname } },
	test: {
		environment: "node",
		include: ["evals/**/*.eval.ts"],
		env: loadEnv(mode === "test" ? "evals" : mode, process.cwd(), ""),
		// Calls to paid models: one at a time, no retries hiding a flaky answer.
		fileParallelism: false,
		retry: 0,
		testTimeout: 180_000,
		hookTimeout: 240_000,
	},
}));
