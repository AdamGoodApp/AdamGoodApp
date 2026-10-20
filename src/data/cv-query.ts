import { type Block, CV } from "./cv";
import { LINKS } from "./links";
import { ZONE_BY_ID, ZONES, type ZoneId } from "./zones";

export interface ProfileLinks {
	linkedin: string;
	github: string;
	email: string;
	repo: string;
}

export interface Profile {
	name: string;
	title: string;
	location: string;
	summary: string;
	highlights: string[];
	languages: string[];
	links: ProfileLinks;
}

export interface DistrictSummary {
	id: ZoneId;
	district: string;
	topic: string;
	title: string;
	tagline: string;
}

export interface DistrictSection extends DistrictSummary {
	blocks: Block[];
	links: { label: string; href: string }[];
	markdown: string;
}

export interface SearchHit {
	zoneId: ZoneId;
	district: string;
	title: string;
	heading: string;
	snippet: string;
	score: number;
}

export interface Role {
	company: string;
	role: string;
	period: string;
	location: string;
	summary: string;
	bullets: string[];
	stack: string[];
}

export interface SkillGroup {
	group: string;
	items: string[];
}

export interface Project {
	name: string;
	text: string;
	href: string;
}

export interface Contact {
	email: string;
	linkedin: string;
	github: string;
	repo: string;
}

export const SITE_URL = "https://adamgoodapp.com";
export const MCP_URL = `${SITE_URL}/mcp`;

type BlockOf<K extends Block["kind"]> = Extract<Block, { kind: K }>;

function blocksOf<K extends Block["kind"]>(id: ZoneId, kind: K): BlockOf<K>[] {
	return CV[id].blocks.filter((b): b is BlockOf<K> => b.kind === kind);
}

function badgesNamed(id: ZoneId, heading: string | undefined): string[] {
	return blocksOf(id, "badges").find((b) => b.heading === heading)?.items ?? [];
}

/** Splits "a · b · c" into `count` parts; the last part keeps any remainder. */
function splitDots(value: string, count: number): string[] {
	const parts = value.split(" · ");
	const head = parts.slice(0, count - 1);
	const tail = parts.slice(count - 1).join(" · ");
	const out = [...head, tail];
	while (out.length < count) out.push("");
	return out;
}

export function profile(): Profile {
	return {
		name: "Adam Rais",
		title: "Senior Full-Stack Engineer",
		location: "Tokyo, Japan",
		summary: blocksOf("beach", "text")[0]?.text ?? "",
		highlights: badgesNamed("beach", "Recent impact"),
		languages: badgesNamed("beach", "Spoken languages"),
		links: { ...LINKS },
	};
}

export function districts(): DistrictSummary[] {
	return ZONES.map((z) => ({
		id: z.id,
		district: z.district,
		topic: z.topic,
		title: CV[z.id].title,
		tagline: CV[z.id].tagline,
	}));
}

export function section(id: ZoneId): DistrictSection {
	const zone = ZONE_BY_ID[id];
	const content = CV[id];
	return {
		id,
		district: zone.district,
		topic: zone.topic,
		title: content.title,
		tagline: content.tagline,
		blocks: content.blocks,
		links: content.links ?? [],
		markdown: sectionMarkdown(id),
	};
}

function blockMarkdown(block: Block): string {
	switch (block.kind) {
		case "heading":
			return `### ${block.text}`;
		case "text":
			return block.text;
		case "bullets":
			return block.items.map((item) => `- ${item}`).join("\n");
		case "badges":
			return `**${block.heading ?? "Tags"}:** ${block.items.join(", ")}`;
		case "tabs":
			return block.tabs
				.map((tab) =>
					[
						`## ${tab.heading}`,
						`_${tab.sub}_`,
						tab.bullets.map((b) => `- ${b}`).join("\n"),
						`**Stack:** ${tab.badges.join(", ")}`,
					].join("\n\n"),
				)
				.join("\n\n");
		case "project":
			return `### [${block.name}](${block.href})\n\n${block.text}`;
	}
}

export function sectionMarkdown(id: ZoneId): string {
	const content = CV[id];
	const parts = [
		`# ${content.title}`,
		`_${content.tagline}_`,
		...content.blocks.map(blockMarkdown),
	];
	if (content.links?.length) {
		parts.push(
			`## Links\n\n${content.links.map((l) => `- [${l.label}](${l.href})`).join("\n")}`,
		);
	}
	return `${parts.join("\n\n")}\n`;
}

interface SearchUnit {
	heading: string;
	text: string;
}

function searchUnits(id: ZoneId): SearchUnit[] {
	const content = CV[id];
	const units: SearchUnit[] = [
		{ heading: content.title, text: content.tagline },
	];
	let heading = content.title;
	for (const block of content.blocks) {
		switch (block.kind) {
			case "heading":
				heading = block.text;
				units.push({ heading: content.title, text: block.text });
				break;
			case "text":
				units.push({ heading, text: block.text });
				break;
			case "bullets":
				for (const item of block.items) units.push({ heading, text: item });
				break;
			case "tabs":
				for (const tab of block.tabs) {
					units.push({
						heading: tab.heading,
						text: `${tab.heading} · ${tab.sub}`,
					});
					for (const b of tab.bullets)
						units.push({ heading: tab.heading, text: b });
					units.push({ heading: tab.heading, text: tab.badges.join(", ") });
				}
				break;
			case "badges":
				units.push({
					heading: block.heading ?? content.title,
					text: block.items.join(", "),
				});
				break;
			case "project":
				units.push({
					heading: block.name,
					text: `${block.name}: ${block.text}`,
				});
				break;
		}
	}
	return units;
}

