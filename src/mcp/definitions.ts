import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { CITY_EVENT_KINDS, STAGE_KINDS } from "#/city/events";
import {
	DISTRICT_GUIDE,
	districtId,
	districtResult,
	districtSummarySchema,
	experienceResult,
	okResult,
	profileResult,
	projectsResult,
	searchResult,
	simulationSchema,
	skillsResult,
	timeMode,
	viewSchema,
} from "./schemas";

/**
 * Every tool the site exposes, defined once. The page implements all of them
 * (`client-tools.ts`, registered through WebMCP); the remote `/mcp` server
 * implements the data tools (`server.ts`).
 */

export const DEFAULT_FOCUS_ZOOM = 2.2;
export const DEFAULT_MESSAGE_SECONDS = 8;
export const DEFAULT_TOUR_SECONDS = 5;
export const DEFAULT_SEARCH_LIMIT = 5;
export const DEFAULT_SPOT_SECONDS = 8;
export const DEFAULT_EVENT_LIMIT = 20;

const zoom = z.number().min(1).max(3.5);
const empty = z.object({});

// City control: run in the page and drive the 3D city and its HUD.

export const getCityState = toolDefinition({
	name: "get_city_state",
	description:
		"Read the live state of the 3D city: renderer tier, open and highlighted district, day/night, camera view, simulation and each district's on-screen position.",
	inputSchema: empty,
	outputSchema: okResult.extend({
		ready: z.boolean(),
		tier: z.string(),
		isDesktop: z.boolean(),
		selected: districtId.nullable(),
		hovered: districtId.nullable(),
		timeMode,
		isNight: z.boolean(),
		view: viewSchema.nullable(),
		simulation: simulationSchema.nullable(),
		districts: z.array(
			z.object({
				id: districtId,
				district: z.string(),
				topic: z.string(),
				selected: z.boolean(),
				screen: z.object({ x: z.number(), y: z.number() }).nullable(),
			}),
		),
	}),
});

export const focusDistrict = toolDefinition({
	name: "focus_district",
	description: `Fly the camera to a district and zoom in on it (${DISTRICT_GUIDE}).`,
	inputSchema: z.object({
		district: districtId,
		zoom: zoom
			.default(DEFAULT_FOCUS_ZOOM)
			.describe("1 = whole city, 3.5 = closest"),
	}),
	outputSchema: okResult,
});

export const setView = toolDefinition({
	name: "set_view",
	description:
		"Move the camera to a ground point (x/z in world units, city spans about -84..84) and/or zoom level; omitted values stay as they are.",
	inputSchema: z.object({
		x: z.number().min(-250).max(250).optional(),
		z: z.number().min(-250).max(250).optional(),
		zoom: zoom.optional().describe("1 = whole city, 3.5 = closest"),
	}),
	outputSchema: okResult.extend({ view: viewSchema.optional() }),
});

export const resetView = toolDefinition({
	name: "reset_view",
	description: "Fly the camera back to the default framing of the whole city.",
	inputSchema: empty,
	outputSchema: okResult,
});

export const openDistrict = toolDefinition({
	name: "open_district",
	description: `Open a district's CV card (drawer on phones) and highlight it (${DISTRICT_GUIDE}).`,
	inputSchema: z.object({ district: districtId }),
	outputSchema: okResult.extend({ title: z.string().optional() }),
});

export const closeDistrict = toolDefinition({
	name: "close_district",
	description: "Close the open district card or drawer.",
	inputSchema: empty,
	outputSchema: okResult,
});

export const highlightDistrict = toolDefinition({
	name: "highlight_district",
	description: `Draw the hover ring and label on a district without opening it, or clear it with null (${DISTRICT_GUIDE}).`,
	inputSchema: z.object({
		district: districtId.nullable().describe("null clears the highlight"),
	}),
	outputSchema: okResult,
});

export const setTimeOfDay = toolDefinition({
	name: "set_time_of_day",
	description:
		"Switch the city to day or night, or back to the automatic day/night cycle.",
	inputSchema: z.object({ mode: timeMode }),
	outputSchema: okResult.extend({ mode: timeMode.optional() }),
});

export const controlSimulation = toolDefinition({
	name: "control_simulation",
	description:
		"Pause or resume the traffic and pedestrian simulation and set its speed (0.25×–3×).",
	inputSchema: z.object({
		paused: z.boolean().optional(),
		speed: z.number().min(0.25).max(3).optional(),
	}),
	outputSchema: okResult.extend({
		paused: z.boolean().optional(),
		speed: z.number().optional(),
	}),
});

