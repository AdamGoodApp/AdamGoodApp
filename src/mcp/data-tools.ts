import {
	contact,
	districts,
	experience,
	profile,
	projects,
	searchCv,
	section,
	siteGuide,
	skills,
} from "#/data/cv-query";
import type { ZoneId } from "#/data/zones";
import { DEFAULT_SEARCH_LIMIT } from "./definitions";

/** Implementations of the CV data tools, shared by the page and the remote server. */
export const DATA_TOOL_BODIES = {
	get_profile: () => ({ kind: "profile" as const, ...profile() }),
	list_districts: () => ({ districts: districts() }),
	get_district_content: ({ district }: { district: ZoneId }) => ({
		kind: "district" as const,
		...section(district),
	}),
	/** Keyword search; the server swaps in semantic search (./semantic-search.ts). */
	search_cv: ({ query, limit }: { query: string; limit?: number }) => ({
		kind: "search" as const,
		query,
		mode: "keyword" as const,
		results: searchCv(query, limit ?? DEFAULT_SEARCH_LIMIT),
	}),
	list_experience: () => ({ kind: "experience" as const, ...experience() }),
	list_skills: () => ({ kind: "skills" as const, groups: skills() }),
	list_projects: () => ({ kind: "projects" as const, projects: projects() }),
	get_contact: () => contact(),
	get_site_guide: () => ({ markdown: siteGuide() }),
};
