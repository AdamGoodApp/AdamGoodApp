/** Bindings and secrets of the `adamgoodapp` Worker (see wrangler.jsonc and .dev.vars.example). */
declare module "cloudflare:workers" {
	export const env: {
		AI_GATEWAY_ACCOUNT_ID?: string;
		AI_GATEWAY_ID?: string;
		CF_AIG_TOKEN?: string;
		/** /api/chat: 20 requests a minute per IP. */
		CHAT_RATE_LIMITER?: import("#/chat/server").RateLimiter;
		/** /api/chat: 8 requests per 10 seconds per IP. */
		CHAT_BURST_LIMITER?: import("#/chat/server").RateLimiter;
		/** Workers AI, for the CV search embeddings. */
		AI?: import("#/mcp/semantic-search").EmbeddingsBinding;
		/** Vectorize index `adamgoodapp-cv`: the CV search vectors. */
		CV_INDEX?: import("#/mcp/semantic-search").VectorIndexBinding;
	};
}
