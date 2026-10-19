import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Builds the MCP Apps CV widget into one self-contained HTML file
 * (`src/mcp/apps/dist/cv-widget.html`, JS, CSS and fonts inlined): hosts render
 * it in a sandboxed iframe without network access. `src/mcp/server.ts` serves
 * it as the `ui://adamgoodapp/cv-widget.html` resource.
 */
export default defineConfig({
	root: fileURLToPath(new URL("src/mcp/apps", import.meta.url)),
	publicDir: false,
	resolve: { tsconfigPaths: true },
	plugins: [tailwindcss(), viteReact(), viteSingleFile()],
	build: {
		outDir: "dist",
		emptyOutDir: true,
		rollupOptions: { input: "cv-widget.html" },
		assetsInlineLimit: 100_000_000,
		cssCodeSplit: false,
		sourcemap: false,
	},
	logLevel: "warn",
});
