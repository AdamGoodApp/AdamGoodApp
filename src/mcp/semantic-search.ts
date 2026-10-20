import type { z } from "zod";
import {
	MAX_SEARCH_LIMIT,
	SEARCH_DOCUMENTS,
	type SearchDocument,
	type SearchHit,
	searchCv,
	searchHit,
} from "#/data/cv-query";
import type { searchResult } from "./schemas";

/** The search_cv tool body: query in, ranked CV snippets out. */
export type CvSearch = (args: {
	query: string;
	limit?: number;
}) => Promise<z.input<typeof searchResult>>;

/** Workers AI text embeddings: 768 dimensions, the size of the `adamgoodapp-cv` index. */
export const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
/** Workers AI takes up to 100 texts per embedding call. */
const EMBED_BATCH = 100;
/** Vectorize takes up to 1000 vectors per upsert. */
const UPSERT_BATCH = 1000;

/** The slice of the Workers AI binding this module uses. */
export interface EmbeddingsBinding {
	run(
		model: typeof EMBEDDING_MODEL,
		inputs: { text: string[] },
		options?: { gateway?: { id: string } },
	): Promise<{ data: number[][] }>;
}

/** The slice of the Vectorize binding this module uses. */
export interface VectorIndexBinding {
	query(
		vector: number[],
		options: { topK: number; namespace: string },
	): Promise<{ matches: { id: string; score: number }[] }>;
	getByIds(ids: string[]): Promise<{ id: string }[]>;
	upsert(
		vectors: { id: string; values: number[]; namespace: string }[],
	): Promise<unknown>;
}

export interface SemanticSearchEnv {
	AI?: EmbeddingsBinding;
	CV_INDEX?: VectorIndexBinding;
	/** Routes the embedding calls through this AI Gateway, for its logs. */
	AI_GATEWAY_ID?: string;
}

/** FNV-1a, 32-bit: a short, stable fingerprint of the indexed text. */
function fnv1a(text: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * The index namespace for this build's CV: a new CV text or model gets a new
 * namespace, so searches never match vectors of an older CV.
 */
export const CV_INDEX_NAMESPACE = `cv-${fnv1a(
	[
		EMBEDDING_MODEL,
		...SEARCH_DOCUMENTS.map((d) => `${d.heading}\n${d.text}`),
	].join("\u0000"),
)}`;

/** What gets embedded: the heading gives a bare bullet its role or chapter. */
function documentText(doc: SearchDocument): string {
	return doc.heading === doc.text ? doc.text : `${doc.heading}: ${doc.text}`;
}

const vectorId = (index: number) => `${CV_INDEX_NAMESPACE}-${index}`;

/**
 * Embeds every CV document into this build's namespace. Upserts are
 * idempotent; Vectorize applies them a few seconds later.
 */
async function indexCv(
	ai: EmbeddingsBinding,
	index: VectorIndexBinding,
	gateway?: { id: string },
) {
	const vectors: { id: string; values: number[]; namespace: string }[] = [];
	for (let start = 0; start < SEARCH_DOCUMENTS.length; start += EMBED_BATCH) {
		const batch = SEARCH_DOCUMENTS.slice(start, start + EMBED_BATCH);
		const { data } = await ai.run(
			EMBEDDING_MODEL,
			{ text: batch.map(documentText) },
			gateway ? { gateway } : undefined,
		);
		data.forEach((values, i) => {
			vectors.push({
				id: vectorId(start + i),
				values,
				namespace: CV_INDEX_NAMESPACE,
			});
		});
	}
	for (let start = 0; start < vectors.length; start += UPSERT_BATCH) {
		await index.upsert(vectors.slice(start, start + UPSERT_BATCH));
	}
}

/** Whether this build's namespace is fully in the index (its first and last vector exist). */
async function indexReady(index: VectorIndexBinding): Promise<boolean> {
	const ids = [vectorId(0), vectorId(SEARCH_DOCUMENTS.length - 1)];
	const found = await index.getByIds(ids);
	return found.length === ids.length;
}

/**
 * search_cv on the server: semantic search over the CV with Workers AI
 * embeddings and Vectorize, so "video streaming" finds U-NEXT without the
 * exact words. Falls back to keyword search when the bindings are missing
 * (tests, local preview), while this build's CV is still being indexed, or
 * when the semantic search fails.
 */
export function createCvSearch(env: SemanticSearchEnv): CvSearch {
	const gateway = env.AI_GATEWAY_ID ? { id: env.AI_GATEWAY_ID } : undefined;
	/** One indexing run per Worker isolate; a failed run is retried by the next search. */
	let indexing: Promise<void> | null = null;
	return async ({ query, limit }) => {
		const topK = Math.max(1, Math.min(limit ?? 5, MAX_SEARCH_LIMIT));
		const keyword = () => ({
			kind: "search" as const,
			query,
			mode: "keyword" as const,
			results: searchCv(query, topK),
		});
		const { AI, CV_INDEX } = env;
		if (!AI || !CV_INDEX || !query.trim()) return keyword();
		try {
			if (!(await indexReady(CV_INDEX))) {
				indexing ??= indexCv(AI, CV_INDEX, gateway).catch((e) => {
					indexing = null;
					console.error("[search_cv] indexing failed", e);
				});
				await indexing;
				return keyword();
			}
			const [vector] = (
				await AI.run(
					EMBEDDING_MODEL,
					{ text: [query] },
					gateway ? { gateway } : undefined,
				)
			).data;
			if (!vector) return keyword();
			const { matches } = await CV_INDEX.query(vector, {
				topK,
				namespace: CV_INDEX_NAMESPACE,
			});
			const prefix = `${CV_INDEX_NAMESPACE}-`;
			const results: SearchHit[] = [];
			for (const match of matches) {
				const doc = match.id.startsWith(prefix)
					? SEARCH_DOCUMENTS[Number(match.id.slice(prefix.length))]
					: undefined;
				if (doc)
					results.push(searchHit(doc, Math.round(match.score * 1000) / 1000));
			}
			return results.length > 0
				? { kind: "search" as const, query, mode: "semantic" as const, results }
				: keyword();
		} catch (e) {
			console.error("[search_cv] semantic search failed", e);
			return keyword();
		}
	};
}
