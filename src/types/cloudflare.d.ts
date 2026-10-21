/** Bindings and secrets of the `adamgoodapp` Worker (see wrangler.jsonc and .dev.vars.example). */
declare module "cloudflare:workers" {
	export const env: {
		AI_GATEWAY_ACCOUNT_ID?: string;
		AI_GATEWAY_ID?: string;
		CF_AIG_TOKEN?: string;
		/** One ChatRateLimiter Durable Object per client IP. */
		CHAT_LIMITER?: {
			getByName(name: string): {
				hit(
					tiers: readonly import("#/chat/rate-limit").LimitTier[],
				): Promise<import("#/chat/rate-limit").LimitResult>;
			};
		};
		/** Workers AI, for the CV search embeddings. */
		AI?: import("#/mcp/semantic-search").EmbeddingsBinding;
		/** Vectorize index `adamgoodapp-cv`: the CV search vectors. */
		CV_INDEX?: import("#/mcp/semantic-search").VectorIndexBinding;
	};

	/** Base class of Durable Objects (the slice this app uses). */
	export abstract class DurableObject {
		constructor(ctx: unknown, env: unknown);
	}
}
