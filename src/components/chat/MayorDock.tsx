import {
	fetchServerSentEvents,
	type UIMessage,
	useChat,
} from "@tanstack/ai-react";
import LiquidGlass from "liquid-glass-react";
import {
	ArrowUp,
	Check,
	ChevronDown,
	ChevronUp,
	LoaderCircle,
	Paperclip,
	Plus,
	RotateCcw,
	Square,
	X,
} from "lucide-react";
import {
	type FormEvent,
	type KeyboardEvent,
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Bubble, BubbleContent } from "#/components/ui/bubble";
import { Button } from "#/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "#/components/ui/input-group";
import {
	Message,
	MessageContent,
	MessageHeader,
} from "#/components/ui/message";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "#/components/ui/message-scroller";
import { cn } from "#/lib/utils";
import { CITY_CLIENT_TOOLS } from "#/mcp/client-tools";
import type { CityToolContext } from "#/mcp/context";
import {
	ACCEPT,
	type Attachment,
	attachmentParts,
	readAttachment,
} from "./attachments";
import type { MayorChatProps } from "./MayorChat";
import { MayorMarkdown } from "./MayorMarkdown";
import { clearMessages, loadMessages, saveMessages } from "./persistence";
import { MAYOR_SUGGESTIONS, type MayorSuggestion } from "./suggestions";
import { describeToolCall } from "./tool-steps";

const CONNECTION = fetchServerSentEvents("/api/chat");

type Part = UIMessage["parts"][number];
type ToolCall = Extract<Part, { type: "tool-call" }>;

/** Whether a tool call has finished, from its own state or a matching result part. */
function toolDone(part: ToolCall, results: ReadonlySet<string>): boolean {
	return (
		part.state === "complete" ||
		part.state === "error" ||
		part.output !== undefined ||
		results.has(part.id)
	);
}

function toolError(part: ToolCall): string | null {
	if (part.state === "error") return "failed";
	const output: unknown = part.output;
	if (
		typeof output === "object" &&
		output !== null &&
		"ok" in output &&
		output.ok === false
	) {
		return "error" in output && typeof output.error === "string"
			? output.error
			: "failed";
	}
	return null;
}

function resultIds(message: UIMessage): Set<string> {
	const ids = new Set<string>();
	for (const p of message.parts) {
		if (p.type === "tool-result") ids.add(p.toolCallId);
	}
	return ids;
}

function attachmentName(message: UIMessage): string | null {
	const name = message.metadata?.attachment?.name;
	return typeof name === "string" ? name : null;
}

function friendlyError(error: Error): string {
	if (/429|rate limit|too many/i.test(error.message)) {
		return "The Mayor is swamped — give it a minute and try again.";
	}
	if (/503|not configured|off duty/i.test(error.message)) {
		return "Chat isn't available right now.";
	}
	return "Something went wrong talking to the Mayor. Please try again.";
}

function ToolStep({ part, done }: { part: ToolCall; done: boolean }) {
	const error = done ? toolError(part) : null;
	const icon = !done ? (
		<LoaderCircle className="size-3.5 animate-spin" />
	) : error ? (
		<X className="size-3.5 text-[#ff8a80]" />
	) : (
		<Check className="size-3.5 text-[#86efac]" />
	);
	return (
		<div className="flex items-center gap-2 text-xs text-white/70">
			{icon}
			<span>{describeToolCall(part)}</span>
			{error && <span className="text-[#ff8a80]">· {error}</span>}
		</div>
	);
}

function UserMessage({ message }: { message: UIMessage }) {
	const first = message.parts.find((p) => p.type === "text");
	const file = attachmentName(message);
	return (
		<Message align="end">
			<MessageContent>
				{first && (
					<Bubble
						align="end"
						variant="muted"
						className="*:data-[slot=bubble-content]:bg-white/15 *:data-[slot=bubble-content]:text-white"
					>
						<BubbleContent className="whitespace-pre-wrap">
							{first.content}
						</BubbleContent>
					</Bubble>
				)}
				{file && (
					<span className="flex items-center gap-1 self-end text-xs text-white/70">
						<Paperclip className="size-3" /> {file}
					</span>
				)}
			</MessageContent>
		</Message>
	);
}

