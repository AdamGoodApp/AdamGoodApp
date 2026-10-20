import {
	fetchServerSentEvents,
	type UIMessage,
	useChat,
} from "@tanstack/ai-react";
import LiquidGlass from "liquid-glass-react";
import {
	ArrowUp,
	ChevronDown,
	ChevronUp,
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
import type { TourAudienceAnswer } from "#/chat/tour";
import { Button } from "#/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "#/components/ui/input-group";
import { Message, MessageContent } from "#/components/ui/message";
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
import { ChainOfThought, type ThoughtStep } from "./ChainOfThought";
import type { MayorChatProps } from "./MayorChat";
import { MayorMarkdown } from "./MayorMarkdown";
import { clearMessages, loadMessages, saveMessages } from "./persistence";
import { MAYOR_SUGGESTIONS, type MayorSuggestion } from "./suggestions";
import { TourChoices } from "./TourChoices";
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

/** The steps the Mayor took for one request: its reasoning and every tool call except the tour question. */
function thoughtSteps(answers: readonly UIMessage[], busy: boolean) {
	const steps: ThoughtStep[] = [];
	for (const m of answers) {
		const results = resultIds(m);
		m.parts.forEach((p, i) => {
			if (p.type === "thinking" && p.content.trim()) {
				steps.push({
					id: `${m.id}-${i}`,
					title: "Reasoning",
					status: "done",
					detail: p.content.trim(),
				});
			} else if (p.type === "tool-call" && p.name !== "ask_tour_audience") {
				const done = toolDone(p, results);
				const error = done ? toolError(p) : null;
				steps.push({
					id: p.id,
					title: describeToolCall(p),
					// A call that never finished (stopped, or restored from storage) is not still running.
					status:
						error || (!done && !busy) ? "error" : done ? "done" : "running",
					error: error ?? (done || busy ? undefined : "stopped"),
				});
			}
		});
	}
	return steps;
}

/** The request the panel's output answers: one muted line, like a label. */
function RequestHeader({ message }: { message: UIMessage }) {
	const first = message.parts.find((p) => p.type === "text");
	const file = attachmentName(message);
	return (
		<div className="retro flex min-w-0 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[9px] text-white/70">
			{file && <Paperclip className="size-3 shrink-0" aria-label={file} />}
			<span className="truncate" title={first?.content}>
				{first?.content || file}
			</span>
		</div>
	);
}

function AssistantMessage({
	message,
	onAnswer,
}: {
	message: UIMessage;
	/** Answers an open ask_tour_audience call; absent while the Mayor is busy. */
	onAnswer?: (toolCallId: string, answer: TourAudienceAnswer) => void;
}) {
	const results = resultIds(message);
	const body: ReactNode[] = [];
	message.parts.forEach((p, i) => {
		const key = `${message.id}-${i}`;
		if (p.type === "tool-call" && p.name === "ask_tour_audience") {
			const done = toolDone(p, results);
			body.push(
				<TourChoices
					key={key}
					answer={p.output}
					onPick={
						done || !onAnswer
							? undefined
							: (audience) => onAnswer(p.id, { audience })
					}
				/>,
			);
		} else if (p.type === "text" && p.content.trim()) {
			body.push(<MayorMarkdown key={key}>{p.content}</MayorMarkdown>);
		}
	});
	return (
		<Message>
			<MessageContent className="gap-2 text-white">{body}</MessageContent>
		</Message>
	);
}

/** shadcn Suggestion: one sliding row of prompt buttons, in the dock's glass styling. */
function SuggestionPills({
	onPick,
}: {
	onPick(suggestion: MayorSuggestion): void;
}) {
	return (
		<div
			data-testid="mayor-suggestions"
			data-own-scroll
			onWheel={(e) => {
				// A plain mouse wheel scrolls the row sideways; trackpad swipes already do.
				if (Math.abs(e.deltaY) > Math.abs(e.deltaX))
					e.currentTarget.scrollLeft += e.deltaY;
			}}
			className="flex scroll-fade-x scrollbar-none gap-2 overflow-x-auto overscroll-x-contain px-1 py-1"
		>
			{MAYOR_SUGGESTIONS.map((s) => (
				<Button
					key={s.id}
					variant="outline"
					size="sm"
					onClick={() => onPick(s)}
					className="retro shrink-0 rounded-full border-white/20 bg-black/35 text-[9px] text-white shadow-none backdrop-blur-md hover:bg-black/50 hover:text-white focus-visible:ring-white/60 dark:border-white/20 dark:bg-black/35 dark:hover:bg-black/50"
				>
					<s.icon className="size-3.5" />
					{s.label}
				</Button>
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
	const { messages, sendMessage, addToolResult, status, error, stop, clear } =
		useChat({
			connection: CONNECTION,
			tools: CITY_CLIENT_TOOLS,
			context,
			initialMessages,
			onError: (e) => console.error("[mayor]", e),
		});
	const busy = status === "submitted" || status === "streaming";

	// Output only: the panel shows the latest request, the steps taken and the answer.
	const turn = messages.slice(
		Math.max(0, messages.map((m) => m.role).lastIndexOf("user")),
	);
	const request = turn[0]?.role === "user" ? turn[0] : undefined;
	const answers = turn.filter((m) => m.role === "assistant");
	// Messages that only called tools live in the chain of thought, not as empty rows.
	const shown = answers.filter((m) =>
		m.parts.some(
			(p) =>
				(p.type === "text" && p.content.trim()) ||
				(p.type === "tool-call" && p.name === "ask_tour_audience"),
		),
	);
	const steps = thoughtSteps(answers, busy);
	const answering = answers.at(-1)?.parts.at(-1)?.type === "text";

	// The Mayor's open "who is the tour for?" question, answered by a choice or the next typed message.
	const last = messages.at(-1);
	const openQuestion =
		last?.role === "assistant"
			? last.parts.find(
					(p): p is ToolCall =>
						p.type === "tool-call" &&
						p.name === "ask_tour_audience" &&
						!toolDone(p, resultIds(last)),
				)
			: undefined;

	function answer(toolCallId: string, output: TourAudienceAnswer) {
		void addToolResult({ toolCallId, tool: "ask_tour_audience", output });
	}

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
		if (openQuestion && text.trim()) {
			// A typed reply answers the question; an attachment waits for the next send.
			answer(openQuestion.id, { reply: text.trim() });
			setDraft("");
			setAttachment(file);
			if (textareaRef.current) textareaRef.current.style.height = "";
			setExpanded(true);
			return;
		}
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
		<>
			<section
				data-testid="mayor-history"
				data-state={expanded ? "expanded" : "collapsed"}
				data-own-scroll
				aria-label="Conversation with the Mayor"
				inert={!expanded}
				className={cn(
					"fixed z-30 flex flex-col overflow-hidden rounded-[28px] border border-white/15 bg-[#101012]/70 font-sans text-sm leading-normal text-white shadow-2xl backdrop-blur-xl [text-shadow:none] transition-[opacity,translate,visibility] duration-300 ease-out motion-reduce:transition-none",
					// Desktop: middle left, clear of the city, and short enough to stay above the input bar.
					// Phones: just above the input bar.
					"sm:top-1/2 sm:left-5 sm:h-[min(680px,calc(100dvh-2*var(--mayor-dock,6rem)-2rem))] sm:w-[min(280px,calc(100vw-2.5rem))] sm:-translate-y-1/2",
					"max-sm:inset-x-4 max-sm:bottom-[calc(var(--mayor-dock,6rem)+0.75rem)] max-sm:h-[min(56vh,520px)]",
					expanded
						? "opacity-100"
						: "invisible opacity-0 max-sm:translate-y-4 sm:-translate-x-4",
				)}
			>
				<header className="flex items-center justify-between px-5 pt-4 pb-2">
					<div>
						<p className="retro text-[10px] text-[#f0a585]">THE MAYOR</p>
						<p className="retro text-[8px] leading-[1.8] text-white/60">
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
				<div className="min-h-0 flex-1 px-2 pb-2">
					<MessageScrollerProvider>
						<MessageScroller>
							<MessageScrollerViewport>
								<MessageScrollerContent
									data-testid="mayor-messages"
									aria-busy={busy}
									aria-live="polite"
									className="gap-5 px-3 py-2"
								>
									{request && (
										<MessageScrollerItem
											key={request.id}
											messageId={request.id}
											scrollAnchor
										>
											<RequestHeader message={request} />
										</MessageScrollerItem>
									)}
									{steps.length > 0 && (
										<ChainOfThought
											key={request?.id}
											steps={steps}
											running={busy && !answering}
										/>
									)}
									{shown.map((m) => (
										<MessageScrollerItem key={m.id} messageId={m.id}>
											<AssistantMessage
												message={m}
												onAnswer={busy ? undefined : answer}
											/>
										</MessageScrollerItem>
									))}
									{status === "submitted" && steps.length === 0 && (
										<p className="retro animate-pulse text-[9px] leading-[1.8] text-white/70">
											The Mayor is thinking…
										</p>
									)}
									{error && (
										<p
											role="alert"
											className="retro text-[9px] leading-[1.8] text-[#ff8a80]"
										>
											{friendlyError(error)}
										</p>
									)}
								</MessageScrollerContent>
							</MessageScrollerViewport>
							<MessageScrollerButton className="rounded-full border-0 bg-white/90 text-black hover:bg-white" />
						</MessageScroller>
					</MessageScrollerProvider>
				</div>
			</section>
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
							<form onSubmit={onSubmit} className="relative px-3 pt-2 pb-3">
								<InputGroup className="border-0 bg-transparent shadow-none has-[[data-slot=input-group-control]:focus-visible]:border-0 has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-transparent">
									<InputGroupTextarea
										ref={textareaRef}
										data-testid="mayor-input"
										data-own-scroll
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
										className="retro max-h-40 min-h-11 px-3 text-base leading-[1.8] text-white placeholder:text-white/50 sm:text-[11px]"
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
												className="retro flex min-w-0 items-center gap-1 rounded-full bg-white/10 py-0.5 pr-1 pl-2.5 text-[9px] text-white"
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
											<span
												role="alert"
												className="retro text-[9px] leading-[1.8] text-[#ff8a80]"
											>
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
		</>
	);
}
