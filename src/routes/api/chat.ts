import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { createMayorAdapter } from "#/chat/adapter";
import { createChatHandler } from "#/chat/server";
import { createCvSearch } from "#/mcp/semantic-search";

const handleChat = createChatHandler({
	adapter: () => createMayorAdapter(env),
	rateLimiter: env.CHAT_RATE_LIMITER ?? null,
	searchCv: createCvSearch(env),
});

/** The Mayor chat: one streamed turn per POST (see src/chat/server.ts). */
export const Route = createFileRoute("/api/chat")({
	server: {
		handlers: {
			GET: ({ request }) => handleChat(request),
			POST: ({ request }) => handleChat(request),
		},
	},
});
