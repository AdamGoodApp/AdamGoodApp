import type { z } from "zod";
import type { StageKind } from "../events";
import {
	type EventSpec,
	type EventSpecInput,
	eventSpecSchema,
	type partSchema,
} from "./spec";

/** The built-in disasters: `stage_event` kinds and the Events menu entries. */
export const DISASTER_KINDS = [
	"ufo_attack",
	"tornado",
	"black_hole",
	"tsunami",
] as const satisfies readonly StageKind[];
export type DisasterKind = (typeof DISASTER_KINDS)[number];

export function isDisasterKind(kind: string): kind is DisasterKind {
	return (DISASTER_KINDS as readonly string[]).includes(kind);
}

/** Parse at module load so the presets carry every default. */
const spec = (s: EventSpecInput): EventSpec => eventSpecSchema.parse(s);

type PartInput = z.input<typeof partSchema>;

/** `n` copies of a part spaced evenly on a circle of `radius` at height `y`. */
function ringOf(
	n: number,
	radius: number,
	y: number,
	part: Omit<PartInput, "at">,
): PartInput[] {
	return Array.from({ length: n }, (_, i) => {
		const a = (i / n) * Math.PI * 2;
		return {
			...part,
			at: [Math.cos(a) * radius, y, Math.sin(a) * radius],
		};
	});
}

const DEBRIS = ["#7a5230", "#8c9196", "#c9bca8"] as const;

export const DISASTER_PRESETS: Record<DisasterKind, EventSpec> = {
	ufo_attack: spec({
		name: "UFO attack",
		announcement:
			"A flying saucer is zapping {where} and buildings are going up in flames",
		actor: {
			parts: [
				{
					shape: "cylinder",
					size: [9, 1.4, 6],
					at: [0, 0, 0],
					color: "#9aa3ad",
				},
				{
					shape: "cylinder",
					size: [6, 1, 3],
					at: [0, -1.1, 0],
					color: "#6f7781",
				},
				{
					shape: "sphere",
					size: [3.2, 0, 0],
					at: [0, 1.4, 0],
					color: "#8fd3ff",
					glow: true,
				},
				...ringOf(8, 7.5, -0.2, {
					shape: "box",
					size: [0.8, 0.4, 0.8],
					color: "#ffe66d",
					glow: true,
				}),
				{
					shape: "cone",
					size: [1.2, 1, 0],
					at: [0, -2.1, 0],
					rotate: [180, 0, 0],
					color: "#aef4ff",
					glow: true,
				},
			],
		},
		motion: {
			kind: "hover",
			waypoints: [{ district: "downtown" }, { district: "commercial" }],
			altitude: 42,
			speed: 5,
			spin: 1.2,
			bob: 1.5,
		},
		effects: [{ kind: "zap", radius: 30, every: 2.5 }],
		seconds: 24,
	}),
	tornado: spec({
		name: "Tornado",
		announcement: "A tornado is tearing through {where}, flattening buildings",
		actor: {
			parts: [
				{
					shape: "cylinder",
					size: [1.2, 6, 3],
					at: [0, 3, 0],
					color: "#a39b90",
				},
				{
					shape: "cylinder",
					size: [3, 7, 5.5],
					at: [0, 9.5, 0],
					color: "#b0a89d",
				},
				{
					shape: "cylinder",
					size: [5.5, 8, 8.5],
					at: [0, 17, 0],
					color: "#bdb5aa",
				},
				{
					shape: "cylinder",
					size: [8.5, 9, 12],
					at: [0, 25.5, 0],
					color: "#c8c0b5",
				},
				{
					shape: "cylinder",
					size: [12, 8, 15],
					at: [0, 34, 0],
					color: "#d2cabf",
				},
				{
					shape: "cylinder",
					size: [15, 2, 17],
					at: [0, 39, 0],
					color: "#dad2c8",
				},
				...(
					[
						[7, 8, 0],
						[-8, 14, 4],
						[4, 20, -11],
						[-14, 26, -6],
						[15, 30, 9],
						[-6, 36, 18],
					] as const
				).map((at, i) => ({
					shape: "box" as const,
					size: [1.2, 1.2, 1.2],
					at: [...at],
					color: DEBRIS[i % DEBRIS.length],
				})),
			],
		},
		motion: {
			kind: "roam",
			waypoints: [
				{ district: "downtown" },
				{ district: "commercial" },
				{ district: "residential" },
				{ district: "beach" },
			],
			altitude: 0,
			speed: 7,
			spin: 7,
		},
		effects: [{ kind: "crush", radius: 9 }],
		seconds: 30,
	}),
	black_hole: spec({
		name: "Black hole",
		announcement:
			"A black hole has opened over the centre of town and is swallowing the city",
		actor: {
			parts: [
				{ shape: "sphere", size: [6, 0, 0], color: "#050508" },
				{ shape: "ring", size: [12, 1.3, 0], color: "#ffa24a", glow: true },
				{
					shape: "ring",
					size: [16, 0.6, 0],
					rotate: [12, 0, 0],
					color: "#ffd27a",
					glow: true,
				},
			],
		},
		motion: {
			kind: "hover",
			waypoints: [{ x: 0, z: 0 }],
			altitude: 30,
			spin: 2.5,
		},
		effects: [{ kind: "suck", radius: 160 }],
		seconds: 14,
	}),
	tsunami: spec({
		name: "Tsunami",
		announcement: "A tsunami has hit {where} and the whole city is going under",
		motion: {
			kind: "sweep",
			// From the sea off the beach corner (south-west) to the north-east.
			waypoints: [
				{ x: -120, z: 120 },
				{ x: 120, z: -120 },
			],
			speed: 30,
		},
		effects: [
			{ kind: "flood", level: 70, crest: 12 },
			{ kind: "crush", radius: 6 },
		],
		seconds: 12,
	}),
};