const SNIPPET_MAX = 240;

function snippet(text: string): string {
	return text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX)}…` : text;
}

/** One searchable unit of the CV (a bullet, a role line, a skill list…), in document order. */
export interface SearchDocument {
	zoneId: ZoneId;
	heading: string;
	text: string;
}

/** Every searchable unit of the CV: the keyword search and the semantic index share these. */
export const SEARCH_DOCUMENTS: readonly SearchDocument[] = ZONES.flatMap(
	(zone) => searchUnits(zone.id).map((unit) => ({ zoneId: zone.id, ...unit })),
);

export const MAX_SEARCH_LIMIT = 20;

/** A search result for a document, with the district and chapter it belongs to. */
export function searchHit(doc: SearchDocument, score: number): SearchHit {
	return {
		zoneId: doc.zoneId,
		district: ZONE_BY_ID[doc.zoneId].district,
		title: CV[doc.zoneId].title,
		heading: doc.heading,
		snippet: snippet(doc.text),
		score,
	};
}

/** Keyword search: a point per matched term, plus one when every term matches. */
export function searchCv(query: string, limit = 5): SearchHit[] {
	const terms = [
		...new Set(
			query
				.toLowerCase()
				.split(/[^a-z0-9+#.]+/i)
				.filter((t) => t.length >= 2),
		),
	];
	if (terms.length === 0) return [];
	const hits: { doc: SearchDocument; score: number; order: number }[] = [];
	SEARCH_DOCUMENTS.forEach((doc, order) => {
		const haystack = doc.text.toLowerCase();
		const matched = terms.filter((t) => haystack.includes(t)).length;
		if (matched === 0) return;
		hits.push({
			doc,
			score: matched + (matched === terms.length ? 1 : 0),
			order,
		});
	});
	hits.sort((a, b) => b.score - a.score || a.order - b.order);
	return hits
		.slice(0, Math.max(0, Math.min(limit, MAX_SEARCH_LIMIT)))
		.map((h) => searchHit(h.doc, h.score));
}

export function experience(): { roles: Role[]; education: string[] } {
	const roles: Role[] = [];
	for (const tabs of blocksOf("downtown", "tabs")) {
		for (const tab of tabs.tabs) {
			const [company, role] = splitDots(tab.heading, 2);
			const [period, location, summary] = splitDots(tab.sub, 3);
			roles.push({
				company,
				role,
				period,
				location,
				summary,
				bullets: tab.bullets,
				stack: tab.badges,
			});
		}
	}

	const peaks = CV.mountains;
	const [peaksCompany, peaksRole] = splitDots(peaks.title, 2);
	const [peaksPeriod, peaksLocation, peaksSummary] = splitDots(
		peaks.tagline,
		3,
	);
	roles.push({
		company: peaksCompany,
		role: peaksRole,
		period: peaksPeriod,
		location: peaksLocation,
		summary: peaksSummary,
		bullets: blocksOf("mountains", "bullets")[0]?.items ?? [],
		stack: badgesNamed("mountains", undefined),
	});

	const rootsHeading = blocksOf("rural", "heading")[0]?.text ?? "";
	const [company, role, period, location] = splitDots(rootsHeading, 4);
	roles.push({
		company,
		role,
		period,
		location,
		summary: blocksOf("rural", "text")[0]?.text ?? "",
		bullets: blocksOf("rural", "bullets")[0]?.items ?? [],
		stack: badgesNamed("rural", "Stack"),
	});

	return { roles, education: badgesNamed("rural", "Education") };
}

export function skills(): SkillGroup[] {
	return blocksOf("commercial", "badges").map((b) => ({
		group: b.heading ?? "Other",
		items: b.items,
	}));
}

export function projects(): Project[] {
	return blocksOf("themepark", "project").map(({ name, text, href }) => ({
		name,
		text,
		href,
	}));
}

export function contact(): Contact {
	return {
		email: LINKS.email.replace(/^mailto:/, ""),
		linkedin: LINKS.linkedin,
		github: LINKS.github,
		repo: LINKS.repo,
	};
}

export function siteGuide(): string {
	const rows = districts()
		.map((d) => `| ${d.district} (\`${d.id}\`) | ${d.topic} | ${d.title} |`)
		.join("\n");
	return `# adamgoodapp.com — site guide

${SITE_URL} is Adam Rais's CV as a living isometric city: traffic, pedestrians, trains and a day/night cycle run in the browser (three.js WebGPU with a WebGL2 fallback). Each district is one chapter of the CV.

## How to use it

- Click a floating light bulb (or a district) to open that chapter as a card; on phones it opens as a drawer.
- Drag to pan, scroll or pinch to zoom.
- The sun/moon button toggles day and night.

## Districts

| District | Topic | Section |
| --- | --- | --- |
${rows}

## Tools

- City control (in the page, via WebMCP): get_city_state, focus_district, set_view, reset_view, open_district, close_district, highlight_district, highlight_spot, set_time_of_day, control_simulation, show_message, run_tour.
- City life (in the page): get_city_events (news feed of fires, fire engine runs, buses, helicopter flights, festivals, plus landmarks) and stage_event (fire flare-up, fire engine dispatch, helicopter launch, park festival).
- CV data (in the page and remotely): get_profile, list_districts, get_district_content, search_cv, list_experience, list_skills, list_projects, get_contact, get_site_guide.

MCP endpoint: ${MCP_URL} (Streamable HTTP; data tools render MCP Apps cards).
`;
}
