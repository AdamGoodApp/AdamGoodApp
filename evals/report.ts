import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";

const RESULTS_DIR = new URL("./results/", import.meta.url);

/**
 * Writes one suite's markdown report to evals/results/<suite>.md and, in
 * GitHub Actions, to the job summary.
 */
export function writeReport(suite: string, markdown: string): void {
	mkdirSync(RESULTS_DIR, { recursive: true });
	writeFileSync(new URL(`${suite}.md`, RESULTS_DIR), markdown);
	const summary = process.env.GITHUB_STEP_SUMMARY;
	if (summary) appendFileSync(summary, `${markdown}\n`);
}

/** A markdown table; cells have their pipes escaped and newlines flattened. */
export function table(header: string[], rows: (string | number)[][]): string {
	const cell = (v: string | number) =>
		String(v).replaceAll("|", "\\|").replaceAll("\n", " ");
	return [
		`| ${header.join(" | ")} |`,
		`| ${header.map(() => "---").join(" | ")} |`,
		...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
	].join("\n");
}
