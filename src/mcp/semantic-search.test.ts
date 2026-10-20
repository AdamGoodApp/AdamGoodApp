import { describe, expect, it, vi } from "vitest";
import { keywordRank, SEARCH_DOCUMENTS } from "#/data/cv-query";
import type { EmbeddingsBinding, VectorIndexBinding } from "./semantic-search";
import * as mod from "./semantic-search";

function fakeAi(): EmbeddingsBinding & { calls: string[][] } {
	const calls: string[][] = [];
	return {
		calls,
		run: vi.fn(async (_model, { text }) => {
			calls.push(text);
			return { data: text.map(() => [0.1, 0.2]) };
		}),
	};
}

function fakeIndex(
	stored: Set<string>,
	matches: { id: string; score: number }[] = [],
): VectorIndexBinding & {
	upserted: { id: string; namespace: string }[];
} {
	const upserted: { id: string; namespace: string }[] = [];
	return {
		upserted,
		getByIds: vi.fn(async (ids: string[]) =>
			ids.filter((id) => stored.has(id)).map((id) => ({ id })),
		),
		upsert: vi.fn(async (vectors) => {
			upserted.push(
				...vectors.map((v: { id: string; namespace: string }) => ({
					id: v.id,
					namespace: v.namespace,
				})),
			);
		}),
		query: vi.fn(async () => ({ matches })),
	};
}

const allIds = () =>
	new Set(SEARCH_DOCUMENTS.map((_, i) => `${mod.CV_INDEX_NAMESPACE}-${i}`));

describe("createCvSearch", () => {
	it("uses keyword search without the bindings", async () => {
		const out = await mod.createCvSearch({})({ query: "Rust", limit: 2 });
		expect(out.mode).toBe("keyword");
		expect(out.results).toHaveLength(2);
	});

	it("indexes every CV unit into this build's namespace once, answering by keyword meanwhile", async () => {
		const ai = fakeAi();
		const index = fakeIndex(new Set());
		const search = mod.createCvSearch({ AI: ai, CV_INDEX: index });
		const first = await search({ query: "Rust" });
		await search({ query: "Rust" });

		expect(first.mode).toBe("keyword");
		expect(index.upserted).toHaveLength(SEARCH_DOCUMENTS.length);
		expect(new Set(index.upserted.map((v) => v.namespace))).toEqual(
			new Set([mod.CV_INDEX_NAMESPACE]),
		);
		// Embedding calls stay within the Workers AI batch limit.
		for (const batch of ai.calls) expect(batch.length).toBeLessThanOrEqual(100);
		expect(index.query).not.toHaveBeenCalled();
	});

	it("fuses vector and keyword rankings and drops ids from other namespaces", async () => {
		const ns = mod.CV_INDEX_NAMESPACE;
		const [shaka] = keywordRank("Shaka");
		const semanticOnly = 0;
		expect(shaka).toBeDefined();
		expect(keywordRank("Shaka").some((r) => r.index === semanticOnly)).toBe(
			false,
		);
		const index = fakeIndex(allIds(), [
			{ id: `${ns}-${semanticOnly}`, score: 0.7 },
			{ id: "cv-0000dead-1", score: 0.69 },
			{ id: `${ns}-${shaka?.index}`, score: 0.6 },
		]);
		const ai = fakeAi();
		const out = await mod.createCvSearch({ AI: ai, CV_INDEX: index })({
			query: "Shaka",
			limit: 2,
		});

		expect(ai.calls.at(-1)?.[0]).toMatch(/^Represent this sentence.*Shaka$/);
		expect(index.query).toHaveBeenCalledWith(expect.any(Array), {
			topK: 20,
			namespace: ns,
		});
		expect(out.mode).toBe("hybrid");
		// Found by both rankings beats the vector search's own top hit.
		expect(out.results.map((r) => [r.snippet, r.score])).toEqual([
			[SEARCH_DOCUMENTS[shaka?.index ?? -1]?.text.slice(0, 240), 0.992],
			[SEARCH_DOCUMENTS[semanticOnly]?.text.slice(0, 240), 0.5],
		]);
	});

	it("falls back to keyword search when the semantic search fails", async () => {
		const index = fakeIndex(allIds());
		index.query = vi.fn(async () => {
			throw new Error("Vectorize down");
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		const out = await mod.createCvSearch({ AI: fakeAi(), CV_INDEX: index })({
			query: "Rust",
		});
		expect(out.mode).toBe("keyword");
		expect(out.results.length).toBeGreaterThan(0);
	});
});
