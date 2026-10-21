import { setTimeout as sleep } from "node:timers/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { SEARCH_DOCUMENTS, type SearchHit } from "#/data/cv-query";
import { type CvSearch, createCvSearch } from "#/mcp/semantic-search";
import { evalCredentials, restSearchEnv } from "./cloudflare";
import { table, writeReport } from "./report";

/**
 * Retrieval evals for search_cv: plain-language queries that rarely share
 * words with the CV line they should find. `relevant` matches the CV units
 * (src/data/cv-query.ts SEARCH_DOCUMENTS) that answer the query.
 */
const CASES: {
	query: string;
	relevant: (heading: string, text: string) => boolean;
}[] = [
	{ query: "video streaming", relevant: (h) => h.startsWith("U-NEXT") },
	{
		query: "leading a team of engineers",
		relevant: (_, t) => t.includes("Directed a team of 8"),
	},
	{ query: "satellite imagery", relevant: (h) => h.startsWith("Synspective") },
	{
		query: "making LLM calls cheaper",
		relevant: (_, t) =>
			t.includes("LLM router") ||
			t.includes("Replaced LLM document categorization"),
	},
	{ query: "robot arm", relevant: (_, t) => t.includes("robotic arm") },
	{ query: "privacy regulations", relevant: (_, t) => t.includes("GDPR") },
	{
		query: "game console app",
		relevant: (_, t) => t.includes("PlayStation app"),
	},
	{
		query: "speeding up page load",
		relevant: (_, t) =>
			t.includes("initial page load") || t.includes("Core Web Vitals"),
	},
	{
		query: "recommendation system",
		relevant: (_, t) => t.includes("ML recommender"),
	},
	{
		query: "3D terrain maps for skiers",
		relevant: (h) => h.startsWith("FATMAP"),
	},
	{
		query: "operating system written from scratch",
		relevant: (h) => h === "adzOS",
	},
	{
		query: "which languages does Adam speak",
		relevant: (h) => h === "Spoken languages",
	},
	{
		query: "infrastructure as code",
		relevant: (_, t) => t.includes("Terraform"),
	},
	{
		query: "growth in user sign-ups",
		relevant: (_, t) => t.includes("sign-up"),
	},
	{ query: "university degree", relevant: (h) => h === "Education" },
	{
		query: "real-time messaging for hardware",
		relevant: (_, t) => t.includes("ZeroMQ messaging server"),
	},
	{
		query: "retro game emulators",
		relevant: (_, t) => t.includes("Game Boy") || t.includes("Melee"),
	},
	{
		query: "reducing video buffering",
		relevant: (_, t) => t.includes("rebuffering"),
	},
];

const K = 5;
/** Floors just under the measured scores, so a worse model, query prompt or chunking fails. */
const HIT_RATE_FLOOR = 0.9;
const MRR_FLOOR = 0.75;

/** Hit@K and reciprocal rank of the first relevant result within the top K. */
function grade(
	results: SearchHit[],
	relevant: (h: string, t: string) => boolean,
) {
	const rank = results.slice(0, K).findIndex((r) => {
		const doc = SEARCH_DOCUMENTS.find(
			(d) =>
				d.heading === r.heading && r.snippet.startsWith(d.text.slice(0, 200)),
		);
		return doc ? relevant(doc.heading, doc.text) : false;
	});
	return { hit: rank >= 0, rr: rank >= 0 ? 1 / (rank + 1) : 0, rank: rank + 1 };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

let hybrid: CvSearch;
let keyword: CvSearch;

beforeAll(async () => {
	hybrid = createCvSearch(restSearchEnv(evalCredentials()));
	keyword = createCvSearch({});
	// A changed CV gets a new namespace: the first search indexes it, and
	// Vectorize applies upserts a few seconds later.
	for (let attempt = 0; attempt < 30; attempt++) {
		if ((await hybrid({ query: "warm up", limit: 1 })).mode === "hybrid")
			return;
		await sleep(5000);
	}
	throw new Error("The Vectorize namespace for this CV never became ready");
}, 200_000);

describe("search_cv retrieval", () => {
	it(`finds the relevant CV line in the top ${K}`, async () => {
		const rows: (string | number)[][] = [];
		const scores = {
			hybrid: [] as ReturnType<typeof grade>[],
			keyword: [] as ReturnType<typeof grade>[],
		};
		for (const c of CASES) {
			const [h, k] = await Promise.all([
				hybrid({ query: c.query, limit: K }),
				keyword({ query: c.query, limit: K }),
			]);
			expect(h.mode).toBe("hybrid");
			const gh = grade(h.results, c.relevant);
			const gk = grade(k.results, c.relevant);
			scores.hybrid.push(gh);
			scores.keyword.push(gk);
			rows.push([
				c.query,
				gh.hit ? `✅ #${gh.rank}` : "❌",
				gk.hit ? `✅ #${gk.rank}` : "❌",
				h.results[0]?.snippet.slice(0, 70) ?? "",
			]);
		}
		const summary = (g: ReturnType<typeof grade>[]) => ({
			hitRate: mean(g.map((x) => (x.hit ? 1 : 0))),
			mrr: mean(g.map((x) => x.rr)),
		});
		const h = summary(scores.hybrid);
		const k = summary(scores.keyword);
		writeReport(
			"search",
			[
				"## search_cv retrieval",
				"",
				table(
					["", `hit@${K}`, `MRR@${K}`],
					[
						[
							"hybrid (Vectorize + keyword)",
							h.hitRate.toFixed(2),
							h.mrr.toFixed(2),
						],
						["keyword only", k.hitRate.toFixed(2), k.mrr.toFixed(2)],
					],
				),
				"",
				table(["query", "hybrid", "keyword", "hybrid top result"], rows),
			].join("\n"),
		);
		// Regression floors for the semantic search, and it must beat keyword matching.
		expect(h.hitRate).toBeGreaterThanOrEqual(HIT_RATE_FLOOR);
		expect(h.mrr).toBeGreaterThanOrEqual(MRR_FLOOR);
		expect(h.mrr).toBeGreaterThanOrEqual(k.mrr);
	}, 300_000);
});
