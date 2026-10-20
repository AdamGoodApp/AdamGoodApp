import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { TOUR_AUDIENCE_IDS } from "#/data/tours";

/**
 * Chat-only: asks who a guided tour is for. It has no implementation on
 * either side, so the run pauses on the call until the visitor answers in the
 * dock (a choice button, or a typed reply), which becomes the tool result.
 */
export const askTourAudience = toolDefinition({
	name: "ask_tour_audience",
	description:
		"Show the visitor clickable choices for who a guided tour is for (engineer, recruiter, founder, no preference) and wait for their answer.",
	inputSchema: z.object({}),
	outputSchema: z.union([
		z.object({ audience: z.enum(TOUR_AUDIENCE_IDS) }),
		z.object({ reply: z.string() }),
	]),
});

export type TourAudienceAnswer = z.infer<typeof askTourAudience.outputSchema>;
