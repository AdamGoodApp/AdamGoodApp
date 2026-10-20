import { createAnthropicChat } from "@tanstack/ai-anthropic";

export const MAYOR_MODEL = "claude-haiku-5-5";

export interface MayorEnv {
	AI_GATEWAY_ACCOUNT_ID?: string;
	AI_GATEWAY_ID?: string;
	CF_AIG_TOKEN?: string;
}

/**
 * Claude Haiku through the account's Cloudflare AI Gateway. The Anthropic key
 * is the gateway's stored (BYOK) key, so the Worker only holds a gateway token.
 */
export function createMayorAdapter(env: MayorEnv) {
	const {
		AI_GATEWAY_ACCOUNT_ID: account,
		AI_GATEWAY_ID: gateway,
		CF_AIG_TOKEN: token,
	} = env;
	if (!account || !gateway || !token) return null;
	return createAnthropicChat(MAYOR_MODEL, "byok", {
		baseURL: `https://gateway.ai.cloudflare.com/v1/${account}/${gateway}/anthropic`,
		defaultHeaders: {
			"cf-aig-authorization": `Bearer ${token}`,
			"cf-aig-metadata": JSON.stringify({ app: "mayor-chat" }),
		},
		// The gateway applies the stored provider key only when the request has none.
		fetch: (input, init) => {
			const headers = new Headers(init?.headers);
			headers.delete("x-api-key");
			return fetch(input, { ...init, headers });
		},
	});
}
