import { useSelector } from "@tanstack/react-store";
import {
	Droplets,
	type LucideIcon,
	Orbit,
	Rocket,
	Tornado,
	Zap,
} from "lucide-react";
import type { RefObject } from "react";
import type { DisasterKind } from "#/city/disasters/presets";
import type { CityWorld } from "#/city/world";
import { Button } from "#/components/ui/8bit/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/8bit/dropdown-menu";
import { uiStore } from "#/store/ui";

const ITEMS: { kind: DisasterKind; label: string; icon: LucideIcon }[] = [
	{ kind: "ufo_attack", label: "UFO attack", icon: Rocket },
	{ kind: "tornado", label: "Tornado", icon: Tornado },
	{ kind: "black_hole", label: "Black hole", icon: Orbit },
	{ kind: "tsunami", label: "Tsunami", icon: Droplets },
];

/**
 * The built-in disasters as a dropdown beside the day/night button. Picking
 * one stages it in the live city (replacing any event still playing); the
 * button shows the running event's name until the city restores itself.
 */
export function EventsMenu({
	worldRef,
}: {
	worldRef: RefObject<CityWorld | null>;
}) {
	const ready = useSelector(uiStore, (s) => s.ready);
	const disaster = useSelector(uiStore, (s) => s.disaster);
	return (
		// Non-modal so the city keeps receiving pointer events under an open menu.
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<Button
					font="retro"
					className="text-[10px]"
					data-testid="events-menu"
					aria-label="Stage a city event"
					disabled={!ready}
				>
					<Zap className="size-4" />
					<span className="max-sm:hidden">
						{disaster ? disaster.name.toUpperCase() : "EVENTS"}
					</span>
				</Button>
			</DropdownMenuTrigger>
			{/* data-own-scroll keeps a wheel over the open menu from zooming the city. */}
			<DropdownMenuContent
				align="end"
				font="retro"
				className="text-[10px]"
				data-own-scroll
			>
				{ITEMS.map((item) => (
					<DropdownMenuItem
						key={item.kind}
						data-testid={`event-${item.kind}`}
						onSelect={() => worldRef.current?.stageEvent(item.kind)}
					>
						<item.icon className="size-4" />
						{item.label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
