import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { createGatewayAdapter, MAYOR_MODEL } from "#/chat/adapter";
import { createChatHandler } from "#/chat/server";
import { createCvSearch } from "#/mcp/semantic-search";

const handleChat = createChatHandler({
	adapter: () => createGatewayAdapter(env, MAYOR_MODEL, { app: "mayor-chat" }),
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