function AssistantMessage({ message }: { message: UIMessage }) {
	const results = resultIds(message);
	const body: ReactNode[] = [];
	message.parts.forEach((p, i) => {
		const key = `${message.id}-${i}`;
		if (p.type === "tool-call") {
			body.push(<ToolStep key={key} part={p} done={toolDone(p, results)} />);
		} else if (p.type === "text" && p.content.trim()) {
			body.push(<MayorMarkdown key={key}>{p.content}</MayorMarkdown>);
		}
	});
	return (
		<Message>
			<MessageContent className="gap-2 text-white">
				<MessageHeader className="px-0">
					<span className="retro text-[10px] text-[#f0a585]">Mayor</span>
				</MessageHeader>
				{body}
			</MessageContent>
		</Message>
	);
}

function SuggestionPills({
	onPick,
}: {
	onPick(suggestion: MayorSuggestion): void;
}) {
	return (
		<div className="no-scrollbar flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:justify-center sm:overflow-visible lg:-mx-28">
			{MAYOR_SUGGESTIONS.map((s) => (
				<button
					key={s.id}
					type="button"
					onClick={() => onPick(s)}
					className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-black/35 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-md transition hover:bg-black/50 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
				>
					<s.icon className="size-3.5" />
					{s.label}
				</button>
			))}
		</div>
	);
}

