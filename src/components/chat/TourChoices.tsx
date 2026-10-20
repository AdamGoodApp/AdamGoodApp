import { CompositeComponent } from "@tanstack/react-start/rsc";
import { createContext, use, useEffect, useId, useState } from "react";
import type { TourAudienceAnswer } from "#/chat/tour";
import {
	streamTourChoices,
	type TourChoiceButtonProps,
	type TourChoiceSource,
} from "#/chat/tour-choices.functions";
import { Button } from "#/components/ui/8bit/button";
import type { TourAudienceId } from "#/data/tours";
import { cn } from "#/lib/utils";

interface ChoiceState {
	answer: TourAudienceAnswer | undefined;
	/** Absent once answered, or while the Mayor is busy. */
	onPick?: (audience: TourAudienceId) => void;
}

const ChoiceContext = createContext<ChoiceState>({ answer: undefined });

function ChoiceButton({ audience, label }: TourChoiceButtonProps) {
	const { answer, onPick } = use(ChoiceContext);
	const picked =
		answer !== undefined &&
		"audience" in answer &&
		answer.audience === audience;
	return (
		<Button
			font="retro"
			variant="outline"
			aria-pressed={picked}
			disabled={!onPick}
			onClick={() => onPick?.(audience)}
			className={cn(
				"mx-1.5 my-1.5 w-40 text-[10px] text-black disabled:opacity-50",
				picked
					? "bg-[#f0a585] hover:bg-[#f0a585] disabled:opacity-100"
					: "bg-white hover:bg-white/85",
			)}
		>
			{label}
		</Button>
	);
}

/**
 * The tour audience question: server-rendered choices streamed in one by one,
 * each with a clickable 8-bit button.
 */
export function TourChoices({ answer, onPick }: ChoiceState) {
	const [sources, setSources] = useState<TourChoiceSource[]>([]);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let live = true;
		void (async () => {
			try {
				for await (const src of await streamTourChoices()) {
					if (live) setSources((prev) => [...prev, src]);
				}
			} catch (e) {
				console.error("[mayor] tour choices", e);
				if (live) setFailed(true);
			}
		})();
		return () => {
			live = false;
		};
	}, []);

	const questionId = useId();

	return (
		<ChoiceContext value={{ answer, onPick }}>
			<div data-testid="tour-choices" className="flex flex-col gap-2">
				<p id={questionId} className="retro text-[10px] leading-[1.8]">
					Who is the tour for?
				</p>
				<ul aria-labelledby={questionId} className="flex flex-col gap-2">
					{sources.map((src, i) => (
						// Choices stream in a fixed order and never reorder.
						// biome-ignore lint/suspicious/noArrayIndexKey: see above
						<CompositeComponent key={i} src={src} Button={ChoiceButton} />
					))}
				</ul>
				{failed && (
					<p
						role="alert"
						className="retro text-[9px] leading-[1.8] text-[#ff8a80]"
					>
						Couldn't load the choices — type who the tour is for instead.
					</p>
				)}
				{answer && "reply" in answer && (
					<p className="retro text-[9px] leading-[1.8] text-white/60">
						You said: {answer.reply}
					</p>
				)}
			</div>
		</ChoiceContext>
	);
}
