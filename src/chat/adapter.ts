import { createAnthropicChat } from "@tanstack/ai-anthropic";

/** The Mayor's model. */
export const MAYOR_MODEL = "claude-haiku-5-5";

export interface GatewayEnv {
	AI_GATEWAY_ACCOUNT_ID?: string;
	AI_GATEWAY_ID?: string;
	CF_AIG_TOKEN?: string;
}

export interface GatewayOptions {
	/** Tags the gateway logs (`cf-aig-metadata`). */
	app: string;
	/** Skip the gateway's response cache, so every call reaches the model (evals). */
	skipCache?: boolean;
}

/**
 * A Claude model through the account's Cloudflare AI Gateway. The Anthropic
 * key is the gateway's stored (BYOK) key, so callers only hold a gateway token.
 */
export function createGatewayAdapter(
	env: GatewayEnv,
	model: Parameters<typeof createAnthropicChat>[0],
	{ app, skipCache = false }: GatewayOptions,
) {
	const {
		AI_GATEWAY_ACCOUNT_ID: account,
		AI_GATEWAY_ID: gateway,
		CF_AIG_TOKEN: token,
	} = env;
	if (!account || !gateway || !token) return null;
	return createAnthropicChat(model, "byok", {
		baseURL: `https://gateway.ai.cloudflare.com/v1/${account}/${gateway}/anthropic`,
		defaultHeaders: {
			"cf-aig-authorization": `Bearer ${token}`,
			"cf-aig-metadata": JSON.stringify({ app }),
			...(skipCache ? { "cf-aig-skip-cache": "true" } : {}),
		},
		// The gateway applies the stored provider key only when the request has none.
		fetch: (input, init) => {
			const headers = new Headers(init?.headers);
			headers.delete("x-api-key");
			return fetch(input, { ...init, headers });
		},
	});
}
