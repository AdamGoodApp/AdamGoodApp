import { DirectionalLight, HemisphereLight, Scene, Vector3 } from "three";
import { mix, screenUV, vec3 } from "three/tsl";
import type { RenderPipeline, WebGPURenderer } from "three/webgpu";
import { ZONE_BY_ID, type ZoneId } from "#/data/zones";
import type { CameraMode } from "./camera";
import { IsoCamera } from "./camera";
import type { DisasterState } from "./disasters/director";
import { isDisasterKind } from "./disasters/presets";
import {
	DayNight,
	simClock,
	skyBottom,
	skyTop,
	type TimeMode,
	voidMix,
} from "./env";
import type { CityEvent, Landmark, StageKind, StageResult } from "./events";
import { ZoneHighlights } from "./highlight";
import { PointerController } from "./input";
import { createPipeline } from "./post";
import { createRenderer, type GpuTier } from "./renderer";
import { mulberry32, WORLD_SEED } from "./rng";
import type { Agent } from "./sim/agent";
import { SpotHighlight } from "./spot";
import { type BuiltWorld, buildWorld } from "./world/index";

export interface CityWorldOptions {
	canvas: HTMLCanvasElement;
	tier: GpuTier;
	mode: CameraMode;
	density: number;
	/**
	 * Cheap rendering for software rasterisers (automated tests): small shadow map,
	 * no MSAA, no bloom/tilt-shift, pixel ratio 1. The simulation is unchanged.
	 */
	lite: boolean;
	reducedMotion: boolean;
	timeMode: TimeMode;
	onHover(id: ZoneId | null): void;
	onSelect(id: ZoneId | null): void;
	onReady(): void;
	onNightChange(isNight: boolean): void;
	/** A disaster started, changed phase or ended (null). */
	onDisaster(state: DisasterState | null): void;
	/** The camera moved, zoomed or the canvas resized: screen positions changed. */
	onViewChange(): void;
	onFatal(err: unknown): void;
}

const STEP = 1 / 60;
/** Simulation steps per frame at speed 1; scaled with the speed. */
const STEPS_PER_FRAME = 3;
const MIN_SPEED = 0.25;
const MAX_SPEED = 3;

export interface CityView {
	x: number;
	z: number;
	zoom: number;
}

export interface SimulationState {
	paused: boolean;
	speed: number;
	simTime: number;
	agents: number;
}

interface CameraTween {
	from: CityView;
	to: CityView;
	start: number;
	duration: number;
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function easeInOut(k: number): number {
	return k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
}

export class CityWorld {
	readonly renderer: WebGPURenderer;
	readonly tier: GpuTier;
	private readonly scene = new Scene();
	private readonly camera: IsoCamera;
	private readonly highlights: ZoneHighlights;
	private readonly spot: SpotHighlight;
	private readonly input: PointerController;
	private readonly built: BuiltWorld;
	private readonly agents: Agent[];
	private readonly resizeObserver: ResizeObserver;
	private readonly dayNight: DayNight;
	private readonly pipeline: RenderPipeline;
	private selected: ZoneId | null = null;
	private hovered: ZoneId | null = null;
	private paused: boolean;
	private speed = 1;
	private mode: CameraMode;
	private tween: CameraTween | null = null;
	private reducedMotion: boolean;
	private dirty = true;
	private last = -1;
	private acc = 0;
	private simTime = 0;
	private rendered = false;
	private disposed = false;

	static async create(o: CityWorldOptions): Promise<CityWorld> {
		const renderer = await createRenderer(o.canvas, o.tier);
		return new CityWorld(o, renderer);
	}

