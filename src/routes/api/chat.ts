import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { createGatewayAdapter, MAYOR_MODEL } from "#/chat/adapter";
import { createChatHandler, type RateLimitTier } from "#/chat/server";
import { createCvSearch } from "#/mcp/semantic-search";

/**
 * Per-IP limits from wrangler.jsonc: a burst cap, then a per-minute cap. Read
 * per request: bindings are not on `env` yet while this module first loads.
 */
function rateLimits(): RateLimitTier[] {
	const tiers: RateLimitTier[] = [];
	if (env.CHAT_BURST_LIMITER) {
		tiers.push({ limiter: env.CHAT_BURST_LIMITER, periodSeconds: 10 });
	}
	if (env.CHAT_RATE_LIMITER) {
		tiers.push({ limiter: env.CHAT_RATE_LIMITER, periodSeconds: 60 });
	}
	return tiers;
}

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
