// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CV } from "#/data/cv";
import { placeCard, ZoneCard } from "./ZoneCard";

globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
};

afterEach(cleanup);

describe("ZoneCard", () => {
	it("opens every project link in a new tab without a referrer", () => {
		render(
			<ZoneCard
				zone={CV.themepark}
				anchor={{ x: 600, y: 500 }}
				onClose={() => {}}
			/>,
		);
		const links = screen.getAllByRole("link", { name: /OPEN/ });
		expect(links).toHaveLength(5);
		for (const link of links) {
			expect(link.getAttribute("target")).toBe("_blank");
			expect(link.getAttribute("rel")).toBe("noreferrer");
		}
	});

	it("closes from the close button and from Escape", () => {
		const onClose = vi.fn();
		render(
			<ZoneCard
				zone={CV.beach}
				anchor={{ x: 600, y: 500 }}
				onClose={onClose}
			/>,
		);
		const close = screen.getByRole("button", { name: "Close" });
		expect(document.activeElement).toBe(close);
		fireEvent.click(close);
		fireEvent.keyDown(window, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(2);
	});
});

describe("placeCard", () => {
	const viewport = { width: 1440, height: 900 };

	it("sits above the anchor when there is room", () => {
		const p = placeCard({ x: 720, y: 600 }, 300, viewport);
		expect(p.below).toBe(false);
		expect(p.top).toBe(600 - 14 - 300);
		expect(p.left).toBe(720 - 220);
	});

	it("flips below the anchor near the top edge and clamps to the viewport", () => {
		const p = placeCard({ x: 10, y: 100 }, 300, viewport);
		expect(p.below).toBe(true);
		expect(p.top).toBe(114);
		expect(p.left).toBe(16);
		expect(placeCard({ x: 1430, y: 600 }, 300, viewport).left).toBe(
			1440 - 440 - 16,
		);
	});
});
