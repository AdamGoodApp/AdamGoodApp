import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CITY_TOOLS, DATA_TOOLS, TOOL_META } from "./definitions";
import { widgetResultSchema } from "./schemas";

const ALL = [...CITY_TOOLS, ...DATA_TOOLS];

function kindOf(tool: (typeof ALL)[number]): unknown {
	const shape: Record<string, unknown> = tool.outputSchema.shape;
	return shape.kind instanceof z.ZodLiteral ? shape.kind.value : undefined;
}

describe("tool definitions", () => {
	it("use unique WebMCP-safe names, each with metadata", () => {
		const names = ALL.map((t) => t.name);
		for (const name of names) expect(name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
		expect(new Set(names).size).toBe(names.length);
		expect(Object.keys(TOOL_META).sort()).toEqual([...names].sort());
	});

	it("attach the widget only to results it can render", () => {
		const widgetKinds = widgetResultSchema.options.map(
			(o) => o.shape.kind.value,
		);
		for (const tool of ALL) {
			const kind = kindOf(tool);
			const renderable = widgetKinds.some((k) => k === kind);
			expect(TOOL_META[tool.name].widget, tool.name).toBe(renderable);
		}
	});
});
