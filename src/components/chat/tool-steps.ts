import { isZoneId, ZONE_BY_ID } from "#/data/zones";
import { TOOL_META } from "#/mcp/definitions";

const DISTRICT_TOOLS = new Set([
	"focus_district",
	"open_district",
	"highlight_district",
]);

function isToolName(name: string): name is keyof typeof TOOL_META {
	return name in TOOL_META;
}

/** One-line label for a tool call in the chat, e.g. "Focus a district · The Beach". */
export function describeToolCall(part: {
	name: string;
	input?: unknown;
}): string {
	if (part.name === "run_tour") return "Running a guided tour";
	const base = isToolName(part.name) ? TOOL_META[part.name].title : part.name;
	const input = part.input;
	if (typeof input !== "object" || input === null) return base;
	if (
		DISTRICT_TOOLS.has(part.name) &&
		"district" in input &&
		typeof input.district === "string" &&
		isZoneId(input.district)
	) {
		return `${base} · ${ZONE_BY_ID[input.district].district}`;
	}
	if (
		part.name === "stage_event" &&
		"kind" in input &&
		typeof input.kind === "string"
	) {
		return `${base} · ${input.kind}`;
	}
	return base;
}
