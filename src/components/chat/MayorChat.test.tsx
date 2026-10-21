// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MayorDock } from "./MayorDock";

const chat = vi.hoisted(() => ({
	messages: [] as unknown[],
	sendMessage: vi.fn(),
	status: "ready",
	error: undefined,
	stop: vi.fn(),
	clear: vi.fn(),
	queue: [] as unknown[],
	cancelQueued: vi.fn(),
}));

vi.mock("@tanstack/ai-react", () => ({
	useChat: () => chat,
	fetchServerSentEvents: () => ({}),
}));
vi.mock("liquid-glass-react", () => ({
	default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

class NoopObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords() {
		return [];
	}
}
globalThis.ResizeObserver ??= NoopObserver;
// @ts-expect-error jsdom has no IntersectionObserver; the scroller only needs the API surface.
globalThis.IntersectionObserver ??= NoopObserver;

function renderDock() {
	return render(
		<MayorDock
			worldRef={{ current: null }}
			select={() => {}}
			hover={() => {}}
		/>,
	);
}

const dock = () => screen.getByTestId("mayor-dock");

beforeEach(() => {
	chat.messages = [];
	chat.sendMessage.mockClear();
	sessionStorage.clear();
	localStorage.clear();
});
afterEach(cleanup);

describe("MayorDock", () => {
	it("holds a sixth request in a minute back, keeping the draft, even across a reload", () => {
		const { unmount } = renderDock();
		const input = screen.getByTestId("mayor-input");
		const sendText = (text: string) => {
			fireEvent.change(input, { target: { value: text } });
			fireEvent.keyDown(input, { key: "Enter" });
		};
		for (let i = 1; i <= 3; i++) sendText(`question ${i}`);
		unmount();

		// The allowance is stored, so reloading does not reset it.
		renderDock();
		const again = screen.getByTestId("mayor-input");
		for (let i = 4; i <= 6; i++) {
			fireEvent.change(again, { target: { value: `question ${i}` } });
			fireEvent.keyDown(again, { key: "Enter" });
		}
		expect(chat.sendMessage).toHaveBeenCalledTimes(5);
		expect(chat.sendMessage).not.toHaveBeenCalledWith("question 6");
		expect(again).toHaveProperty("value", "question 6");
		expect(screen.getByTestId("mayor-limit").textContent).toMatch(
			/5 requests a minute: next in \d+s/,
		);
	});

	it("starts as a bar and opens when a suggestion is sent", () => {
		renderDock();
		expect(dock().dataset.state).toBe("collapsed");
		fireEvent.click(
			screen.getByRole("button", { name: /What's happening in the city\?/ }),
		);
		expect(chat.sendMessage).toHaveBeenCalledWith(
			"What's happening in the city right now?",
		);
		expect(dock().dataset.state).toBe("expanded");
		fireEvent.click(screen.getByRole("button", { name: "Minimise chat" }));
		expect(dock().dataset.state).toBe("collapsed");
	});

	it("summarises tool steps in a chain of thought and renders markdown answers", () => {
		chat.messages = [
			{
				id: "a1",
				role: "assistant",
				parts: [
					{
						type: "tool-call",
						id: "c1",
						name: "focus_district",
						arguments: "{}",
						input: { district: "beach" },
						state: "complete",
						output: { ok: true },
					},
					{
						type: "tool-call",
						id: "c2",
						name: "stage_event",
						arguments: "{}",
						input: { kind: "park_festival" },
						state: "complete",
						output: { ok: false, error: "No city here" },
					},
					{ type: "text", content: "**Beach** it is." },
				],
			},
		];
		renderDock();
		const messages = screen.getByTestId("mayor-messages");
		// Collapsed once the answer is in: just the summary.
		expect(messages.textContent).not.toContain("Focus a district");
		fireEvent.click(screen.getByText("Took 2 steps, 1 failed"));
		expect(messages.textContent).toContain("Focus a district · The Beach");
		expect(messages.textContent).toContain("· No city here");
		expect(screen.getByText("Beach").tagName).toBe("STRONG");
	});

	it("rejects unsupported files", async () => {
		renderDock();
		fireEvent.change(screen.getByTestId("mayor-file"), {
			target: { files: [new File(["x"], "cv.docx")] },
		});
		expect(await screen.findByRole("alert")).toHaveProperty(
			"textContent",
			"PDF, TXT or MD files only.",
		);
	});

	it("sends a text job description with the question", async () => {
		renderDock();
		fireEvent.change(screen.getByTestId("mayor-file"), {
			target: {
				files: [
					new File(["Senior Rust engineer"], "jd.txt", { type: "text/plain" }),
				],
			},
		});
		expect(
			(await screen.findByTestId("mayor-attachment")).textContent,
		).toContain("jd.txt");
		fireEvent.change(screen.getByTestId("mayor-input"), {
			target: { value: "Does Adam fit?" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Send" }));
		await waitFor(() => expect(chat.sendMessage).toHaveBeenCalledOnce());
		expect(chat.sendMessage.mock.calls[0]?.[0]).toEqual({
			content: [
				{ type: "text", content: "Does Adam fit?" },
				{
					type: "text",
					content:
						'<job_description filename="jd.txt">\nSenior Rust engineer\n</job_description>',
				},
			],
			metadata: { attachment: { name: "jd.txt", size: 20 } },
		});
	});
});
