import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { useState } from "react";
import {
	Trace,
	TraceCollapsible,
	TraceCollapsibleContent,
	TraceCollapsibleTrigger,
	TraceDescription,
	TraceIcon,
	TraceLine,
	TraceTitle,
} from "#/components/ui/trace";

export interface ThoughtStep {
	id: string;
	/** What the Mayor did, e.g. "Focus a district · The Beach", or its reasoning. */
	title: string;
	status: "running" | "error" | "done";
	/** The failure reason, for error steps. */
	error?: string;
	/** Reasoning text, shown under the step when expanded. */
	detail?: string;
}

/** Colours the shadcn trace for the dark glass panel. */
const LINE =
	"retro text-[9px] leading-[1.8] text-white/70 in-[a:hover,button:hover]:text-white";

function StatusIcon({ status }: { status: ThoughtStep["status"] }) {
	if (status === "running") return <LoaderCircle className="animate-spin" />;
	return status === "error" ? (
		<CircleAlert className="text-[#ff8a80]" />
	) : (
		<CircleCheck className="text-[#86efac]" />
	);
}

function Step({ step }: { step: ThoughtStep }) {
	const status = step.status === "done" ? undefined : step.status;
	const line = (
		<TraceLine status={status} className={LINE}>
			<TraceIcon>
				<StatusIcon status={step.status} />
			</TraceIcon>
			<TraceTitle>{step.title}</TraceTitle>
			{step.error && (
				<TraceDescription className="truncate text-[#ff8a80]">
					· {step.error}
				</TraceDescription>
			)}
		</TraceLine>
	);
	if (!step.detail) return line;
	return (
		<TraceCollapsible>
			<TraceCollapsibleTrigger className="text-white/70 hover:text-white">
				{line}
			</TraceCollapsibleTrigger>
			<TraceCollapsibleContent className="retro border-white/15 text-[9px] leading-[1.8] whitespace-pre-wrap text-white/60">
				{step.detail}
			</TraceCollapsibleContent>
		</TraceCollapsible>
	);
}

/**
 * The shadcn Chain of Thought: one summary line ("Took 3 steps") that opens
 * while the Mayor works and expands into the steps it took.
 */
export function ChainOfThought({
	steps,
	running,
}: {
	steps: readonly ThoughtStep[];
	/** The Mayor is still working: tools are running and no answer has started. */
	running: boolean;
}) {
	const [open, setOpen] = useState<boolean>();
	const failed = steps.filter((s) => s.status === "error").length;
	const status = running ? "running" : failed > 0 ? "error" : "done";
	const title = running
		? "Working on it"
		: `Took ${steps.length} ${steps.length === 1 ? "step" : "steps"}${failed > 0 ? `, ${failed} failed` : ""}`;
	return (
		<Trace data-testid="mayor-thoughts">
			<TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
				<TraceCollapsibleTrigger className="text-white/70 hover:text-white">
					<TraceLine
						status={status === "done" ? undefined : status}
						className={LINE}
					>
						<TraceIcon>
							<StatusIcon status={status} />
						</TraceIcon>
						<TraceTitle>{title}</TraceTitle>
					</TraceLine>
				</TraceCollapsibleTrigger>
				<TraceCollapsibleContent className="border-white/15">
					<Trace>
						{steps.map((step) => (
							<Step key={step.id} step={step} />
						))}
					</Trace>
				</TraceCollapsibleContent>
			</TraceCollapsible>
		</Trace>
	);
}