export const showMessage = toolDefinition({
	name: "show_message",
	description:
		"Show a short message bubble to the visitor at the bottom of the city.",
	inputSchema: z.object({
		text: z.string().min(1).max(400),
		title: z.string().min(1).max(60).optional(),
		seconds: z
			.number()
			.min(0)
			.max(60)
			.default(DEFAULT_MESSAGE_SECONDS)
			.describe("0 keeps it until dismissed"),
	}),
	outputSchema: okResult,
});

export const runTour = toolDefinition({
	name: "run_tour",
	description: `Guide the visitor through districts in order: the camera flies to each stop, highlights it and shows a caption; a new tour replaces a running one (${DISTRICT_GUIDE}).`,
	inputSchema: z.object({
		stops: z
			.array(
				z.object({
					district: districtId,
					caption: z
						.string()
						.max(200)
						.optional()
						.describe("Defaults to the district's tagline"),
					// 7 stops × 8 s stays under the MCP SDK's default 60 s request timeout.
					seconds: z.number().min(1).max(8).default(DEFAULT_TOUR_SECONDS),
				}),
			)
			.min(1)
			.max(7),
		zoom: zoom.default(DEFAULT_FOCUS_ZOOM),
	}),
	outputSchema: okResult.extend({
		stops: z.number().optional(),
		aborted: z.boolean().optional(),
	}),
});

// Simulation events: a news feed of what the city is doing, and staged happenings.

export const getCityEvents = toolDefinition({
	name: "get_city_events",
	description:
		"Read what the simulation has been doing (fire flare-ups, fire engine runs, bus arrivals, helicopter flights, festivals) for a news ticker or narration, plus named landmarks and the events that can be staged. Pass the returned lastId as `since` to get only newer events.",
	inputSchema: z.object({
		since: z
			.number()
			.int()
			.min(0)
			.default(0)
			.describe("Only events with a larger id"),
		limit: z.number().int().min(1).max(64).default(20),
	}),
	outputSchema: okResult.extend({
		lastId: z.number().optional(),
		simTime: z.number().optional(),
		events: z
			.array(
				z.object({
					id: z.number(),
					t: z.number().describe("Simulation time, seconds"),
					kind: z.enum(CITY_EVENT_KINDS),
					zone: districtId.nullable(),
					text: z.string(),
					x: z.number(),
					z: z.number(),
				}),
			)
			.optional(),
		landmarks: z
			.array(
				z.object({
					id: z.string(),
					name: z.string(),
					zone: districtId.nullable(),
					x: z.number(),
					z: z.number(),
					radius: z.number(),
				}),
			)
			.optional(),
		stages: z.array(z.enum(STAGE_KINDS)).optional(),
	}),
});

export const stageEvent = toolDefinition({
	name: "stage_event",
	description:
		"Make something happen in the city: fire_flare_up (the suburban house fire flares up), dispatch_fire_engine (the fire engine runs a lap with sirens), launch_helicopter (the medical helicopter takes off from the hospital), park_festival (a dancing crowd fills the central park for a minute).",
	inputSchema: z.object({ kind: z.enum(STAGE_KINDS) }),
	outputSchema: okResult.extend({ text: z.string().optional() }),
});

export const highlightSpot = toolDefinition({
	name: "highlight_spot",
	description:
		"Draw a pulsing ring around one spot in the city: a landmark id from get_city_events, or a ground point (x/z in world units, e.g. an event's position). Call with neither to clear it.",
	inputSchema: z.object({
		landmark: z.string().min(1).max(64).optional(),
		x: z.number().min(-250).max(250).optional(),
		z: z.number().min(-250).max(250).optional(),
		radius: z.number().min(2).max(40).optional().describe("Metres; default 6"),
		seconds: z
			.number()
			.min(0)
			.max(60)
			.default(DEFAULT_SPOT_SECONDS)
			.describe("0 keeps it until cleared"),
	}),
	outputSchema: okResult,
});

// CV data: answered in the page and by the remote MCP server.

export const getProfile = toolDefinition({
	name: "get_profile",
	description:
		"Get Adam Rais's profile: title, location, summary, headline achievements, spoken languages and links.",
	inputSchema: empty,
	outputSchema: profileResult,
});

export const listDistricts = toolDefinition({
	name: "list_districts",
	description: "List the city's districts with the CV chapter each one holds.",
	inputSchema: empty,
	outputSchema: z.object({ districts: z.array(districtSummarySchema) }),
});

