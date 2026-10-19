// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LINKS } from "#/data/links";
import { StaticFallback } from "./StaticFallback";

afterEach(cleanup);

describe("StaticFallback", () => {
	it("shows the title and the three contact links", () => {
		render(<StaticFallback />);
		expect(
			screen.getByRole("heading", { level: 1, name: "ADAMGOODAPP" }),
		).toBeTruthy();
		const nav = screen.getByRole("navigation", { name: "Contact" });
		const hrefs = within(nav)
			.getAllByRole("link")
			.map((a) => a.getAttribute("href"));
		expect(hrefs).toEqual([LINKS.linkedin, LINKS.github, LINKS.email]);
	});
});
