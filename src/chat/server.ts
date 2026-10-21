import {
	type AnyTextAdapter,
	chat,
	chatParamsFromRequest,
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
import { MAYOR_SYSTEM_PROMPT } from "./system-prompt";
import { askTourAudience } from "./tour";

export interface RateLimiter {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** One Workers rate-limit binding and the length of its window. */
export interface RateLimitTier {
	limiter: RateLimiter;
	/** The binding's period, sent back as Retry-After when it trips. */
	periodSeconds: number;
}

export interface ChatHandlerOptions {
	adapter: () => AnyTextAdapter | null;
	/** Checked in order, per client IP; the first one that trips answers 429. */
	rateLimits?: readonly RateLimitTier[];
	/** search_cv body; defaults to keyword search (the Worker passes semantic search). */
	searchCv?: CvSearch;
}

/** A 4 MB PDF is about 5.4 MB once base64-encoded inside the JSON body. */
export const MAX_BODY_BYTES = 6_000_000;
/** Newest wire messages (tool results count as their own entries) forwarded to the model. */
export const MAX_MESSAGES = 40;

/**
 * The newest `MAX_MESSAGES` entries, starting at a user turn so the window
 * never opens with tool results whose tool call was cut off.
 */
export function recentMessages<T extends { role: string }>(
	messages: readonly T[],
): T[] {
	let start = Math.max(0, messages.length - MAX_MESSAGES);
	while (start > 0 && messages[start]?.role !== "user") start -= 1;
	return messages.slice(start);
}

export const CHAT_ERRORS = {
	method: "Method not allowed",
	origin: "Forbidden",
	tooLarge: "That file is too large to send (max 4 MB).",
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
		if (origin && new URL(origin).host !== new URL(request.url).host) {
			return json(403, CHAT_ERRORS.origin);
		}

		if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
			return json(413, CHAT_ERRORS.tooLarge);
		}

		const adapter = options.adapter();
		if (!adapter) return json(503, CHAT_ERRORS.unconfigured);

		const key = request.headers.get("cf-connecting-ip") ?? "anonymous";
		for (const { limiter, periodSeconds } of options.rateLimits ?? []) {
			const { success } = await limiter.limit({ key });
			if (!success) {
				return Response.json(
					{ error: CHAT_ERRORS.rateLimited, retryAfter: periodSeconds },
					{
						status: 429,
						headers: { "Retry-After": String(periodSeconds) },
					},
				);
			}
		}

		let params: Awaited<ReturnType<typeof chatParamsFromRequest>>;
		try {
			params = await chatParamsFromRequest(request);
		} catch (e) {
			if (e instanceof Response) return e;
			throw e;
		}

		const abortController = new AbortController();
		const stream = chat({
			adapter,
			messages: recentMessages(params.messages),
			threadId: params.threadId,
			runId: params.runId,
			...MAYOR_CHAT_SETTINGS,
			tools,
			abortController,
		});
		return toServerSentEventsResponse(stream, { abortController });
	};
}
