/** Bindings and secrets of the `adamgoodapp` Worker (see wrangler.jsonc and .dev.vars.example). */
declare module "cloudflare:workers" {
	export const env: {
		AI_GATEWAY_ACCOUNT_ID?: string;
		AI_GATEWAY_ID?: string;
		CF_AIG_TOKEN?: string;
		CHAT_RATE_LIMITER?: {
			limit(options: { key: string }): Promise<{ success: boolean }>;
		};
		/** Workers AI, for the CV search embeddings. */
		AI?: import("#/mcp/semantic-search").EmbeddingsBinding;
		/** Vectorize index `adamgoodapp-cv`: the CV search vectors. */
		CV_INDEX?: import("#/mcp/semantic-search").VectorIndexBinding;
	};
}
