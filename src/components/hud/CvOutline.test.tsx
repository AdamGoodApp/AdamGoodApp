import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CvOutline } from "./CvOutline";

describe("CvOutline server render", () => {
	const html = renderToString(<CvOutline />);

	it("includes every Experience role, not just the selected tab", () => {
		for (const role of [
			"Tofu · Senior Engineer",
			"U-NEXT · Senior Software Engineer",
			"Synspective · Chief Technology Lead",
		]) {
			expect(html).toContain(role);
		}
	});

	it("keeps the hidden outline's links out of the Tab order", () => {
		const links = html.match(/<a\b[^>]*>/g) ?? [];
		expect(links.length).toBeGreaterThan(0);
		for (const link of links) expect(link).toContain('tabindex="-1"');
	});
});
