import { createFileRoute } from "@tanstack/react-router";
import { handleMcpRequest } from "#/mcp/server";

/** Remote MCP server (Streamable HTTP) for Claude, ChatGPT and other MCP clients. */
export const Route = createFileRoute("/mcp")({
	server: {
		handlers: {
			GET: ({ request }) => handleMcpRequest(request),
			POST: ({ request }) => handleMcpRequest(request),
			DELETE: ({ request }) => handleMcpRequest(request),
			OPTIONS: ({ request }) => handleMcpRequest(request),
		},
	},
});
