import { describe, expect, it } from "vitest";
import { GLYPHS, SIGN_TEXT } from "./sign";

describe("sign glyphs", () => {
	it("has a glyph for every character", () => {
		for (const ch of SIGN_TEXT) expect(GLYPHS[ch]).toBeDefined();
	});

	it("is 7 rows of 5 '.'/'#' cells", () => {
		for (const rows of Object.values(GLYPHS)) {
			expect(rows).toHaveLength(7);
			for (const row of rows) expect(row).toMatch(/^[.#]{5}$/);
		}
	});
});
