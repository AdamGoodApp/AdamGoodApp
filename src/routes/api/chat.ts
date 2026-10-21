import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { createGatewayAdapter, MAYOR_MODEL } from "#/chat/adapter";
import { CHAT_LIMITS } from "#/chat/rate-limit";
import { createChatHandler } from "#/chat/server";
import { createCvSearch } from "#/mcp/semantic-search";

const handleChat = createChatHandler({
	adapter: () => createGatewayAdapter(env, MAYOR_MODEL, { app: "mayor-chat" }),
	// One rate-limiter Durable Object per client IP (src/chat/rate-limiter-object.ts).
	rateLimit: async (key) =>
		env.CHAT_LIMITER
			? env.CHAT_LIMITER.getByName(key).hit(CHAT_LIMITS)
			: { success: true },
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
