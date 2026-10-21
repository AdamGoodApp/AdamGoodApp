import {
	type AnyTextAdapter,
	chat,
	chatParamsFromRequestBody,
	maxIterations,
	toServerSentEventsResponse,
} from "@tanstack/ai";
import { DATA_TOOL_BODIES } from "#/mcp/data-tools";
import {
	CITY_TOOLS,
	getContact,
	getDistrictContent,
	getProfile,
	getSiteGuide,
	listDistricts,
	listExperience,
	listProjects,
	listSkills,
	searchCv,
} from "#/mcp/definitions";
import type { CvSearch } from "#/mcp/semantic-search";
import { clientKey, type LimitResult } from "./rate-limit";
import { MAYOR_SYSTEM_PROMPT } from "./system-prompt";
import { askTourAudience } from "./tour";

export interface ChatHandlerOptions {
	adapter: () => AnyTextAdapter | null;
	/** Counts one request for this client key (its IP); a refusal answers 429. */
	rateLimit?: (key: string) => Promise<LimitResult>;
	/** search_cv body; defaults to keyword search (the Worker passes semantic search). */
	searchCv?: CvSearch;
}

/** A 4 MB PDF is about 5.4 MB once base64-encoded inside the JSON body. */
export const MAX_BODY_BYTES = 6_000_000;
/** Newest wire messages (tool results count as their own entries) forwarded to the model. */
export const MAX_MESSAGES = 40;
/** Characters of forwarded history besides PDF data (~75k tokens): bounds the input cost of one request. */
export const MAX_HISTORY_CHARS = 300_000;
/** PDFs forwarded in one request (the dock attaches one per question). */
export const MAX_DOCUMENTS = 2;
/** Output tokens per model call. */
export const MAX_OUTPUT_TOKENS = 4096;

/**
 * At most the newest `MAX_MESSAGES` entries, starting at a user turn so the
 * window never opens with tool results whose tool call was cut off. With no
 * user turn inside the window, it opens at the newest user turn.
 */
export function recentMessages<T extends { role: string }>(
	messages: readonly T[],
): T[] {
	const cut = Math.max(0, messages.length - MAX_MESSAGES);
	let start = cut;
	while (start < messages.length && messages[start]?.role !== "user")
		start += 1;
	if (start === messages.length) {
		start = cut;
		while (start > 0 && messages[start]?.role !== "user") start -= 1;
	}
	return messages.slice(start);
}

type WireMessage = { role: string; content?: unknown };

/**
 * Why the forwarded history may not reach the model, or null if it may: user
 * content is text plus inline PDFs only (no URL sources, which Anthropic would
 * fetch and bill), and its size is capped.
 */
export function historyProblem(
	messages: readonly WireMessage[],
): string | null {
	let documents = 0;
	let chars = 0;
	for (const m of messages) {
		if (m.role === "user" && Array.isArray(m.content)) {
			for (const part of m.content as Record<string, unknown>[]) {
				if (part?.type === "text") {
					// The wire shape is { type: "text", text }; count the whole part either way.
					chars += JSON.stringify(part).length;
					continue;
				}
				const source = part?.source as Record<string, unknown> | undefined;
				if (
					part?.type !== "document" ||
					source?.type !== "data" ||
					source.mimeType !== "application/pdf"
				) {
					return CHAT_ERRORS.badContent;
				}
				documents += 1;
			}
		} else {
			chars += JSON.stringify(m).length;
		}
	}
	if (documents > MAX_DOCUMENTS || chars > MAX_HISTORY_CHARS) {
		return CHAT_ERRORS.tooLong;
	}
	return null;
}

