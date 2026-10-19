import { describe, expect, it } from "vitest";
import { type Block, CV } from "./cv";
import { ZONES } from "./zones";

function hrefs(blocks: Block[]): string[] {
	return blocks.flatMap((b) => (b.kind === "project" ? [b.href] : []));
}

function strings(blocks: Block[]): string[] {
	return blocks.flatMap((b) => {
		switch (b.kind) {
			case "bullets":
			case "badges":
				return b.items;
			case "tabs":
				return b.tabs.flatMap((t) => [...t.bullets, ...t.badges]);
			default:
				return [];
		}
	});
}

describe("CV content", () => {
	it("has an entry for every district", () => {
		for (const zone of ZONES) {
			expect(CV[zone.id]?.id).toBe(zone.id);
		}
	});

	it("only links to https or mailto targets", () => {
		for (const zone of Object.values(CV)) {
			const all = [
				...hrefs(zone.blocks),
				...(zone.links ?? []).map((l) => l.href),
			];
			for (const href of all) expect(href).toMatch(/^(https:\/\/|mailto:)/);
		}
	});

	it("has no empty bullets or badges", () => {
		for (const zone of Object.values(CV)) {
			for (const s of strings(zone.blocks)) expect(s.trim()).not.toBe("");
		}
	});

	it("gives every tab at least one bullet", () => {
		for (const zone of Object.values(CV)) {
			for (const block of zone.blocks) {
				if (block.kind !== "tabs") continue;
				for (const tab of block.tabs)
					expect(tab.bullets.length).toBeGreaterThan(0);
			}
		}
	});
});
