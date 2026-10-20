import type { ContentPart } from "@tanstack/ai";
import { FIT_CHECK_PROMPT } from "./suggestions";

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENT_CHARS = 60_000;
export const ACCEPT = ".pdf,.txt,.md,application/pdf,text/plain,text/markdown";

export type Attachment =
	| { name: string; size: number; kind: "pdf"; base64: string }
	| { name: string; size: number; kind: "text"; text: string };

export const ATTACHMENT_ERRORS = {
	type: "PDF, TXT or MD files only.",
	size: "That file is over 4 MB.",
} as const;

function kindOf(file: File): Attachment["kind"] | null {
	const name = file.name.toLowerCase();
	if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
	if (
		name.endsWith(".txt") ||
		name.endsWith(".md") ||
		file.type.startsWith("text/")
	) {
		return "text";
	}
	return null;
}

function readBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const url = typeof reader.result === "string" ? reader.result : "";
			resolve(url.slice(url.indexOf(",") + 1));
		};
		reader.onerror = () => reject(reader.error ?? new Error("read failed"));
		reader.readAsDataURL(file);
	});
}

/** Read a job description the visitor picked; throws with a user-facing message. */
export async function readAttachment(file: File): Promise<Attachment> {
	const kind = kindOf(file);
	if (!kind) throw new Error(ATTACHMENT_ERRORS.type);
	if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(ATTACHMENT_ERRORS.size);
	const base = { name: file.name, size: file.size };
	if (kind === "pdf") {
		return { ...base, kind, base64: await readBase64(file) };
	}
	const text = await file.text();
	return {
		...base,
		kind,
		text:
			text.length > MAX_ATTACHMENT_CHARS
				? `${text.slice(0, MAX_ATTACHMENT_CHARS)}\n[truncated]`
				: text,
	};
}

/** The message content for a typed question plus an optional job description. */
export function attachmentParts(
	text: string,
	attachment: Attachment | null,
): ContentPart[] {
	const question = text.trim() || (attachment ? FIT_CHECK_PROMPT : "");
	const parts: ContentPart[] = [{ type: "text", content: question }];
	if (attachment?.kind === "pdf") {
		parts.push({
			type: "document",
			source: {
				type: "data",
				value: attachment.base64,
				mimeType: "application/pdf",
			},
			metadata: { filename: attachment.name },
		});
	} else if (attachment?.kind === "text") {
		parts.push({
			type: "text",
			content: `<job_description filename="${attachment.name}">\n${attachment.text}\n</job_description>`,
		});
	}
	return parts;
}