/** The body as text, or null once it passes `maxBytes` (Content-Length may be absent or wrong). */
async function readCapped(
	request: Request,
	maxBytes: number,
): Promise<string | null> {
	if (!request.body) return "";
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > maxBytes) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const c of chunks) {
		bytes.set(c, offset);
		offset += c.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

export const CHAT_ERRORS = {
	method: "Method not allowed",
	origin: "Forbidden",
	tooLarge: "That file is too large to send (max 4 MB).",
	tooLong: "This conversation is too long. Start a new chat.",
	badBody: "That request is not a valid chat run.",
	badContent: "Only text and PDF attachments can be sent.",
	unconfigured: "The Mayor is off duty: chat is not configured on this server.",
	rateLimited: "Easy there — too many messages. Try again shortly.",
} as const;

/** The CV data tools, run on the server; `search` is the search_cv body. */
export function mayorDataTools(search: CvSearch) {
	return [
		getProfile.server(DATA_TOOL_BODIES.get_profile),
		listDistricts.server(DATA_TOOL_BODIES.list_districts),
		getDistrictContent.server(DATA_TOOL_BODIES.get_district_content),
		searchCv.server(search),
		listExperience.server(DATA_TOOL_BODIES.list_experience),
		listSkills.server(DATA_TOOL_BODIES.list_skills),
		listProjects.server(DATA_TOOL_BODIES.list_projects),
		getContact.server(DATA_TOOL_BODIES.get_contact),
		getSiteGuide.server(DATA_TOOL_BODIES.get_site_guide),
	];
}

/** The Mayor's chat() settings besides adapter, messages and tools; the evals use them too. */
export const MAYOR_CHAT_SETTINGS = {
	systemPrompts: [MAYOR_SYSTEM_PROMPT],
	agentLoopStrategy: maxIterations(8),
	// Stream a thinking summary for the dock's chain of thought.
	reasoning: { level: "low" as const, summary: true },
	modelOptions: { max_tokens: MAX_OUTPUT_TOKENS },
};

function json(status: number, error: string): Response {
	return Response.json({ error }, { status });
}

/** POST /api/chat: one Mayor turn, streamed as AG-UI server-sent events. */
export function createChatHandler(options: ChatHandlerOptions) {
	// The CV data tools run here; the city tools and ask_tour_audience are bare
	// definitions, so their calls stream to the browser, which runs them against
	// the live city or asks the visitor. Tool declarations sent by the client
	// are ignored: this list is the allowlist.
	const tools = [
		...mayorDataTools(
			options.searchCv ?? (async (args) => DATA_TOOL_BODIES.search_cv(args)),
		),
		...CITY_TOOLS,
		askTourAudience,
	];
	return async (request: Request): Promise<Response> => {
		if (request.method !== "POST") return json(405, CHAT_ERRORS.method);

		const origin = request.headers.get("origin");
		// Requests without an Origin (non-browser clients) pass; the limiter bounds them.
		if (
			origin &&
			(!URL.canParse(origin) ||
				new URL(origin).host !== new URL(request.url).host)
		) {
			return json(403, CHAT_ERRORS.origin);
		}

		if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
			return json(413, CHAT_ERRORS.tooLarge);
		}

		const adapter = options.adapter();
		if (!adapter) return json(503, CHAT_ERRORS.unconfigured);

		if (options.rateLimit) {
			const ip = request.headers.get("cf-connecting-ip");
			const key = ip ? clientKey(ip) : "anonymous";
			const limit = await options.rateLimit(key);
			if (!limit.success) {
				return Response.json(
					{
						error: CHAT_ERRORS.rateLimited,
						retryAfter: limit.retryAfterSeconds,
					},
					{
						status: 429,
						headers: { "Retry-After": String(limit.retryAfterSeconds) },
					},
				);
			}
		}

		const text = await readCapped(request, MAX_BODY_BYTES);
		if (text === null) return json(413, CHAT_ERRORS.tooLarge);

		let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>;
		try {
			params = await chatParamsFromRequestBody(JSON.parse(text));
		} catch {
			return json(400, CHAT_ERRORS.badBody);
		}

		const messages = recentMessages(params.messages);
		const problem = historyProblem(messages);
		if (problem) {
			return json(problem === CHAT_ERRORS.tooLong ? 413 : 400, problem);
		}

		const abortController = new AbortController();
		const stream = chat({
			adapter,
			messages,
			threadId: params.threadId,
			runId: params.runId,
			...MAYOR_CHAT_SETTINGS,
			tools,
			abortController,
		});
		return toServerSentEventsResponse(stream, { abortController });
	};
}
