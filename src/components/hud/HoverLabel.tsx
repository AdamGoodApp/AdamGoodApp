import { useSelector } from "@tanstack/react-store";
import { Badge } from "#/components/ui/8bit/badge";
import { ZONE_BY_ID } from "#/data/zones";
import { uiStore } from "#/store/ui";

export function HoverLabel() {
	const hovered = useSelector(uiStore, (s) => s.hovered);
	const interacted = useSelector(uiStore, (s) => s.interacted);
	const isDesktop = useSelector(uiStore, (s) => s.isDesktop);
	const ready = useSelector(uiStore, (s) => s.ready);

	let text: string | null = null;
	if (isDesktop && hovered) {
		const zone = ZONE_BY_ID[hovered];
		text = `${zone.district.toUpperCase()} · ${zone.topic.toUpperCase()}`;
	} else if (ready && !interacted) {
		text = isDesktop
			? "CLICK A LIGHT BULB — SCROLL TO ZOOM"
			: "DRAG, PINCH, TAP A LIGHT BULB";
	}

	return (
		<div
			aria-live="polite"
			data-testid="hover-label"
			className="pointer-events-none fixed top-4 left-1/2 z-20 -translate-x-1/2 max-sm:top-auto max-sm:bottom-[calc(var(--mayor-dock,2rem)+4rem)]"
		>
			{text && <Badge className="text-[10px] whitespace-nowrap">{text}</Badge>}
		</div>
	);
}
