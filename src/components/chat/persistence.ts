import type { UIMessage } from "@tanstack/ai-react";
import { z } from "zod";

const KEY = "adamgoodapp:mayor-chat:v1";

/** What saveMessages writes; message parts are the client's own `UIMessage` parts. */
const StoredMessages = z.array(
	z.looseObject({
		id: z.string(),
		role: z.enum(["user", "assistant"]),
		parts: z.array(z.looseObject({ type: z.string() })),
	}),
);

/** The conversation of this tab, or [] when there is none or it is unreadable. */
export function loadMessages(): UIMessage[] {
	try {
		const raw = sessionStorage.getItem(KEY);
		if (!raw) return [];
		const messages = JSON.parse(raw);
		return StoredMessages.safeParse(messages).success ? messages : [];
	} catch {
		return [];
	}
}

/**
 * Store the conversation for reloads. Attached PDFs are replaced by a note:
 * their base64 would blow the storage quota, and the model is told the file
 * is gone instead of receiving an empty document. `createdAt` is dropped
 * (JSON would turn the Date into a string).
 */
export function saveMessages(messages: readonly UIMessage[]): void {
	const slim = messages.map((m) => ({
		...m,
		createdAt: undefined,
		parts: m.parts.map((p) =>
			p.type === "document"
				? {
						type: "text" as const,
						content:
							"[A PDF job description was attached earlier; it is not kept after a page reload.]",
					}
				: p,
		),
	}));
	try {
		sessionStorage.setItem(KEY, JSON.stringify(slim));
	} catch {
		// Storage full or disabled: the chat just won't survive a reload.
	}
}

export function clearMessages(): void {
	try {
		sessionStorage.removeItem(KEY);
	} catch {
		// Storage disabled: nothing to clear.
	}
}
