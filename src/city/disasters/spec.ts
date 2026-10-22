import { z } from "zod";
import { ZONE_BY_ID, ZONE_IDS } from "#/data/zones";

/**
 * The event spec: what the Mayor fills in to stage a city event, and the
 * format the built-in presets are written in. An actor made of chunky parts
 * (the city's own design language), how it moves, and what it does to the
 * buildings. Kept free of three.js and `@tanstack/ai` so the tool definitions
 * and the city can both import it.
 */

const num = (min: number, max: number) => z.number().min(min).max(max);
const hex = z
	.string()
	.regex(/^#[0-9a-fA-F]{6}$/)
	.describe("#rrggbb");
// Arrays of length 3, not z.tuple: tuples become JSON-Schema prefixItems, which the model-facing converter may drop.
const vec3 = (min: number, max: number, text: string) =>
	z.array(num(min, max)).length(3).describe(text);

export const PART_SHAPES = [
	"box",
	"cylinder",
	"cone",
	"sphere",
	"ring",
] as const;
export type PartShape = (typeof PART_SHAPES)[number];

export const partSchema = z.object({
	shape: z.enum(PART_SHAPES),
	// Unused components are 0; the actor builder floors the used ones at 0.1 m.
	size: vec3(
		0,
		90,
		"metres: box [width, height, depth]; cylinder [bottom radius, height, top radius]; cone [radius, height, 0]; sphere [radius, 0, 0]; ring [radius, tube radius, 0] (lies flat)",
	),
	at: vec3(
		-90,
		90,
		"centre of the part relative to the actor origin [x, y, z], metres, y up",
	).default([0, 0, 0]),
	rotate: vec3(-360, 360, "degrees about [x, y, z]").default([0, 0, 0]),
	color: hex,
	glow: z
		.boolean()
		.default(false)
		.describe("emits light: lamps, beams, eyes, energy"),
});
export type EventPart = z.infer<typeof partSchema>;

export const targetSchema = z
	.object({
		district: z.enum(ZONE_IDS).optional(),
		x: num(-120, 120).optional(),
		z: num(-120, 120).optional(),
	})
	.describe(
		"a district, or a ground point in metres (the city centre is 0,0; districts span ±84); empty = the centre",
	);
export type EventTarget = z.infer<typeof targetSchema>;

export const MOTION_KINDS = ["hover", "roam", "sweep"] as const;
export type MotionKind = (typeof MOTION_KINDS)[number];

export const motionSchema = z.object({
	kind: z
		.enum(MOTION_KINDS)
		.describe(
			"hover: stay over the first waypoint, drifting to the others if given; roam: travel the waypoints in a loop; sweep: cross the city once from the first waypoint to the last (a wave, a stampede)",
		),
	waypoints: z.array(targetSchema).max(6).default([]),
	altitude: num(0, 80)
		.default(0)
		.describe("height of the actor origin above ground, metres"),
	speed: num(0, 40).default(8).describe("metres per second"),
	spin: num(-10, 10)
		.default(0)
		.describe("rotation about the vertical axis, radians per second"),
	bob: num(0, 6).default(0).describe("vertical bob amplitude, metres"),
});
export type EventMotion = z.infer<typeof motionSchema>;

export const effectSchema = z.discriminatedUnion("kind", [
	z
		.object({
			kind: z.literal("zap"),
			radius: num(5, 60).default(30),
			every: num(0.5, 10).default(2.5),
			color: hex.default("#aef4ff"),
		})
		.describe(
			"every `every` seconds a beam from the actor strikes the nearest intact building within radius and sets it ablaze",
		),
	z
		.object({ kind: z.literal("burn"), radius: num(2, 40).default(8) })
		.describe("buildings within radius of the actor catch fire"),
	z
		.object({ kind: z.literal("crush"), radius: num(2, 40).default(9) })
		.describe(
			"buildings within radius of the actor collapse into rubble and dust",
		),
	z
		.object({ kind: z.literal("suck"), radius: num(20, 200).default(160) })
		.describe(
			"buildings are pulled into the actor, then the whole city spirals in and only black space remains",
		),
	z
		.object({
			kind: z.literal("flood"),
			level: num(1, 90).default(70),
			crest: num(0, 30).default(12),
		})
		.describe(
			"a wall of water sweeps across the city from the first waypoint to the last and leaves it under `level` metres of water",
		),
]);
export type EventEffect = z.infer<typeof effectSchema>;

export const eventSpecSchema = z.object({
	name: z.string().min(2).max(40),
	announcement: z
		.string()
		.min(4)
		.max(140)
		.describe("one news-ticker line; {where} becomes the district name"),
	actor: z
		.object({ parts: z.array(partSchema).min(1).max(20) })
		.optional()
		.describe(
			"what the visitor sees, built from chunky parts; omit for a pure flood",
		),
	motion: motionSchema,
	effects: z.array(effectSchema).min(1).max(3),
	seconds: num(5, 60)
		.default(20)
		.describe("how long the event runs before its aftermath"),
});
export type EventSpec = z.infer<typeof eventSpecSchema>;
export type EventSpecInput = z.input<typeof eventSpecSchema>;

/** Ground point of a target: a district's centre, a point, or the city centre. */
export function resolveTarget(t: EventTarget | undefined): {
	x: number;
	z: number;
} {
	if (t?.district) {
		const r = ZONE_BY_ID[t.district].rect;
		return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
	}
	return { x: t?.x ?? 0, z: t?.z ?? 0 };
}
