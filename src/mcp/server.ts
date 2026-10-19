import {
	RESOURCE_MIME_TYPE,
	registerAppResource,
	registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import {
	createMcpHandler,
	McpServer,
	ResourceTemplate,
} from "@modelcontextprotocol/server";
import type { z } from "zod";
import { CV } from "#/data/cv";
import { MCP_URL, SITE_URL, sectionMarkdown } from "#/data/cv-query";
import { isZoneId, ZONES } from "#/data/zones";
import cvWidgetHtml from "./apps/dist/cv-widget.html?raw";
import { DATA_TOOL_BODIES } from "./data-tools";
import {
	type DataToolName,
	getContact,
	getDistrictContent,
	getProfile,
	getSiteGuide,
	listDistricts,
	listExperience,
	listProjects,
	listSkills,
	searchCv,
	TOOL_META,
} from "./definitions";

export const CV_WIDGET_URI = "ui://adamgoodapp/cv-widget.html";

const INSTRUCTIONS = `Adam Rais's portfolio: his CV as an isometric city at ${SITE_URL}. Use get_profile, list_experience, list_skills, list_projects and search_cv for facts about Adam; get_district_content for a whole CV section; get_site_guide to explain the site. Results render as an interactive card in hosts that support MCP Apps. To drive the 3D city itself, open ${SITE_URL} in a browser with WebMCP.`;

interface DataDefinition<I extends z.ZodObject, O extends z.ZodObject> {
	name: DataToolName;
	description: string;
	inputSchema: I;
	outputSchema: O;
}

function jsonResult(value: object) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
		structuredContent: Object.fromEntries(Object.entries(value)),
	};
}

function addTool<I extends z.ZodObject, O extends z.ZodObject>(
	server: McpServer,
	def: DataDefinition<I, O>,
	body: (args: z.output<I>) => z.input<O>,
): void {
	const meta = TOOL_META[def.name];
	// Widened to the concrete ZodObject so the SDK's callback type resolves.
	const inputSchema: z.ZodObject = def.inputSchema;
	const outputSchema: z.ZodObject = def.outputSchema;
	const config = {
		title: meta.title,
		description: def.description,
		inputSchema,
		outputSchema,
		annotations: {
			title: meta.title,
			readOnlyHint: true,
			idempotentHint: true,
			openWorldHint: false,
		},
	};
	// The SDK has validated the arguments already; parsing again gives `body` its typed input.
	const callback = async (args: unknown) =>
		jsonResult(body(def.inputSchema.parse(args)));
	if (meta.widget) {
		registerAppTool(
			server,
			def.name,
			{ ...config, _meta: { ui: { resourceUri: CV_WIDGET_URI } } },
			callback,
		);
	} else {
		server.registerTool(def.name, config, callback);
	}
}

function markdownResource(uri: URL, text: string) {
	return {
		contents: [{ uri: uri.href, mimeType: "text/markdown", text }],
	};
}

/** A fresh server per request: the handler is stateless. */
export function createCityMcpServer(): McpServer {
	const server = new McpServer(
		{
			name: "adamgoodapp",
			title: "Adam Rais — CV city",
			version: "1.0.0",
			websiteUrl: SITE_URL,
		},
		{ instructions: INSTRUCTIONS },
	);
	const b = DATA_TOOL_BODIES;

	addTool(server, getProfile, b.get_profile);
	addTool(server, listDistricts, b.list_districts);
	addTool(server, getDistrictContent, b.get_district_content);
	addTool(server, searchCv, b.search_cv);
	addTool(server, listExperience, b.list_experience);
	addTool(server, listSkills, b.list_skills);
	addTool(server, listProjects, b.list_projects);
	addTool(server, getContact, b.get_contact);
	addTool(server, getSiteGuide, b.get_site_guide);

	registerAppResource(
		server,
		"CV card",
		CV_WIDGET_URI,
		{
			description:
				"Interactive card rendering Adam Rais's profile, CV sections, experience, skills, projects and search results",
			mimeType: RESOURCE_MIME_TYPE,
			_meta: { ui: { prefersBorder: true } },
		},
		async () => ({
			contents: [
				{
					uri: CV_WIDGET_URI,
					mimeType: RESOURCE_MIME_TYPE,
					text: cvWidgetHtml,
					_meta: { ui: { prefersBorder: true } },
				},
			],
		}),
	);

	server.registerResource(
		"profile",
		"cv://profile",
		{
			title: "Adam Rais — profile",
			description: "About-me section of the CV",
			mimeType: "text/markdown",
		},
		async (uri) => markdownResource(uri, sectionMarkdown("beach")),
	);

	server.registerResource(
		"section",
		new ResourceTemplate("cv://sections/{district}", {
			list: async () => ({
				resources: ZONES.map((z) => ({
					uri: `cv://sections/${z.id}`,
					name: z.id,
					title: `${z.district} — ${CV[z.id].title}`,
					mimeType: "text/markdown",
				})),
			}),
		}),
		{
			title: "CV section",
			description: "One CV chapter (district) as markdown",
			mimeType: "text/markdown",
		},
		async (uri, { district }) => {
			if (typeof district !== "string" || !isZoneId(district)) {
				throw new Error(`Unknown district: ${String(district)}`);
			}
			return markdownResource(uri, sectionMarkdown(district));
		},
	);

	return server;
}

export const mcpHandler = createMcpHandler(createCityMcpServer);

const CORS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
	"Access-Control-Allow-Headers":
		"Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
	"Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
	"Access-Control-Max-Age": "86400",
};

const TOOL_NAMES = Object.entries(TOOL_META)
	.filter(([name]) => name in DATA_TOOL_BODIES)
	.map(([name]) => name)
	.join(", ");

const HUMAN_PAGE = `MCP endpoint for adamgoodapp.com (Streamable HTTP).

Connect an MCP client (Claude, ChatGPT, Cursor, MCP Inspector) to ${MCP_URL}.
Tools: ${TOOL_NAMES}.
Resources: cv://profile, cv://sections/{district}, ${CV_WIDGET_URI} (MCP Apps card).
`;

/** Serves `/mcp`: CORS preflight, a plain-text page for browsers, MCP otherwise. */
export async function handleMcpRequest(request: Request): Promise<Response> {
	if (request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: CORS });
	}
	if (
		request.method === "GET" &&
		(request.headers.get("accept") ?? "").includes("text/html")
	) {
		return new Response(HUMAN_PAGE, {
			headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
		});
	}
	const response = await mcpHandler.fetch(request);
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
