import { useSelector } from "@tanstack/react-store";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CityWorld } from "#/city/world";
import { CV } from "#/data/cv";
import type { ZoneId } from "#/data/zones";
import { isDesktopViewport, readParam } from "#/lib/device";
import { setUi, uiStore } from "#/store/ui";
import { CityCanvas } from "./CityCanvas";
import { ErrorBoundary } from "./ErrorBoundary";
import { CvOutline } from "./hud/CvOutline";
import { HoverLabel } from "./hud/HoverLabel";
import { NavButtons } from "./hud/NavButtons";
import { TimeButton } from "./hud/TimeButton";
import { ZoneCard } from "./hud/ZoneCard";
import { ZoneDrawer } from "./hud/ZoneDrawer";
import { ZoneMarkers } from "./hud/ZoneMarkers";
import { StaticFallback } from "./StaticFallback";

function useAnchor(
	worldRef: React.RefObject<CityWorld | null>,
	selected: ZoneId | null,
) {
	const view = useSelector(uiStore, (s) => s.viewVersion);
	const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
	useEffect(() => {
		void view;
		const world = worldRef.current;
		setAnchor(selected && world ? world.zoneScreenPoint(selected) : null);
	}, [worldRef, selected, view]);
	return anchor;
}

export function CityPage() {
	const worldRef = useRef<CityWorld | null>(null);
	const tier = useSelector(uiStore, (s) => s.tier);
	const ready = useSelector(uiStore, (s) => s.ready);
	const selected = useSelector(uiStore, (s) => s.selected);
	const isDesktop = useSelector(uiStore, (s) => s.isDesktop);
	const [capture, setCapture] = useState(false);
	const anchor = useAnchor(worldRef, isDesktop ? selected : null);

	useEffect(() => {
		setCapture(readParam("capture") === "1");
		const time = readParam("time");
		setUi({
			isDesktop: isDesktopViewport(),
			...(readParam("tier") === "fallback" ? { tier: "fallback" } : {}),
			...(time === "day" || time === "night" ? { timeMode: time } : {}),
		});
	}, []);

	const select = useCallback((id: ZoneId | null) => {
		const world = worldRef.current;
		if (world) world.select(id);
		else setUi({ selected: id, interacted: true });
	}, []);
	const hover = useCallback((id: ZoneId | null) => {
		worldRef.current?.hover(id);
	}, []);
	const close = useCallback(() => select(null), [select]);

	if (tier === "fallback") return <StaticFallback />;

	return (
		<>
			<ErrorBoundary>
				<CityCanvas worldRef={worldRef} />
			</ErrorBoundary>
			{!capture && (
				<ZoneMarkers worldRef={worldRef} onSelect={select} onHover={hover} />
			)}
			{!ready && (
				<div className="pointer-events-none fixed inset-0 flex items-center justify-center">
					<p className="retro animate-pulse text-sm">LOADING CITY…</p>
				</div>
			)}
			{!capture && (
				<>
					<TimeButton />
					<HoverLabel />
					<NavButtons layout="corner" />
					{isDesktop && selected && anchor && (
						<ZoneCard zone={CV[selected]} anchor={anchor} onClose={close} />
					)}
					{!isDesktop && (
						<ZoneDrawer zone={selected ? CV[selected] : null} onClose={close} />
					)}
				</>
			)}
			<CvOutline />
		</>
	);
}
