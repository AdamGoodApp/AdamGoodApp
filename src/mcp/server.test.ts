import {
	Client,
	StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DATA_TOOLS } from "./definitions";
import { searchResult } from "./schemas";
import { CV_WIDGET_URI, handleMcpRequest } from "./server";

let client: Client;

beforeEach(async () => {
	const transport = new StreamableHTTPClientTransport(
		new URL("http://test.local/mcp"),
		{ fetch: (url, init) => handleMcpRequest(new Request(url, init)) },
	);
	client = new Client(
		{ name: "test", version: "1.0.0" },
		{ versionNegotiation: { mode: "auto" } },
	);
	await client.connect(transport);
});

afterEach(async () => {
	await client.close();
});

function textOf(contents: ({ text: string } | { blob: string })[]): string {
	const first = contents[0];
	return first && "text" in first ? first.text : "";
}

describe("remote MCP server", () => {
	it("lists the data tools; widget tools point at the CV card", async () => {
		const { tools } = await client.listTools();
		expect(tools.map((t) => t.name).sort()).toEqual(
			DATA_TOOLS.map((t) => t.name).sort(),
		);
		const profile = tools.find((t) => t.name === "get_profile");
		expect(profile?._meta?.ui).toMatchObject({ resourceUri: CV_WIDGET_URI });
		const contact = tools.find((t) => t.name === "get_contact");
		expect(contact?._meta?.ui).toBeUndefined();
		expect(profile?.annotations?.readOnlyHint).toBe(true);
	});

	it("answers tool calls with structured content", async () => {
		const profile = await client.callTool({
			name: "get_profile",
			arguments: {},
		});
		expect(profile.structuredContent).toMatchObject({
			kind: "profile",
			name: "Adam Rais",
		});
		const search = await client.callTool({
			name: "search_cv",
			arguments: { query: "Rust" },
		});
		const { results } = searchResult.parse(search.structuredContent);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.snippet.toLowerCase()).toContain("rust");
	});

	it("rejects unknown districts", async () => {
		const out = await client.callTool({
			name: "get_district_content",
			arguments: { district: "nope" },
		});
		expect(out.isError).toBe(true);
	});

	it("serves the widget and the markdown resources", async () => {
		const { resources } = await client.listResources();
		const uris = resources.map((r) => r.uri);
		expect(uris).toContain("cv://profile");
		expect(uris).toContain(CV_WIDGET_URI);
		expect(uris).toContain("cv://sections/downtown");

		const widget = await client.readResource({ uri: CV_WIDGET_URI });
		expect(widget.contents[0]?.mimeType).toBe("text/html;profile=mcp-app");
		const html = textOf(widget.contents);
		expect(html).toContain("<script");
		expect(html).toContain("adamgoodapp-cv");

		const section = await client.readResource({
			uri: "cv://sections/downtown",
		});
		expect(textOf(section.contents)).toContain("# Experience");
	});
});

describe("handleMcpRequest", () => {
	it("answers CORS preflight", async () => {
		const res = await handleMcpRequest(
			new Request("http://x/mcp", { method: "OPTIONS" }),
		);
		expect(res.status).toBe(204);
		expect(res.headers.get("access-control-allow-origin")).toBe("*");
	});

	it("explains itself to browsers", async () => {
		const res = await handleMcpRequest(
			new Request("http://x/mcp", { headers: { Accept: "text/html" } }),
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("MCP endpoint");
	});
});
