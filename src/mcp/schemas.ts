import { z } from "zod";
import { ZONE_IDS } from "#/data/zones";

/**
 * Zod schemas shared by the tool definitions, the remote MCP server and the
 * MCP Apps widget. Kept free of `@tanstack/ai` so the widget bundle stays small.
 */

export const DISTRICT_GUIDE =
	"downtown=Experience, mountains=FATMAP, rural=Roots/Old Town, commercial=Technical skills, beach=About me, themepark=Open source, residential=Off the clock";

export const districtId = z
	.enum(ZONE_IDS)
	.describe(`District id (${DISTRICT_GUIDE})`);

export const okResult = z.object({
	ok: z.boolean(),
	error: z.string().optional(),
});

export const timeMode = z.enum(["auto", "day", "night"]);

export const viewSchema = z.object({
	x: z.number(),
	z: z.number(),
	zoom: z.number(),
});

export const simulationSchema = z.object({
	paused: z.boolean(),
	speed: z.number(),
	simTime: z.number(),
	agents: z.number(),
});

export const linkSchema = z.object({ label: z.string(), href: z.string() });

export const blockSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("heading"), text: z.string() }),
	z.object({ kind: z.literal("text"), text: z.string() }),
	z.object({ kind: z.literal("bullets"), items: z.array(z.string()) }),
	z.object({
		kind: z.literal("badges"),
		heading: z.string().optional(),
		items: z.array(z.string()),
	}),
	z.object({
		kind: z.literal("tabs"),
		tabs: z.array(
			z.object({
				label: z.string(),
				heading: z.string(),
				sub: z.string(),
				bullets: z.array(z.string()),
				badges: z.array(z.string()),
			}),
		),
	}),
	z.object({
		kind: z.literal("project"),
		name: z.string(),
		text: z.string(),
		href: z.string(),
	}),
]);

export const districtSummarySchema = z.object({
	id: districtId,
	district: z.string(),
	topic: z.string(),
	title: z.string(),
	tagline: z.string(),
});

export const profileResult = z.object({
	kind: z.literal("profile"),
	name: z.string(),
	title: z.string(),
	location: z.string(),
	summary: z.string(),
	highlights: z.array(z.string()),
	languages: z.array(z.string()),
	links: z.object({
		linkedin: z.string(),
		github: z.string(),
		email: z.string(),
		repo: z.string(),
	}),
});

export const districtResult = districtSummarySchema.extend({
	kind: z.literal("district"),
	blocks: z.array(blockSchema),
	links: z.array(linkSchema),
	markdown: z.string(),
});

export const searchResult = z.object({
	kind: z.literal("search"),
	query: z.string(),
	/** semantic: Workers AI embeddings + Vectorize; keyword: term matching. */
	mode: z.enum(["semantic", "keyword"]),
	results: z.array(
		z.object({
			zoneId: districtId,
			district: z.string(),
			title: z.string(),
			heading: z.string(),
			snippet: z.string(),
			score: z.number(),
		}),
	),
});

export const experienceResult = z.object({
	kind: z.literal("experience"),
	roles: z.array(
		z.object({
			company: z.string(),
			role: z.string(),
			period: z.string(),
			location: z.string(),
			summary: z.string(),
			bullets: z.array(z.string()),
			stack: z.array(z.string()),
		}),
	),
	education: z.array(z.string()),
});

export const skillsResult = z.object({
	kind: z.literal("skills"),
	groups: z.array(z.object({ group: z.string(), items: z.array(z.string()) })),
});

export const projectsResult = z.object({
	kind: z.literal("projects"),
	projects: z.array(
		z.object({ name: z.string(), text: z.string(), href: z.string() }),
	),
});

/** Everything the CV widget knows how to render, keyed by `kind`. */
export const widgetResultSchema = z.discriminatedUnion("kind", [
	profileResult,
	districtResult,
	searchResult,
	experienceResult,
	skillsResult,
	projectsResult,
]);

export type WidgetResult = z.infer<typeof widgetResultSchema>;
