import { useRegisterWebMCPTools } from "@tanstack/ai-react";
import { type RefObject, useEffect, useMemo, useState } from "react";
import type { CityWorld } from "#/city/world";
import type { ZoneId } from "#/data/zones";
import { CLIENT_TOOLS, WEBMCP_TOOL_OPTIONS } from "#/mcp/client-tools";
import type { CityToolContext } from "#/mcp/context";

function reportError(error: unknown): void {
	console.error("[mcp] WebMCP registration failed", error);
}

/**
 * Exposes the city's tools on `document.modelContext` (WebMCP). Browsers with
 * native WebMCP register them directly: the MCP-B 6.0.3 wrapper around a native
 * `modelContext` crashes when the browser calls a tool without options. Other
 * browsers lazily load the MCP-B polyfill (client-side only), which also
 * bridges the tools to the MCP-B extension.
 */
export function CityMcp({
	worldRef,
	select,
	hover,
}: {
	worldRef: RefObject<CityWorld | null>;
	select(id: ZoneId | null): void;
	hover(id: ZoneId | null): void;
}) {
	const [bridge, setBridge] = useState(false);

	useEffect(() => {
		if (typeof document.modelContext?.registerTool === "function") {
			setBridge(true);
			return;
		}
		let live = true;
		import("@mcp-b/global")
			.then(() => {
				if (live) setBridge(true);
			})
			.catch((error: unknown) =>
				console.error("[mcp] WebMCP bridge failed to load", error),
			);
		return () => {
			live = false;
		};
	}, []);

	const context = useMemo<CityToolContext>(
		() => ({ world: () => worldRef.current, select, hover }),
		[worldRef, select, hover],
	);

	return bridge ? <Registrar context={context} /> : null;
}

function Registrar({ context }: { context: CityToolContext }) {
	const options = useMemo(
		() => ({ context, toolOptions: WEBMCP_TOOL_OPTIONS, onError: reportError }),
		[context],
	);
	useRegisterWebMCPTools(CLIENT_TOOLS, options);
	return null;
}