export const getDistrictContent = toolDefinition({
	name: "get_district_content",
	description: `Get one CV chapter in full, as structured blocks and as markdown (${DISTRICT_GUIDE}).`,
	inputSchema: z.object({ district: districtId }),
	outputSchema: districtResult,
});

export const searchCv = toolDefinition({
	name: "search_cv",
	description:
		"Keyword-search Adam's CV (roles, achievements, skills, projects) and get the best-matching snippets with their district.",
	inputSchema: z.object({
		query: z.string().min(1).max(200),
		limit: z.number().int().min(1).max(20).default(DEFAULT_SEARCH_LIMIT),
	}),
	outputSchema: searchResult,
});

export const listExperience = toolDefinition({
	name: "list_experience",
	description:
		"List Adam's work history, newest first, with achievements and stack per role, plus education.",
	inputSchema: empty,
	outputSchema: experienceResult,
});

export const listSkills = toolDefinition({
	name: "list_skills",
	description: "List Adam's technical skills grouped by area.",
	inputSchema: empty,
	outputSchema: skillsResult,
});

export const listProjects = toolDefinition({
	name: "list_projects",
	description: "List Adam's open-source and side projects with links.",
	inputSchema: empty,
	outputSchema: projectsResult,
});

export const getContact = toolDefinition({
	name: "get_contact",
	description:
		"Get Adam's email address and LinkedIn, GitHub and site repository links.",
	inputSchema: empty,
	outputSchema: z.object({
		email: z.string(),
		linkedin: z.string(),
		github: z.string(),
		repo: z.string(),
	}),
});

export const getSiteGuide = toolDefinition({
	name: "get_site_guide",
	description:
		"Explain what adamgoodapp.com is, how to explore it, its districts and the available tools, as markdown.",
	inputSchema: empty,
	outputSchema: z.object({ markdown: z.string() }),
});

export const CITY_TOOLS = [
	getCityState,
	focusDistrict,
	setView,
	resetView,
	openDistrict,
	closeDistrict,
	highlightDistrict,
	setTimeOfDay,
	controlSimulation,
	showMessage,
	runTour,
	getCityEvents,
	stageEvent,
	highlightSpot,
] as const;

export const DATA_TOOLS = [
	getProfile,
	listDistricts,
	getDistrictContent,
	searchCv,
	listExperience,
	listSkills,
	listProjects,
	getContact,
	getSiteGuide,
] as const;

export type CityToolName = (typeof CITY_TOOLS)[number]["name"];
export type DataToolName = (typeof DATA_TOOLS)[number]["name"];
export type ToolName = CityToolName | DataToolName;

export interface ToolMeta {
	title: string;
	readOnly: boolean;
	/** The remote server attaches the MCP Apps CV widget to this tool's results. */
	widget: boolean;
}

export const TOOL_META: Record<ToolName, ToolMeta> = {
	get_city_state: { title: "Read city state", readOnly: true, widget: false },
	focus_district: { title: "Focus a district", readOnly: false, widget: false },
	set_view: { title: "Move the camera", readOnly: false, widget: false },
	reset_view: { title: "Reset the camera", readOnly: false, widget: false },
	open_district: {
		title: "Open a district card",
		readOnly: false,
		widget: false,
	},
	close_district: {
		title: "Close the district card",
		readOnly: false,
		widget: false,
	},
	highlight_district: {
		title: "Highlight a district",
		readOnly: false,
		widget: false,
	},
	set_time_of_day: {
		title: "Set day or night",
		readOnly: false,
		widget: false,
	},
	control_simulation: {
		title: "Control the simulation",
		readOnly: false,
		widget: false,
	},
	show_message: { title: "Show a message", readOnly: false, widget: false },
	run_tour: { title: "Run a guided tour", readOnly: false, widget: false },
	get_city_events: { title: "City news feed", readOnly: true, widget: false },
	stage_event: { title: "Stage a city event", readOnly: false, widget: false },
	highlight_spot: { title: "Highlight a spot", readOnly: false, widget: false },
	get_profile: { title: "Adam's profile", readOnly: true, widget: true },
	list_districts: { title: "List districts", readOnly: true, widget: false },
	get_district_content: { title: "CV chapter", readOnly: true, widget: true },
	search_cv: { title: "Search the CV", readOnly: true, widget: true },
	list_experience: { title: "Work experience", readOnly: true, widget: true },
	list_skills: { title: "Technical skills", readOnly: true, widget: true },
	list_projects: { title: "Side projects", readOnly: true, widget: true },
	get_contact: { title: "Contact details", readOnly: true, widget: false },
	get_site_guide: { title: "Site guide", readOnly: true, widget: false },
};
