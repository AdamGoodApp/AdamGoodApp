import { fakeText } from "@tanstack/ai/testing";
import { describe, expect, it } from "vitest";
import {
	CHAT_ERRORS,
	createChatHandler,
	MAX_BODY_BYTES,
	MAX_HISTORY_CHARS,
	MAX_MESSAGES,
	recentMessages,
} from "./server";

const URL_ = "http://test.local/api/chat";

function body(
	text: string,
	messages: unknown[] = [{ id: "u1", role: "user", content: text }],
) {
	return JSON.stringify({
		threadId: "t",
		runId: "r",
		messages,
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

	it("rate-limits per client IP and says when to retry", async () => {
		const keys: string[] = [];
		const res = await createChatHandler({
			adapter: ok,
			rateLimit: async (key) => {
				keys.push(key);
				return { success: false, retryAfterSeconds: 7 };
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
		expect(res.headers.get("retry-after")).toBe("7");
		expect(await res.json()).toEqual({
			error: CHAT_ERRORS.rateLimited,
			retryAfter: 7,
		});
		expect(keys).toEqual(["203.0.113.7"]);
	});

	it("answers 403, not 500, to an opaque Origin", async () => {
		const res = await createChatHandler({ adapter: ok })(
			post({ headers: { "content-type": "application/json", origin: "null" } }),
		);
		expect(res.status).toBe(403);
	});

	it("caps the body even without a Content-Length header", async () => {
		const big = new TextEncoder().encode("x".repeat(1_000_000));
		let sent = 0;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (sent > MAX_BODY_BYTES) return controller.close();
				sent += big.byteLength;
				controller.enqueue(big);
			},
		});
		const res = await createChatHandler({ adapter: ok })(
			new Request(URL_, {
				method: "POST",
				body: stream,
				// @ts-expect-error Node's fetch needs duplex for a streamed body.
				duplex: "half",
			}),
		);
		expect(res.status).toBe(413);
	});

	it("refuses document sources the model provider would fetch", async () => {
		const res = await createChatHandler({ adapter: ok })(
			post({
				body: body("", [
					{
						id: "u1",
						role: "user",
						content: [
							{ type: "text", content: "Fit?" },
							{
								type: "document",
								source: { type: "url", value: "https://example.com/huge.pdf" },
							},
						],
					},
				]),
			}),
		);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: CHAT_ERRORS.badContent });
	});

	it("counts text parts in the wire shape the browser sends with a PDF", async () => {
		const res = await createChatHandler({ adapter: ok })(
			post({
				body: body("", [
					{
						id: "u1",
						role: "user",
						content: [
							{ type: "text", text: "x".repeat(MAX_HISTORY_CHARS + 1) },
							{
								type: "document",
								source: {
									type: "data",
									value: "JVBE",
									mimeType: "application/pdf",
								},
							},
						],
					},
				]),
			}),
		);
		expect(res.status).toBe(413);
	});

	it("refuses a history too long to send to the model", async () => {
		const res = await createChatHandler({ adapter: ok })(
			post({ body: body("x".repeat(MAX_HISTORY_CHARS + 1)) }),
		);
		expect(res.status).toBe(413);
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

describe("recentMessages", () => {
	it("starts the window at a user turn, never at an orphaned tool result", () => {
		const turn = ["user", "assistant", "tool"];
		// 45 entries: a plain 40-entry cut would open on a "tool" entry.
		const history = Array.from({ length: 15 }, () => turn)
			.flat()
			.map((role, i) => ({ id: String(i), role }));
		const window = recentMessages(history);
		expect(window[0]?.role).toBe("user");
		expect(window.length).toBeLessThanOrEqual(MAX_MESSAGES);
		expect(window.at(-1)).toBe(history.at(-1));
	});

	it("opens at the first user turn inside the window, dropping older entries", () => {
		const history = [
			{ role: "user" },
			...Array.from({ length: 500 }, () => ({ role: "assistant" })),
			{ role: "user" },
		];
		expect(recentMessages(history)).toEqual([{ role: "user" }]);
	});

	it("keeps short histories whole", () => {
		const history = [{ role: "user" }, { role: "assistant" }];
		expect(recentMessages(history)).toEqual(history);
	});
});
