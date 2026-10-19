import {
	Client,
	StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";

test.skip(({ isMobile }) => isMobile, "one run is enough");

const WIDGET_URI = "ui://adamgoodapp/cv-widget.html";

async function connect(baseURL: string | undefined): Promise<Client> {
	const client = new Client(
		{ name: "e2e", version: "1.0.0" },
		{ versionNegotiation: { mode: "auto" } },
	);
	await client.connect(
		new StreamableHTTPClientTransport(new URL("/mcp", baseURL)),
	);
	return client;
}

test("the Worker serves the remote MCP endpoint", async ({ baseURL }) => {
	const client = await connect(baseURL);
	try {
		const { tools } = await client.listTools();
		const profile = tools.find((t) => t.name === "get_profile");
		expect(profile?._meta?.ui).toMatchObject({ resourceUri: WIDGET_URI });

		const out = await client.callTool({ name: "list_projects", arguments: {} });
		const projects = Object.entries(out.structuredContent ?? {}).find(
			([key]) => key === "projects",
		)?.[1];
		expect(Array.isArray(projects) ? projects.length : 0).toBe(5);
	} finally {
		await client.close();
	}
});

test("the CV widget bundle runs standalone", async ({ page, baseURL }) => {
	const client = await connect(baseURL);
	let html = "";
	try {
		const res = await client.readResource({ uri: WIDGET_URI });
		const first = res.contents[0];
		html = first && "text" in first ? first.text : "";
	} finally {
		await client.close();
	}
	expect(html).toContain("<script");

	const errors: Error[] = [];
	page.on("pageerror", (e) => errors.push(e));
	await page.route("**/widget-under-test", (route) =>
		route.fulfill({ contentType: "text/html", body: html }),
	);
	await page.goto("/widget-under-test");
	// No host answers the handshake here, so the widget keeps waiting (or reports the failure).
	await expect(page.getByTestId("cv-widget")).toContainText(
		/WAITING FOR THE HOST|Could not connect/,
	);
	expect(errors).toEqual([]);
});