	private constructor(
		private readonly o: CityWorldOptions,
		renderer: WebGPURenderer,
	) {
		this.renderer = renderer;
		this.reducedMotion = o.reducedMotion;
		// Shadow passes double the pipelines a CPU rasteriser must compile for the first frame.
		if (o.lite) renderer.shadowMap.enabled = false;
		const backend: object = renderer.backend;
		this.tier =
			"isWebGPUBackend" in backend && backend.isWebGPUBackend === true
				? "webgpu"
				: "webgl2";
		this.paused = o.reducedMotion;
		this.mode = o.mode;

		const hemi = new HemisphereLight(0xbfe3ff, 0xcfe9b8, 0.9);
		const sun = new DirectionalLight(0xfff2d6, 2.2);
		sun.position.set(-60, 110, 70);
		sun.castShadow = true;
		const sc = sun.shadow.camera;
		// Covers the whole visible city including the outskirts.
		sc.left = -210;
		sc.right = 210;
		sc.top = 210;
		sc.bottom = -210;
		sc.near = 1;
		sc.far = 400;
		const mapSize = o.lite ? 1024 : o.density < 1 ? 2048 : 4096;
		sun.shadow.mapSize.set(mapSize, mapSize);
		sun.shadow.bias = -0.0004;
		sun.shadow.normalBias = 0.03;
		this.scene.add(hemi, sun, sun.target);
		this.dayNight = new DayNight(sun, hemi, (n) => o.onNightChange(n));
		this.dayNight.setMode(o.timeMode);
		// screenUV.y grows downward: horizon colour at the bottom, zenith at the top.
		// A black hole fades the sky to black space through voidMix.
		this.scene.backgroundNode = mix(
			mix(skyTop, skyBottom, screenUV.y),
			vec3(0, 0, 0),
			voidMix,
		);

		this.camera = new IsoCamera(o.mode);
		this.pipeline = createPipeline(renderer, this.scene, this.camera.camera, {
			tiltShift: o.density >= 1 && !o.lite,
			lite: o.lite,
		});
		this.highlights = new ZoneHighlights(this.scene);
		this.spot = new SpotHighlight(this.scene);

		this.built = buildWorld(mulberry32(WORLD_SEED), o.density);
		this.scene.add(this.built.group, this.built.fx);
		this.built.disasters.onChange = (s) => {
			if (s?.cityHidden) {
				this.hover(null);
				this.select(null);
			}
			o.onDisaster(s);
		};
		this.agents = this.built.agents;
		// Place every agent once so the first (and, with reduced motion, only) frame is populated.
		for (const a of this.agents) a.update(0, 0);

		this.input = new PointerController(
			o.canvas,
			this.camera,
			{
				hover: (id) => this.hover(id),
				tap: (id) => this.select(id === this.selected ? null : id),
				panned: () => {
					// User input wins over an agent-driven camera flight.
					this.tween = null;
					this.dirty = true;
					this.o.onViewChange();
				},
			},
			o.mode,
		);

		o.canvas.addEventListener("webglcontextlost", this.onContextLost);
		renderer.onDeviceLost = (info) => this.o.onFatal(info);

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(o.canvas);
		this.resize();

		if (import.meta.env.DEV) {
			renderer.compileAsync(this.scene, this.camera.camera).catch(() => {});
		}
		renderer.setAnimationLoop((ms) => this.tick(ms));
	}

	private onContextLost = (e: Event) => {
		e.preventDefault();
		this.o.onFatal(new Error("WebGL context lost"));
	};

	private tick(ms: number): void {
		if (this.disposed) return;
		const dt = this.last < 0 ? 0 : Math.min((ms - this.last) / 1000, 0.1);
		this.last = ms;

		this.advanceTween(ms);

		if (!this.paused) {
			this.acc += dt * this.speed;
			const maxSteps = Math.ceil(STEPS_PER_FRAME * this.speed);
			let steps = 0;
			while (this.acc >= STEP && steps < maxSteps) {
				this.built.events.now = this.simTime;
				for (const a of this.agents) a.update(STEP, this.simTime);
				this.simTime += STEP;
				this.acc -= STEP;
				steps++;
			}
			if (steps === maxSteps) this.acc = 0;
		}
		simClock.value = this.simTime;
		this.built.events.now = this.simTime;

		const lighting = this.dayNight.update(dt * this.speed, !this.paused);
		const ringAnimating = this.highlights.update(dt, this.reducedMotion);
		const spotAnimating = this.spot.update(dt, this.reducedMotion);
		const animating = ringAnimating || spotAnimating;
		if (
			this.paused &&
			!this.dirty &&
			!animating &&
			!lighting &&
			this.rendered
		) {
			return;
		}
		this.dirty = false;
		this.pipeline.render();

		if (!this.rendered) {
			this.rendered = true;
			this.o.canvas.dataset.ready = "1";
			if (import.meta.env.DEV) {
				console.info(
					`[city] ${this.tier} draw calls: ${this.renderer.info.render.drawCalls}`,
				);
			}
			this.o.onReady();
		}
	}

	private advanceTween(ms: number): void {
		const t = this.tween;
		if (!t) return;
		const k =
			t.duration <= 0
				? 1
				: Math.min(1, Math.max(0, (ms - t.start) / t.duration));
		const e = easeInOut(k);
		this.camera.setView(
			lerp(t.from.x, t.to.x, e),
			lerp(t.from.z, t.to.z, e),
			Math.exp(lerp(Math.log(t.from.zoom), Math.log(t.to.zoom), e)),
		);
		if (k >= 1) this.tween = null;
		this.dirty = true;
		this.o.onViewChange();
	}

	setMode(mode: CameraMode): void {
		this.mode = mode;
		this.tween = null;
		this.camera.setMode(mode);
		this.input.setMode(mode);
		this.resize();
	}

	resize(): void {
		const c = this.o.canvas;
		const w = c.clientWidth;
		const h = c.clientHeight;
		if (!w || !h) return;
		this.renderer.setPixelRatio(
			this.o.lite
				? 1
				: Math.min(window.devicePixelRatio, this.o.density < 1 ? 1.5 : 2),
		);
		this.renderer.setSize(w, h, false);
		this.camera.fit(w / h);
		this.dirty = true;
		this.o.onViewChange();
	}

	select(id: ZoneId | null): void {
		const next = this.built.disasters.state()?.cityHidden ? null : id;
		this.selected = next;
		this.highlights.setSelected(next);
		this.dirty = true;
		this.o.onSelect(next);
	}

