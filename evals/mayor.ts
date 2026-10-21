import { type AnyTextAdapter, chat, type ModelMessage } from "@tanstack/ai";
import { MAYOR_CHAT_SETTINGS, mayorDataTools } from "#/chat/server";
import { askTourAudience, type TourAudienceAnswer } from "#/chat/tour";
import { CITY_TOOLS } from "#/mcp/definitions";
import type { CvSearch } from "#/mcp/semantic-search";

export interface ToolCall {
	name: string;
	input: unknown;
}

/** One Mayor turn, as the evals see it. */
export interface MayorTranscript {
	toolCalls: ToolCall[];
	/** Text the Mayor wrote between tool calls, in order. */
	segments: string[];
	/** The last thing the Mayor wrote: what the visitor reads as the answer. */
	answer: string;
}

/** Plausible results for the browser-side city tools, as if the 3D city were running. */
function cityResult(name: string): unknown {
	switch (name) {
		case "get_city_state":
			return {
				ok: true,
				ready: true,
				tier: "webgpu",
				isDesktop: true,
				selected: null,
				hovered: null,
				timeMode: "auto",
				isNight: false,
				view: { x: 0, z: 0, zoom: 1 },
				simulation: { paused: false, speed: 1, simTime: 300, agents: 240 },
				districts: [],
			};
		case "get_city_events":
			return {
				ok: true,
				lastId: 2,
				simTime: 300,
				events: [
					{
						id: 1,
						t: 120,
						kind: "fire_flare_up",
						zone: "residential",
						text: "The house fire on Maple Row flared up",
						x: 60,
						z: 60,
					},
					{
						id: 2,
						t: 150,
						kind: "fire_engine_dispatched",
						zone: "residential",
						text: "Fire engine 1 left the station with sirens on",
						x: 55,
						z: 40,
					},
				],
				landmarks: [],
				stages: [
					"fire_flare_up",
					"dispatch_fire_engine",
					"launch_helicopter",
					"park_festival",
				],
			};
		case "run_tour":
			return { ok: true, stops: 5 };
		default:
			return { ok: true };
	}
}

export interface RunMayorOptions {
	adapter: AnyTextAdapter;
	search: CvSearch;
	/** What the visitor picks if the Mayor asks who a tour is for. */
	tourAnswer?: TourAudienceAnswer;
}

/**
 * Runs one request through the Mayor's real prompt, model and server tools.
 * Browser-side tools get stub results (a running city, a visitor answering
 * the tour question), so the whole agent loop runs in-process.
 */
export async function runMayor(
	messages: ModelMessage[],
	{ adapter, search, tourAnswer = { audience: "any" } }: RunMayorOptions,
): Promise<MayorTranscript> {
	const tools = [
		...mayorDataTools(search),
		...CITY_TOOLS.map((def) =>
			// Each stub returns its tool's output shape; the cast unifies the definitions' generics.
			def.server((() => cityResult(def.name)) as never),
		),
		askTourAudience.server(() => tourAnswer),
	];
	const calls = new Map<
		string,
		{ name: string; args: string; input?: unknown }
	>();
	const segments: string[] = [""];
	for await (const chunk of chat({
		adapter,
		messages,
		...MAYOR_CHAT_SETTINGS,
		tools,
	})) {
		switch (chunk.type) {
			case "TEXT_MESSAGE_CONTENT":
				segments[segments.length - 1] += chunk.delta ?? "";
				break;
			case "TOOL_CALL_START":
				calls.set(chunk.toolCallId, { name: chunk.toolCallName, args: "" });
				segments.push("");
				break;
			case "TOOL_CALL_ARGS": {
				const call = calls.get(chunk.toolCallId);
				if (call) call.args += chunk.delta;
				break;
			}
			case "TOOL_CALL_END": {
				const call = calls.get(chunk.toolCallId);
				if (call) call.input = chunk.input ?? JSON.parse(call.args || "{}");
				break;
			}
			case "RUN_ERROR":
				throw new Error(`Mayor run failed: ${JSON.stringify(chunk)}`);
		}
	}
	const written = segments.map((s) => s.trim()).filter(Boolean);
	return {
		toolCalls: [...calls.values()].map(({ name, input }) => ({ name, input })),
		segments: written,
		answer: written.at(-1) ?? "",
	};
}
