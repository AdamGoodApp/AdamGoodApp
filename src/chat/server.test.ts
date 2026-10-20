import { fakeText } from "@tanstack/ai/testing";
import { describe, expect, it } from "vitest";
import { CHAT_ERRORS, createChatHandler } from "./server";

const URL_ = "http://test.local/api/chat";

function body(text: string) {
	return JSON.stringify({
		threadId: "t",
		runId: "r",
		messages: [{ id: "u1", role: "user", content: text }],
		tools: [],
		context: [],
		forwardedProps: {},
		state: {},
	});
}

function post(init: RequestInit = {}) {
	return new Request(URL_, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: body("Rust?"),
		...init,
	});
}

describe("createChatHandler guards", () => {
	const ok = () => fakeText();

	it("only accepts POST", async () => {
		const res = await createChatHandler({ adapter: ok })(new Request(URL_));
		expect(res.status).toBe(405);
	});

	it("rejects cross-origin requests", async () => {
		const res = await createChatHandler({ adapter: ok })(
			post({
				headers: {
					"content-type": "application/json",
					origin: "https://evil.example",
				},
			}),
		);
		expect(res.status).toBe(403);
	});

	it("reports a missing configuration", async () => {
		const res = await createChatHandler({ adapter: () => null })(post());
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({ error: CHAT_ERRORS.unconfigured });
	});

	it("applies the rate limiter per client IP", async () => {
		const keys: string[] = [];
		const res = await createChatHandler({
			adapter: ok,
			rateLimiter: {
				limit: async ({ key }) => {
					keys.push(key);
					return { success: false };
				},
			},
		})(
			post({
				headers: {
					"content-type": "application/json",
					"cf-connecting-ip": "203.0.113.7",
				},
			}),
		);
		expect(res.status).toBe(429);
		expect(keys).toEqual(["203.0.113.7"]);
	});

	it("rejects a body that is not an AG-UI run", async () => {
		const res = await createChatHandler({ adapter: ok })(post({ body: "{}" }));
		expect(res.status).toBe(400);
	});
});

/** The AG-UI events of an SSE response, with the streamed answer text joined. */
async function events(res: Response) {
	const list: { type: string; delta?: string; toolCallName?: string }[] = [];
	for (const line of (await res.text()).split("\n")) {
		if (line.startsWith("data: ")) list.push(JSON.parse(line.slice(6)));
	}
	const text = list
		.filter((e) => e.type === "TEXT_MESSAGE_CONTENT")
		.map((e) => e.delta ?? "")
		.join("");
	return { types: list.map((e) => e.type), list, text };
}

describe("createChatHandler turns", () => {
	it("runs the CV data tools on the server", async () => {
		const fake = fakeText();
		fake.setResponses([
			{ toolCalls: [{ name: "search_cv", input: { query: "Rust" } }] },
			{ text: "Rust shows up at U-NEXT." },
		]);
		const res = await createChatHandler({ adapter: () => fake })(post());
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
		const { types, list, text } = await events(res);
		expect(list.find((e) => e.type === "TOOL_CALL_START")?.toolCallName).toBe(
			"search_cv",
		);
		expect(types).toContain("TOOL_CALL_RESULT");
		expect(text).toBe("Rust shows up at U-NEXT.");
		expect(fake.state.callCount).toBe(2);
	});

	it("leaves city tool calls to the browser", async () => {
		const fake = fakeText();
		fake.setResponses([
			{
				toolCalls: [{ name: "focus_district", input: { district: "beach" } }],
			},
		]);
		const res = await createChatHandler({ adapter: () => fake })(post());
		const { types, list } = await events(res);
		expect(list.find((e) => e.type === "TOOL_CALL_START")?.toolCallName).toBe(
			"focus_district",
		);
		expect(types).not.toContain("TOOL_CALL_RESULT");
		expect(types).toContain("RUN_FINISHED");
		expect(fake.state.callCount).toBe(1);
	});
});
