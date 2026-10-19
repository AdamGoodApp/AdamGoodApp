import { X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/8bit/button";
import { Card } from "#/components/ui/8bit/card";
import { ScrollArea } from "#/components/ui/8bit/scroll-area";
import type { ZoneContent as ZoneContentData } from "#/data/cv";
import { ZoneContent } from "./ZoneContent";

const WIDTH = 440;
const GAP = 14;
const MARGIN = 16;

export interface ScreenPoint {
	x: number;
	y: number;
}

export function placeCard(
	anchor: ScreenPoint,
	cardHeight: number,
	viewport: { width: number; height: number },
) {
	const left = Math.min(
		Math.max(anchor.x - WIDTH / 2, MARGIN),
		Math.max(MARGIN, viewport.width - WIDTH - MARGIN),
	);
	const below = anchor.y - cardHeight - GAP < MARGIN;
	const top = below
		? Math.min(anchor.y + GAP, viewport.height - cardHeight - MARGIN)
		: anchor.y - GAP - cardHeight;
	return { left, top: Math.max(MARGIN, top), below };
}

export function ZoneCard({
	zone,
	anchor,
	onClose,
}: {
	zone: ZoneContentData;
	anchor: ScreenPoint;
	onClose(): void;
}) {
	const titleId = useId();
	const ref = useRef<HTMLDivElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	const [height, setHeight] = useState(0);
	const [viewport, setViewport] = useState({ width: 1440, height: 900 });

	useLayoutEffect(() => {
		const measure = () => {
			setViewport({ width: window.innerWidth, height: window.innerHeight });
			setHeight(ref.current?.offsetHeight ?? 0);
		};
		measure();
		const ro = new ResizeObserver(measure);
		if (ref.current) ro.observe(ref.current);
		window.addEventListener("resize", measure);
		return () => {
			ro.disconnect();
			window.removeEventListener("resize", measure);
		};
	}, []);

	// Focus the close button when a (new) zone opens.
	useEffect(() => {
		void zone.id;
		closeRef.current?.focus();
	}, [zone.id]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const { left, top, below } = placeCard(anchor, height, viewport);
	const arrowLeft = Math.min(Math.max(anchor.x - left - 6, 12), WIDTH - 24);

	return (
		<div
			ref={ref}
			role="dialog"
			aria-modal="false"
			aria-labelledby={titleId}
			data-testid="zone-card"
			className="fixed z-30"
			style={{
				left,
				top,
				width: WIDTH,
				opacity: height ? 1 : 0,
			}}
		>
			<Card font="normal" className="max-h-[70vh] gap-3 py-4">
				<div className="flex items-start justify-between gap-3 px-5">
					<div className="space-y-2">
						<h2 id={titleId} className="retro text-sm leading-relaxed">
							{zone.title}
						</h2>
						<p className="text-muted-foreground text-xs">{zone.tagline}</p>
					</div>
					<Button
						ref={closeRef}
						size="icon"
						variant="outline"
						aria-label="Close"
						onClick={onClose}
						className="shrink-0"
					>
						<X className="size-4" />
					</Button>
				</div>
				<ScrollArea className="px-5 [&_[data-slot=scroll-area-viewport]]:max-h-[calc(70vh-8rem)]">
					<div className="pr-3 pb-2">
						<ZoneContent zone={zone} />
					</div>
				</ScrollArea>
			</Card>
			<div
				aria-hidden="true"
				className="absolute size-3 bg-foreground"
				style={{
					left: arrowLeft,
					...(below
						? { top: -12, clipPath: "polygon(50% 0, 0 100%, 100% 100%)" }
						: { bottom: -18, clipPath: "polygon(50% 100%, 0 0, 100% 0)" }),
				}}
			/>
		</div>
	);
}
