import { cloudflare } from "@cloudflare/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
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
		],
	},
	plugins: [
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
		babel({ presets: [reactCompilerPreset()] }),
	],
});
