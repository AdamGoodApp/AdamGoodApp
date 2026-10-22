import { describe, expect, it } from "vitest";
import { DISASTER_KINDS, DISASTER_PRESETS } from "./presets";
import { eventSpecSchema, resolveTarget } from "./spec";

describe("event spec", () => {
	it("accepts every preset and keeps its name", () => {
		for (const kind of DISASTER_KINDS) {
			const preset = DISASTER_PRESETS[kind];
			expect(eventSpecSchema.parse(preset).name).toBe(preset.name);
		}
		expect(DISASTER_PRESETS.ufo_attack.actor?.parts).toHaveLength(12);
		expect(DISASTER_PRESETS.tsunami.actor).toBeUndefined();
	});

	it("bounds the actor at 20 parts", () => {
		const part = { shape: "box", size: [1, 1, 1], color: "#ff0000" };
		const spec = {
			name: "Too many",
			announcement: "Parts everywhere",
			actor: { parts: Array.from({ length: 21 }, () => part) },
			motion: { kind: "hover" },
			effects: [{ kind: "burn" }],
		};
		expect(eventSpecSchema.safeParse(spec).success).toBe(false);
		spec.actor.parts.pop();
		expect(eventSpecSchema.safeParse(spec).success).toBe(true);
	});

	it("resolves a district to its centre and nothing to the city centre", () => {
		expect(resolveTarget({ district: "downtown" })).toEqual({
			x: -58.5,
			z: -58.5,
		});
		expect(resolveTarget(undefined)).toEqual({ x: 0, z: 0 });
		expect(resolveTarget({ x: 12 })).toEqual({ x: 12, z: 0 });
	});
});
