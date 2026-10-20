import { cloudflare } from "@cloudflare/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	// Pre-bundle every three.js entry together so dev serves one copy of three.core.
	optimizeDeps: {
		include: [
			"three",
			"three/webgpu",
			"three/tsl",
			"three/addons/utils/BufferGeometryUtils.js",
			"three/addons/tsl/display/BloomNode.js",
			"three/addons/tsl/display/GaussianBlurNode.js",
			"@tanstack/ai",
			"@tanstack/ai-react",
			"@mcp-b/global",
			"zod",
			"liquid-glass-react",
			"react-markdown",
			"remark-gfm",
			"@shadcn/react/message-scroller",
		],
	},
	plugins: [
		// The React Server Components environment runs inside the same Worker as SSR.
		cloudflare({
			viteEnvironment: { name: "ssr", childEnvironments: ["rsc"] },
		}),
		tailwindcss(),
		tanstackStart({ rsc: { enabled: true } }),
		rsc(),
		viteReact(),
		babel({ presets: [reactCompilerPreset()] }),
	],
});