	hover(id: ZoneId | null): void {
		const next = this.built.disasters.state()?.cityHidden ? null : id;
		if (next === this.hovered) return;
		this.hovered = next;
		this.highlights.setHover(next);
		this.dirty = true;
		this.o.onHover(next);
	}

	zoneScreenPoint(id: ZoneId): { x: number; y: number } {
		const [x, y, z] = ZONE_BY_ID[id].anchor;
		const c = this.o.canvas;
		return this.camera.screenPoint(
			new Vector3(x, y, z),
			c.clientWidth,
			c.clientHeight,
		);
	}

	cameraTarget(): { x: number; z: number } {
		return { x: this.camera.target.x, z: this.camera.target.z };
	}

	/** Animate the camera to a ground point and zoom; user panning cancels it. */
	flyTo(x: number, z: number, zoom: number, durationMs = 700): void {
		this.tween = {
			from: this.camera.view,
			to: { x, z, zoom },
			start: performance.now(),
			duration: this.reducedMotion ? 0 : durationMs,
		};
		this.dirty = true;
	}

	focusZone(id: ZoneId, zoom = 2.2): void {
		const r = ZONE_BY_ID[id].rect;
		this.flyTo((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, zoom);
	}

	resetView(): void {
		this.flyTo(0, 0, this.mode === "pannable" ? 2.4 : 1);
	}

	/** Flies to the merged view and returns it (the camera may clamp it on arrival). */
	setView(view: Partial<CityView>): CityView {
		const now = this.camera.view;
		const target = {
			x: view.x ?? now.x,
			z: view.z ?? now.z,
			zoom: view.zoom ?? now.zoom,
		};
		this.flyTo(target.x, target.z, target.zoom);
		return target;
	}

	getView(): CityView {
		return this.camera.view;
	}

	setSpeed(speed: number): void {
		this.speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
	}

	getSimulation(): SimulationState {
		return {
			paused: this.paused,
			speed: this.speed,
			simTime: this.simTime,
			agents: this.agents.length,
		};
	}

	getSelected(): ZoneId | null {
		return this.selected;
	}

	getHovered(): ZoneId | null {
		return this.hovered;
	}

	/** Simulation events after `since` (an event id), oldest first. */
	getEvents(since = 0, limit = 64): { events: CityEvent[]; lastId: number } {
		const log = this.built.events;
		return { events: log.since(since, limit), lastId: log.lastId };
	}

	landmarks(): Landmark[] {
		return this.built.events.landmarks();
	}

	stageKinds(): StageKind[] {
		return this.built.events.stageKinds();
	}

	stageEvent(kind: StageKind): StageResult {
		const result = this.built.events.stage(kind);
		this.dirty = true;
		if (result.ok && isDisasterKind(kind)) this.showDisaster();
		return this.noteIfPaused(result);
	}

	/** Run an event designed from a spec (see disasters/spec.ts); the city restores itself afterwards. */
	stageCustomEvent(spec: unknown): StageResult {
		const result = this.built.disasters.start(spec);
		this.dirty = true;
		if (result.ok) this.showDisaster();
		return this.noteIfPaused(result);
	}

	getDisaster(): DisasterState | null {
		return this.built.disasters.state();
	}

	private noteIfPaused(result: StageResult): StageResult {
		if (result.ok && this.paused) {
			return {
				ok: true,
				text: `${result.text} (the simulation is paused; it plays out once it resumes)`,
			};
		}
		return result;
	}

	/** Clear the HUD's focus and fly the camera to where the event starts. */
	private showDisaster(): void {
		this.select(null);
		this.spot.clear();
		const f = this.built.disasters.focus();
		if (f) this.flyTo(f.x, f.z, f.zoom, 1200);
	}

	/** Ring a ground point or a landmark (by id) for `seconds` (0 = until cleared). */
	highlightSpot(
		target: { x: number; z: number; radius?: number } | { landmark: string },
		seconds: number,
	): boolean {
		let spot: { x: number; z: number; radius: number };
		if ("landmark" in target) {
			const mark = this.built.events.getLandmark(target.landmark);
			if (!mark) return false;
			spot = mark;
		} else spot = { radius: 6, ...target };
		this.spot.show(spot.x, spot.z, spot.radius, seconds);
		this.dirty = true;
		return true;
	}

	clearSpot(): void {
		this.spot.clear();
		this.dirty = true;
	}

	setTimeMode(mode: TimeMode): void {
		this.dayNight.setMode(mode);
		this.dirty = true;
	}

	setPaused(paused: boolean): void {
		this.paused = paused || this.reducedMotion;
		this.dirty = true;
	}

	setReducedMotion(reduced: boolean): void {
		this.reducedMotion = reduced;
		this.setPaused(false);
	}

	dispose(): void {
		this.disposed = true;
		this.renderer.setAnimationLoop(null);
		this.resizeObserver.disconnect();
		this.input.dispose();
		this.o.canvas.removeEventListener("webglcontextlost", this.onContextLost);
		this.highlights.dispose();
		this.spot.dispose();
		this.built.dispose();
		this.pipeline.dispose();
		this.renderer.dispose();
	}
}
