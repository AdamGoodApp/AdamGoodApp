import type { z } from "zod";
import {
	keywordRank,
	MAX_SEARCH_LIMIT,
	type RankedDocument,
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
 * bge-v1.5's retrieval instruction for short queries; documents are embedded
 * without it.
 */
const QUERY_INSTRUCTION =
	"Represent this sentence for searching relevant passages: ";
/** Candidates taken from each ranking before fusing. */
const CANDIDATES = MAX_SEARCH_LIMIT;
/** The usual reciprocal rank fusion constant. */
const RRF_K = 60;

/**
 * Reciprocal rank fusion: a document scores 1/(k + rank) in each ranking it
 * appears in. Scores are scaled so a document ranked first by both is 1.
 */
function fuse(rankings: readonly (readonly number[])[]): RankedDocument[] {
	const scores = new Map<number, number>();
	for (const ranking of rankings) {
		ranking.forEach((index, rank) => {
			scores.set(index, (scores.get(index) ?? 0) + 1 / (RRF_K + rank + 1));
		});
	}
	const best = rankings.length / (RRF_K + 1);
	return [...scores]
		.map(([index, score]) => ({
			index,
			score: Math.round((score / best) * 1000) / 1000,
		}))
		.sort((a, b) => b.score - a.score || a.index - b.index);
}

/**
 * search_cv on the server: hybrid search over the CV. Workers AI embeddings
 * in Vectorize find matches by meaning ("leading a team" finds "directed a
 * team of 8"); keyword ranking keeps exact names and terms on top; reciprocal
 * rank fusion merges the two. Falls back to keyword search alone when the
 * bindings are missing (CI, local preview without credentials), while this
 * build's CV is still being indexed, or when the semantic side fails.
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
					{ text: [QUERY_INSTRUCTION + query] },
					gateway ? { gateway } : undefined,
				)
			).data;
			if (!vector) return keyword();
			const { matches } = await CV_INDEX.query(vector, {
				topK: CANDIDATES,
				namespace: CV_INDEX_NAMESPACE,
			});
			const prefix = `${CV_INDEX_NAMESPACE}-`;
			const semantic = matches.flatMap((m) => {
				const index = Number(m.id.slice(prefix.length));
				return m.id.startsWith(prefix) && SEARCH_DOCUMENTS[index]
					? [index]
					: [];
			});
			if (semantic.length === 0) return keyword();
			const lexical = keywordRank(query)
				.slice(0, CANDIDATES)
				.map((r) => r.index);
			const results: SearchHit[] = fuse([semantic, lexical])
				.slice(0, topK)
				.flatMap(({ index, score }) => {
					const doc = SEARCH_DOCUMENTS[index];
					return doc ? [searchHit(doc, score)] : [];
				});
			return {
				kind: "search" as const,
				query,
				mode: "hybrid" as const,
				results,
			};
		} catch (e) {
			console.error("[search_cv] semantic search failed", e);
			return keyword();
		}
	};
}
