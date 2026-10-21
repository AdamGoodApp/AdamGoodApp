import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { createGatewayAdapter, MAYOR_MODEL } from "#/chat/adapter";
import { createChatHandler, type RateLimitTier } from "#/chat/server";
import { createCvSearch } from "#/mcp/semantic-search";

/** Per-IP limits from wrangler.jsonc: a burst cap, then a per-minute cap. */
const rateLimits: RateLimitTier[] = [
	...(env.CHAT_BURST_LIMITER
		? [{ limiter: env.CHAT_BURST_LIMITER, periodSeconds: 10 }]
		: []),
	...(env.CHAT_RATE_LIMITER
		? [{ limiter: env.CHAT_RATE_LIMITER, periodSeconds: 60 }]
		: []),
];

const handleChat = createChatHandler({
	adapter: () => createGatewayAdapter(env, MAYOR_MODEL, { app: "mayor-chat" }),
	rateLimits,
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
