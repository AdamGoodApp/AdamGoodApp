import type { GatewayEnv } from "#/chat/adapter";
import type {
	EmbeddingsBinding,
	SemanticSearchEnv,
	VectorIndexBinding,
} from "#/mcp/semantic-search";

/**
 * Cloudflare access for the evals, from `.env.evals.local` locally or the
 * CLOUDFLARE_EVALS_TOKEN secret in CI. One token covers Workers AI (read),
 * Vectorize (write: a new CV gets a new namespace) and AI Gateway (run).
 */
export interface EvalCredentials {
	accountId: string;
	token: string;
	gatewayId: string;
}

export function evalCredentials(): EvalCredentials {
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
	const token = process.env.CLOUDFLARE_EVALS_TOKEN;
	if (!accountId || !token) {
		throw new Error(
			"The evals need CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_EVALS_TOKEN (put them in .env.evals.local)",
		);
	}
	return { accountId, token, gatewayId: process.env.AI_GATEWAY_ID ?? "main" };
}

/** The AI Gateway settings the Worker reads from its vars and secrets. */
export function gatewayEnv(c: EvalCredentials): GatewayEnv {
	return {
		AI_GATEWAY_ACCOUNT_ID: c.accountId,
		AI_GATEWAY_ID: c.gatewayId,
		CF_AIG_TOKEN: c.token,
	};
}

const INDEX = "adamgoodapp-cv";

async function api<T>(
	c: EvalCredentials,
	path: string,
	body: string,
	contentType = "application/json",
): Promise<T> {
	const res = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${c.accountId}${path}`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${c.token}`,
				"Content-Type": contentType,
			},
			body,
		},
	);
	const json = (await res.json()) as {
		success: boolean;
		errors?: unknown;
		result: T;
	};
	if (!res.ok || !json.success) {
		throw new Error(
			`Cloudflare API ${path}: ${res.status} ${JSON.stringify(json.errors)}`,
		);
	}
	return json.result;
}

/**
 * The Worker's AI and Vectorize bindings, backed by the REST API, so the
 * evals run the production search code (src/mcp/semantic-search.ts) from Node
 * against the real index.
 */
export function restSearchEnv(c: EvalCredentials): SemanticSearchEnv {
	const ai: EmbeddingsBinding = {
		run: (model, inputs) => api(c, `/ai/run/${model}`, JSON.stringify(inputs)),
	};
	const index: VectorIndexBinding = {
		query: (vector, options) =>
			api(
				c,
				`/vectorize/v2/indexes/${INDEX}/query`,
				JSON.stringify({ vector, ...options }),
			),
		getByIds: (ids) =>
			api(
				c,
				`/vectorize/v2/indexes/${INDEX}/get_by_ids`,
				JSON.stringify({ ids }),
			),
		upsert: (vectors) =>
			api(
				c,
				`/vectorize/v2/indexes/${INDEX}/upsert`,
				vectors.map((v) => JSON.stringify(v)).join("\n"),
				"application/x-ndjson",
			),
	};
	return { AI: ai, CV_INDEX: index };
}
