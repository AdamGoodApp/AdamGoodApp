import { useSelector } from "@tanstack/react-store";
import { type RefObject, useLayoutEffect, useState } from "react";
import type { CityWorld } from "#/city/world";
import { ZONES, type ZoneId } from "#/data/zones";
import { cn } from "#/lib/utils";
import { uiStore } from "#/store/ui";

/** 16×16 pixel-art light bulb: O outline, Y glass, L light glass, W highlight, G/D screw base. */
const BULB = [
	".....OOOOOO.....",
	"....OYYYYYYO....",
	"...OYWWYYYYYO...",
	"..OYWLYYYYYYYO..",
	"..OYWYYYYYYYYO..",
	"..OYYYYYYYYYYO..",
	"..OYYYYYYYYYYO..",
	"...OYYYYYYYYO...",
	"....OYYYYYYO....",
	".....OYYYYO.....",
	".....OGGGGO.....",
	".....ODDDDO.....",
	".....OGGGGO.....",
	".....ODDDDO.....",
	"......OOOO......",
	".......OO.......",
] as const;
const COLORS: Record<string, string> = {
	O: "#1d1d1d",
	Y: "#ffd84a",
	L: "#fff1a0",
	W: "#ffffff",
	G: "#a9adb2",
	D: "#6b7076",
};

function BulbIcon({ className }: { className?: string }) {
	const cells: { x: number; y: number; fill: string }[] = [];
	BULB.forEach((row, y) => {
		for (let x = 0; x < row.length; x++) {
			const fill = COLORS[row.charAt(x)];
			if (fill) cells.push({ x, y, fill });
		}
	});
	return (
		<svg
			viewBox="0 0 16 16"
			shapeRendering="crispEdges"
			aria-hidden="true"
			className={className}
		>
			{cells.map(({ x, y, fill }) => (
				<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={fill} />
			))}
		</svg>
	);
}

/** Pixels between the zone anchor and the bulb's bottom edge. */
const LIFT = 14;
/** Keep bulbs below the top HUD row and above the bottom edge. */
const TOP_MIN = 64;

/**
 * A floating light bulb over every interactive district: the obvious "click me"
 * affordance. Bulbs are real buttons (keyboard reachable, labelled) positioned
 * from the world's anchor points and re-measured whenever the view changes.
 */
export function ZoneMarkers({
	worldRef,
	onSelect,
	onHover,
}: {
	worldRef: RefObject<CityWorld | null>;
	onSelect(id: ZoneId): void;
	onHover(id: ZoneId | null): void;
}) {
	const ready = useSelector(uiStore, (s) => s.ready);
	const view = useSelector(uiStore, (s) => s.viewVersion);
	const hovered = useSelector(uiStore, (s) => s.hovered);
	const selected = useSelector(uiStore, (s) => s.selected);
	const disaster = useSelector(uiStore, (s) => s.disaster);
	const [points, setPoints] = useState<
		Partial<Record<ZoneId, { x: number; y: number }>>
	>({});

	useLayoutEffect(() => {
		void view;
		const world = worldRef.current;
		if (!ready || !world) return;
		const next: Partial<Record<ZoneId, { x: number; y: number }>> = {};
		for (const zone of ZONES) next[zone.id] = world.zoneScreenPoint(zone.id);
		setPoints(next);
	}, [ready, view, worldRef]);

	if (!ready || disaster?.cityHidden) return null;
	return (
		<nav
			aria-label="Districts"
			className="pointer-events-none fixed inset-0 z-10"
		>
			{ZONES.map((zone, i) => {
				const p = points[zone.id];
				if (!p) return null;
				const active = hovered === zone.id || selected === zone.id;
				const top = Math.min(
					Math.max(p.y - LIFT, TOP_MIN),
					window.innerHeight - 8,
				);
				return (
					<button
						key={zone.id}
						type="button"
						aria-label={`${zone.district} — ${zone.topic}`}
						title={`${zone.district} · ${zone.topic}`}
						data-testid={`bulb-${zone.id}`}
						onClick={() => onSelect(zone.id)}
						onMouseEnter={() => onHover(zone.id)}
						onMouseLeave={() => onHover(null)}
						onFocus={() => onHover(zone.id)}
						onBlur={() => onHover(null)}
						className="pointer-events-auto absolute -translate-x-1/2 -translate-y-full cursor-pointer rounded-none p-1 outline-none focus-visible:ring-4 focus-visible:ring-white"
						style={{ left: p.x, top }}
					>
						<span
							className="block motion-safe:animate-[bulb-float_2.4s_ease-in-out_infinite]"
							style={{ animationDelay: `${-i * 0.35}s` }}
						>
							<BulbIcon
								className={cn(
									"size-9 transition-[transform,filter] duration-200",
									active
										? "scale-125 drop-shadow-[0_0_10px_#ffd84a]"
										: "drop-shadow-[0_0_5px_rgba(255,216,74,0.75)]",
								)}
							/>
						</span>
					</button>
				);
			})}
		</nav>
	);
}
