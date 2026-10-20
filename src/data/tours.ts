import type { ZoneId } from "./zones";

export const TOUR_AUDIENCE_IDS = [
	"engineer",
	"recruiter",
	"founder",
	"any",
] as const;

export type TourAudienceId = (typeof TOUR_AUDIENCE_IDS)[number];

export interface TourAudience {
	id: TourAudienceId;
	label: string;
	/** Prompt wording for the audience. */
	description: string;
	/** Tour stops in visiting order. */
	stops: readonly ZoneId[];
}

/** Who a guided tour is for, and the route the Mayor flies for each audience. */
export const TOUR_AUDIENCES: readonly TourAudience[] = [
	{
		id: "engineer",
		label: "Engineer",
		description: "an engineer",
		stops: ["commercial", "downtown", "themepark", "mountains", "rural"],
	},
	{
		id: "recruiter",
		label: "Recruiter",
		description: "a recruiter or hiring manager",
		stops: ["beach", "downtown", "commercial", "rural", "residential"],
	},
	{
		id: "founder",
		label: "Founder",
		description: "a founder",
		stops: ["downtown", "beach", "themepark", "commercial"],
	},
	{
		id: "any",
		label: "No preference",
		description: "no particular audience",
		stops: ["downtown", "mountains", "commercial", "beach", "themepark"],
	},
];
