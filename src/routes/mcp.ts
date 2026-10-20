import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { createCvSearch } from "#/mcp/semantic-search";
import { createMcpRequestHandler } from "#/mcp/server";

const handleMcpRequest = createMcpRequestHandler({
	searchCv: createCvSearch(env),
});

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
