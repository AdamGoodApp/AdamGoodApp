import { type AnyTextAdapter, chat } from "@tanstack/ai";
import { z } from "zod";
import { contact, districts, sectionMarkdown } from "#/data/cv-query";
import { ZONE_IDS } from "#/data/zones";

/** A stronger model than the Mayor's grades the Mayor. */
export const JUDGE_MODEL = "claude-sonnet-5-5";

const CV = `${ZONE_IDS.map(sectionMarkdown).join("\n\n")}\nContact: ${JSON.stringify(contact())}`;

/** The site's city districts, so "the Downtown district" reads as the site, not a place in Tokyo. */
const DISTRICTS = districts()
	.map((d) => `- ${d.district}: the "${d.title}" chapter`)
	.join("\n");

export const Verdict = z.object({
	unsupportedClaims: z
		.array(z.string())
		.describe(
			"Every factual claim about Adam (employers, dates, numbers, skills, projects) that the CV does not support. Empty when all claims are supported.",
		),
	answersRequest: z
		.boolean()
		.describe("Whether the reply does what the visitor asked"),
	reason: z.string().describe("One sentence explaining the verdict"),
});

export type Verdict = z.infer<typeof Verdict>;

/**
 * LLM-as-judge: checks a Mayor reply against the CV for invented facts, and
 * whether it answers the request. `expectation` says what a good reply does.
 */
export async function judge(
	adapter: AnyTextAdapter,
	{
		request,
		answer,
		expectation,
	}: { request: string; answer: string; expectation: string },
): Promise<Verdict> {
	return chat({
		adapter,
		systemPrompts: [
			`You grade replies from "the Mayor", a chat guide on Adam's portfolio site, an 8-bit city where each district holds one CV chapter. Judge only against this CV; anything about Adam not stated in it is unsupported. Statements about the site, its districts, the city simulation or the conversation are not claims about Adam (e.g. "his Tokyo roles are in the Downtown district" means the site's Downtown district). Saying something is not in the CV is not a claim.\n\nDistricts of the site:\n${DISTRICTS}\n\n<cv>\n${CV}\n</cv>`,
		],
		messages: [
			{
				role: "user",
				content: `<request>${request}</request>\n<expectation>${expectation}</expectation>\n<reply>${answer}</reply>`,
			},
		],
		outputSchema: Verdict,
	});
}
