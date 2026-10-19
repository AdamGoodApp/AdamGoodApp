import { useSelector } from "@tanstack/react-store";
import { X } from "lucide-react";
import { Button } from "#/components/ui/8bit/button";
import { Card } from "#/components/ui/8bit/card";
import { setUi, uiStore } from "#/store/ui";

/** Message bubble an agent shows through the `show_message` and `run_tour` tools. */
export function AgentNotice() {
	const notice = useSelector(uiStore, (s) => s.notice);
	if (!notice) return null;

	return (
		<div className="fixed bottom-24 left-1/2 z-30 w-max max-w-md -translate-x-1/2 max-sm:inset-x-4 max-sm:bottom-36 max-sm:w-auto max-sm:translate-x-0">
			<Card
				font="normal"
				role="status"
				aria-live="polite"
				data-testid="agent-notice"
				className="py-3"
			>
				<div className="flex items-start gap-3 px-4">
					<div className="min-w-0 flex-1 space-y-2">
						{notice.title && (
							<p className="retro text-[11px] leading-relaxed">
								{notice.title}
							</p>
						)}
						<p className="text-sm leading-relaxed">{notice.text}</p>
					</div>
					<Button
						size="icon"
						variant="outline"
						aria-label="Dismiss"
						onClick={() => setUi({ notice: null })}
						className="shrink-0"
					>
						<X className="size-4" />
					</Button>
				</div>
			</Card>
		</div>
	);
}