/** The Mayor chat: a liquid-glass input bar that opens into the conversation. */
export function MayorDock({ worldRef, select, hover }: MayorChatProps) {
	const [expanded, setExpanded] = useState(false);
	const [draft, setDraft] = useState("");
	const [attachment, setAttachment] = useState<Attachment | null>(null);
	const [attachError, setAttachError] = useState<string | null>(null);
	const [glassHeight, setGlassHeight] = useState(0);
	const dockRef = useRef<HTMLDivElement>(null);
	const bodyRef = useRef<HTMLDivElement>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const reopenAfterTour = useRef(false);
	/** Draft to send as soon as the picked file has been read (the fit-check pill). */
	const sendAfterPick = useRef<string | null>(null);

	const context = useMemo<CityToolContext>(
		() => ({ world: () => worldRef.current, select, hover }),
		[worldRef, select, hover],
	);
	const [initialMessages] = useState(loadMessages);
	const [restoredIds] = useState(
		() => new Set(initialMessages.map((m) => m.id)),
	);
	const { messages, sendMessage, status, error, stop, clear } = useChat({
		connection: CONNECTION,
		tools: CITY_CLIENT_TOOLS,
		context,
		initialMessages,
		onError: (e) => console.error("[mayor]", e),
	});
	const busy = status === "submitted" || status === "streaming";

	useEffect(() => {
		if (status === "ready") saveMessages(messages);
	}, [status, messages]);

	// Tours fly the camera around: get out of the way, then come back.
	const touring = messages.some(
		(m) =>
			m.role === "assistant" &&
			!restoredIds.has(m.id) &&
			m.parts.some(
				(p) =>
					p.type === "tool-call" &&
					p.name === "run_tour" &&
					!toolDone(p, resultIds(m)),
			),
	);
	useEffect(() => {
		if (touring) {
			setExpanded((open) => {
				if (open) reopenAfterTour.current = true;
				return false;
			});
		} else if (reopenAfterTour.current) {
			reopenAfterTour.current = false;
			setExpanded(true);
		}
	}, [touring]);

	// Publish the dock's height for the HUD, and keep the glass sized to its body.
	useLayoutEffect(() => {
		const dock = dockRef.current;
		const body = bodyRef.current;
		if (!dock || !body) return;
		const root = document.documentElement;
		const update = () => {
			setGlassHeight(body.offsetHeight);
			root.style.setProperty(
				"--mayor-dock",
				`${Math.round(window.innerHeight - dock.getBoundingClientRect().top)}px`,
			);
		};
		update();
		const observer = new ResizeObserver(() => {
			update();
			// LiquidGlass measures itself only on mount and on window resize.
			window.dispatchEvent(new Event("resize"));
		});
		observer.observe(dock);
		observer.observe(body);
		window.addEventListener("resize", update);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", update);
			root.style.removeProperty("--mayor-dock");
		};
	}, []);

	const canSend = !busy && (draft.trim().length > 0 || attachment !== null);

	function send(text = draft, file = attachment) {
		if (busy || (!text.trim() && !file)) return;
		if (file) {
			void sendMessage({
				content: attachmentParts(text, file),
				metadata: { attachment: { name: file.name, size: file.size } },
			});
		} else {
			void sendMessage(text.trim());
		}
		setDraft("");
		if (textareaRef.current) textareaRef.current.style.height = "";
		setAttachment(null);
		setAttachError(null);
		setExpanded(true);
		textareaRef.current?.focus();
	}

	function pick(s: MayorSuggestion) {
		setDraft(s.prompt);
		if (s.pickFile) {
			sendAfterPick.current = s.prompt;
			fileRef.current?.click();
		} else {
			send(s.prompt, attachment);
		}
	}

	async function onFile(file: File | undefined) {
		const pending = sendAfterPick.current;
		sendAfterPick.current = null;
		setAttachError(null);
		if (!file) return;
		try {
			const read = await readAttachment(file);
			if (pending !== null) send(pending, read);
			else setAttachment(read);
		} catch (e) {
			setAttachError(e instanceof Error ? e.message : String(e));
		}
	}

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		send();
	}

	function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault();
			send();
		} else if (e.key === "Escape") {
			setExpanded(false);
		}
	}

	function newChat() {
		stop();
		clear();
		clearMessages();
		setExpanded(false);
	}

	const iconButton = "size-8 text-white/70 hover:bg-white/10 hover:text-white";

	return (
		<div
			ref={dockRef}
			data-testid="mayor-dock"
			data-state={expanded ? "expanded" : "collapsed"}
			className="fixed bottom-5 left-1/2 z-30 flex w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 flex-col items-stretch gap-3 max-sm:bottom-4"
		>
			{!expanded && <SuggestionPills onPick={pick} />}
			<div
				className="mayor-glass relative w-full"
				style={{ height: glassHeight }}
			>
				<LiquidGlass
					displacementScale={40}
					blurAmount={0.35}
					saturation={120}
					aberrationIntensity={1.5}
					elasticity={0}
					cornerRadius={28}
					padding="0"
					mode="standard"
					className="flex"
					style={{ position: "absolute", top: "50%", left: "50%" }}
				>
					<div
						ref={bodyRef}
						data-testid="mayor-chat"
						className="mayor-chat relative w-[min(640px,calc(100vw-2rem))] overflow-hidden rounded-[28px] bg-[#101012]/55 font-sans text-sm leading-normal text-white [text-shadow:none]"
					>
						<div className="mayor-edge" aria-hidden="true" />
						<div className="mayor-ring" aria-hidden="true" />
						<div
							className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
							style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
						>
							<div
								inert={!expanded}
								className={cn(
									"min-h-0 overflow-hidden transition-[visibility] duration-300",
									!expanded && "invisible",
								)}
							>
								<header className="flex items-center justify-between px-5 pt-4 pb-2">
									<div>
										<p className="retro text-[10px] text-[#f0a585]">
											THE MAYOR
										</p>
										<p className="text-xs text-white/60">
											Ask about Adam's work — the city answers.
										</p>
									</div>
									<div className="flex gap-1">
										<Button
											variant="ghost"
											size="icon"
											aria-label="New chat"
											title="New chat"
											className={iconButton}
											onClick={newChat}
										>
											<RotateCcw />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											aria-label="Minimise chat"
											title="Minimise chat"
											className={iconButton}
											onClick={() => setExpanded(false)}
										>
											<ChevronDown />
										</Button>
									</div>
								</header>
								<div className="h-[min(56vh,520px)] px-2">
									<MessageScrollerProvider>
										<MessageScroller>
											<MessageScrollerViewport>
												<MessageScrollerContent
													data-testid="mayor-messages"
													aria-busy={busy}
													aria-live="polite"
													className="gap-5 px-3 py-2"
												>
													{messages.map((m) =>
														m.role === "user" || m.role === "assistant" ? (
															<MessageScrollerItem
																key={m.id}
																messageId={m.id}
																scrollAnchor={m.role === "user"}
															>
																{m.role === "user" ? (
																	<UserMessage message={m} />
																) : (
																	<AssistantMessage message={m} />
																)}
															</MessageScrollerItem>
														) : null,
													)}
													{status === "submitted" && (
														<p className="animate-pulse text-xs text-white/70">
															The Mayor is thinking…
														</p>
													)}
													{error && (
														<p role="alert" className="text-xs text-[#ff8a80]">
															{friendlyError(error)}
														</p>
													)}
												</MessageScrollerContent>
											</MessageScrollerViewport>
											<MessageScrollerButton className="rounded-full border-0 bg-white/90 text-black hover:bg-white" />
										</MessageScroller>
									</MessageScrollerProvider>
								</div>
							</div>
						</div>
						<form onSubmit={onSubmit} className="relative px-3 pt-2 pb-3">
							<InputGroup className="border-0 bg-transparent shadow-none has-[[data-slot=input-group-control]:focus-visible]:border-0 has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-transparent">
								<InputGroupTextarea
									ref={textareaRef}
									data-testid="mayor-input"
									value={draft}
									onChange={(e) => {
										setDraft(e.target.value);
										// Grow with the text (field-sizing is not in every browser yet).
										e.target.style.height = "auto";
										e.target.style.height = `${e.target.scrollHeight}px`;
									}}
									onKeyDown={onKeyDown}
									rows={1}
									placeholder="Ask the Mayor about Adam…"
									aria-label="Message the Mayor"
									className="max-h-40 min-h-11 px-3 text-base text-white placeholder:text-white/50 md:text-[15px]"
								/>
								<InputGroupAddon
									align="block-end"
									className="cursor-default gap-2 px-1 pb-0"
								>
									<InputGroupButton
										size="icon-sm"
										variant="ghost"
										aria-label="Attach a job description"
										title="Attach a job description (PDF, TXT or MD)"
										className="rounded-full text-white/80 hover:bg-white/10 hover:text-white"
										onClick={() => {
											sendAfterPick.current = null;
											fileRef.current?.click();
										}}
									>
										<Plus />
									</InputGroupButton>
									{attachment && (
										<span
											data-testid="mayor-attachment"
											className="flex min-w-0 items-center gap-1 rounded-full bg-white/10 py-0.5 pr-1 pl-2.5 text-xs text-white"
										>
											<Paperclip className="size-3 shrink-0" />
											<span className="truncate">{attachment.name}</span>
											<span className="shrink-0 text-white/50">
												{Math.max(1, Math.round(attachment.size / 1024))} KB
											</span>
											<button
												type="button"
												aria-label="Remove attachment"
												className="rounded-full p-0.5 hover:bg-white/15"
												onClick={() => setAttachment(null)}
											>
												<X className="size-3" />
											</button>
										</span>
									)}
									{attachError && (
										<span role="alert" className="text-xs text-[#ff8a80]">
											{attachError}
										</span>
									)}
									<span className="ml-auto" />
									{!expanded && messages.length > 0 && (
										<InputGroupButton
											size="icon-sm"
											variant="ghost"
											aria-label="Show conversation"
											title="Show conversation"
											className="rounded-full text-white/80 hover:bg-white/10 hover:text-white"
											onClick={() => setExpanded(true)}
										>
											<ChevronUp />
										</InputGroupButton>
									)}
									{busy ? (
										<InputGroupButton
											size="icon-sm"
											aria-label="Stop"
											className="rounded-full bg-white/15 text-white hover:bg-white/25"
											onClick={stop}
										>
											<Square className="size-3.5 fill-current" />
										</InputGroupButton>
									) : (
										<InputGroupButton
											type="submit"
											size="icon-sm"
											variant="default"
											aria-label="Send"
											disabled={!canSend}
											className="rounded-full bg-white text-black hover:bg-white/85 disabled:bg-white/10 disabled:text-white/40 disabled:opacity-100"
										>
											<ArrowUp />
										</InputGroupButton>
									)}
								</InputGroupAddon>
							</InputGroup>
						</form>
					</div>
				</LiquidGlass>
			</div>
			<input
				ref={fileRef}
				type="file"
				hidden
				data-testid="mayor-file"
				accept={ACCEPT}
				onChange={(e) => {
					void onFile(e.target.files?.[0]);
					e.target.value = "";
				}}
			/>
		</div>
	);
}
