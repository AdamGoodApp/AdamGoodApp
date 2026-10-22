import { ClientOnly } from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import { type RefObject, useEffect, useRef } from "react";
import { detectTier } from "#/city/renderer";
import type { CityWorld } from "#/city/world";
import {
	DESKTOP_QUERY,
	isDesktopViewport,
	prefersReducedMotion,
	readParam,
} from "#/lib/device";
import { setUi, uiStore } from "#/store/ui";

/** Give slow software rasterisers time to compile pipelines before giving up. */
const WATCHDOG_MS = 15_000;
/** Automated tests render on a CPU rasteriser; only a real hang should trip the fallback there. */
const WATCHDOG_TEST_MS = 90_000;

function Canvas({ worldRef }: { worldRef: RefObject<CityWorld | null> }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const ready = useSelector(uiStore, (s) => s.ready);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		let world: CityWorld | null = null;
		let unsubscribeTime = () => {};
		let cancelled = false;
		const fail = (err: unknown) => {
			if (cancelled) return;
			console.error("[city] falling back to the static snapshot", err);
			setUi({ tier: "fallback" });
		};

		const lite = readParam("e2e") === "1";
		// Browsers suspend the render loop in hidden tabs, so the watchdog only
		// runs while the tab is visible and restarts when it shows again.
		let watchdog = 0;
		const armWatchdog = () => {
			window.clearTimeout(watchdog);
			if (document.hidden || uiStore.state.ready) return;
			watchdog = window.setTimeout(
				() => {
					if (!uiStore.state.ready && !document.hidden)
						fail(new Error("no first frame before the watchdog"));
				},
				lite ? WATCHDOG_TEST_MS : WATCHDOG_MS,
			);
		};
		armWatchdog();

		const desktopMq = matchMedia(DESKTOP_QUERY);
		const motionMq = matchMedia("(prefers-reduced-motion: reduce)");
		const onDesktop = () => {
			const isDesktop = desktopMq.matches;
			setUi({ isDesktop, hovered: null });
			world?.setMode(isDesktop ? "fixed" : "pannable");
		};
		const onMotion = () => world?.setReducedMotion(motionMq.matches);
		const onVisibility = () => {
			world?.setPaused(document.hidden);
			armWatchdog();
		};

		(async () => {
			const forced = readParam("tier") === "webgl2" ? "webgl2" : null;
			const tier = await detectTier(forced);
			if (cancelled) return;
			if (tier === "fallback") return fail(new Error("no WebGPU or WebGL2"));
			const { CityWorld } = await import("#/city/world");
			if (cancelled) return;
			const isDesktop = isDesktopViewport();
			world = await CityWorld.create({
				canvas,
				tier,
				mode: isDesktop ? "fixed" : "pannable",
				density: isDesktop ? 1 : 0.5,
				lite,
				reducedMotion: prefersReducedMotion(),
				timeMode: uiStore.state.timeMode,
				onHover: (hovered) =>
					setUi(hovered ? { hovered, interacted: true } : { hovered }),
				onSelect: (selected) => setUi({ selected, interacted: true }),
				onReady: () => setUi({ ready: true }),
				onNightChange: (isNight) => setUi({ isNight }),
				onDisaster: (disaster) => setUi({ disaster }),
				onViewChange: () =>
					setUi({ viewVersion: uiStore.state.viewVersion + 1 }),
				onFatal: fail,
			});
			if (cancelled) {
				world.dispose();
				return;
			}
			worldRef.current = world;
			const w0 = world;
			unsubscribeTime = uiStore.subscribe((state) =>
				w0.setTimeMode(state.timeMode),
			).unsubscribe;
			setUi({ tier: world.tier });
			const w = world;
			if (
				import.meta.env.DEV ||
				readParam("e2e") === "1" ||
				readParam("capture") === "1"
			) {
				window.__city = {
					zoneScreenPoint: (id) => w.zoneScreenPoint(id),
					cameraTarget: () => w.cameraTarget(),
					get tier() {
						return w.tier;
					},
					get ready() {
						return uiStore.state.ready;
					},
					get disaster() {
						return w.getDisaster();
					},
				};
			}
		})().catch(fail);

		desktopMq.addEventListener("change", onDesktop);
		motionMq.addEventListener("change", onMotion);
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			cancelled = true;
			unsubscribeTime();
			window.clearTimeout(watchdog);
			desktopMq.removeEventListener("change", onDesktop);
			motionMq.removeEventListener("change", onMotion);
			document.removeEventListener("visibilitychange", onVisibility);
			world?.dispose();
			worldRef.current = null;
			window.__city = undefined;
		};
	}, [worldRef]);

	return (
		<canvas
			ref={canvasRef}
			aria-label="Isometric city of Adam's career; use the district buttons to read each section"
			className="fixed inset-0 h-full w-full touch-none transition-opacity duration-500"
			style={{ opacity: ready ? 1 : 0 }}
		/>
	);
}

export function CityCanvas({
	worldRef,
}: {
	worldRef: RefObject<CityWorld | null>;
}) {
	return (
		<ClientOnly>
			<Canvas worldRef={worldRef} />
		</ClientOnly>
	);
}
