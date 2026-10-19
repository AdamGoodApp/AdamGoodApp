import { describe, expect, it } from "vitest";
import {
	contact,
	districts,
	experience,
	profile,
	projects,
	searchCv,
	section,
	sectionMarkdown,
	skills,
} from "./cv-query";
import { LINKS } from "./links";

describe("experience", () => {
	it("lists every role newest first with parsed period and location", () => {
		const { roles, education } = experience();
		expect(roles.map((r) => r.company)).toEqual([
			"Tofu",
			"U-NEXT",
			"Synspective",
			"FATMAP",
			"Automata Technologies",
		]);
		const tofu = roles[0];
		expect(tofu.bullets).toHaveLength(8);
		expect(tofu.period).toBe("May 2024 – present");
		expect(tofu.location).toBe("Tokyo");
		expect(tofu.summary).toBe("AI-driven accounting automation");
		const automata = roles[4];
		expect(automata.role).toBe("Full-Stack Developer");
		expect(automata.period).toBe("Oct 2013 – Sep 2017");
		expect(automata.location).toBe("London");
		expect(roles[3].stack).toContain("Three.js");
		expect(education).toHaveLength(2);
	});
});

describe("skills and projects", () => {
	it("groups skills by shelf", () => {
		const groups = skills();
		expect(groups).toHaveLength(6);
		expect(groups.map((g) => g.group)).toContain("Frontend");
	});

	it("lists projects with absolute links", () => {
		const list = projects();
		expect(list).toHaveLength(5);
		for (const p of list) expect(p.href).toMatch(/^https:\/\//);
	});
});

describe("searchCv", () => {
	it("ranks matching units", () => {
		expect(["commercial", "themepark"]).toContain(
			searchCv("WebGPU")[0]?.zoneId,
		);
		expect(searchCv("rust", 2)).toHaveLength(2);
	});

	it("prefers units matching every term", () => {
		const [top] = searchCv("Solid.js PlayStation");
		expect(top?.snippet).toContain("PlayStation");
		expect(top?.score).toBe(3);
	});

	it("returns nothing for empty or one-letter queries", () => {
		expect(searchCv("")).toEqual([]);
		expect(searchCv("a ?")).toEqual([]);
	});

	it("caps snippets and the result count", () => {
		const hits = searchCv("the and in to of", 50);
		expect(hits).toHaveLength(20);
		for (const h of hits) expect(h.snippet.length).toBeLessThanOrEqual(241);
	});
});

describe("sections", () => {
	it("renders markdown for every block kind", () => {
		expect(sectionMarkdown("rural")).toContain("### Automata Technologies");
		expect(sectionMarkdown("downtown")).toContain("## Tofu · Senior Engineer");
		expect(sectionMarkdown("themepark")).toContain(
			"### [Smash Browser](https://github.com/AdamGoodApp/smash-browser)",
		);
		expect(sectionMarkdown("beach")).toContain("## Links");
	});

	it("returns blocks, links and metadata", () => {
		const beach = section("beach");
		expect(beach.links).toHaveLength(3);
		expect(beach.topic).toBe("About me");
		expect(districts()).toHaveLength(7);
	});
});

describe("profile and contact", () => {
	it("derives the profile from the beach district", () => {
		const p = profile();
		expect(p.links.email).toBe(LINKS.email);
		expect(p.highlights).toContain("75× faster document categorization");
		expect(p.languages).toHaveLength(3);
		expect(p.summary).toMatch(/^I build/);
	});

	it("strips mailto from the contact email", () => {
		expect(contact().email).toBe("adam@adamgoodapp.com");
	});
});
