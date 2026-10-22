// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { profile, section } from "#/data/cv-query";
import { CvWidget } from "./CvWidget";

interface ToolResult {
	content?: { type: string; text?: string }[];
	structuredContent?: Record<string, unknown>;
}

interface FakeApp {
	ontoolresult?: (r: ToolResult) => void;
	onhostcontextchanged?: (ctx: { theme?: string }) => void;
	getHostContext(): { theme?: string };
	openLink(params: { url: string }): Promise<object>;
}

const fake = vi.hoisted(() => {
	const app: FakeApp = {
		getHostContext: () => ({ theme: "dark" }),
		openLink: async () => ({}),
	};
	return { app };
});

vi.mock("@modelcontextprotocol/ext-apps/react", () => ({
	useApp: (options: { onAppCreated?: (app: FakeApp) => void }) => {
		options.onAppCreated?.(fake.app);
		return { app: fake.app, isConnected: true, error: null };
	},
}));

globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
};

afterEach(cleanup);

function deliver(result: ToolResult) {
	act(() => fake.app.ontoolresult?.(result));
}

describe("CvWidget", () => {
	it("renders the profile card from structured content", () => {
		render(<CvWidget />);
		deliver({
			content: [],
			structuredContent: { kind: "profile", ...profile() },
		});
		expect(screen.getByText("Adam")).toBeTruthy();
		expect(
			screen.getByRole("link", { name: "GITHUB" }).getAttribute("href"),
		).toBe("https://github.com/AdamGoodApp");
	});

	it("renders a district with the site's ZoneContent", () => {
		render(<CvWidget />);
		deliver({
			structuredContent: { kind: "district", ...section("themepark") },
		});
		expect(screen.getAllByRole("link", { name: /OPEN/ })).toHaveLength(5);
	});

	it("falls back to the text content for unknown results", () => {
		render(<CvWidget />);
		deliver({
			content: [{ type: "text", text: "plain answer" }],
			structuredContent: { kind: "weather" },
		});
		expect(screen.getByText("plain answer")).toBeTruthy();
	});

	it("follows the host theme", () => {
		render(<CvWidget />);
		expect(document.documentElement.classList.contains("dark")).toBe(true);
		act(() => fake.app.onhostcontextchanged?.({ theme: "light" }));
		expect(document.documentElement.classList.contains("dark")).toBe(false);
		act(() => fake.app.onhostcontextchanged?.({}));
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("opens links through the host", () => {
		const openLink = vi.spyOn(fake.app, "openLink");
		render(<CvWidget />);
		deliver({ structuredContent: { kind: "profile", ...profile() } });
		const link = screen.getByRole("link", { name: "LINKEDIN" });
		const notPrevented = fireEvent.click(link);
		expect(notPrevented).toBe(false);
		expect(openLink).toHaveBeenCalledWith({
			url: "https://www.linkedin.com/in/adamrais/",
		});
	});
});
