import { DirectionalLight, HemisphereLight, Scene, Vector3 } from "three";
import { mix, screenUV } from "three/tsl";
import type { RenderPipeline, WebGPURenderer } from "three/webgpu";
import { ZONE_BY_ID, type ZoneId } from "#/data/zones";
import type { CameraMode } from "./camera";
import { IsoCamera } from "./camera";
import { DayNight, simClock, skyBottom, skyTop, type TimeMode } from "./env";
import { ZoneHighlights } from "./highlight";
import { PointerController } from "./input";
import { createPipeline } from "./post";
import { createRenderer, type GpuTier } from "./renderer";
import { mulberry32, WORLD_SEED } from "./rng";
import type { Agent } from "./sim/agent";
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
	/** The camera moved, zoomed or the canvas resized: screen positions changed. */
	onViewChange(): void;
	onFatal(err: unknown): void;
}

const STEP = 1 / 60;

export class CityWorld {
	readonly renderer: WebGPURenderer;
	readonly tier: GpuTier;
	private readonly scene = new Scene();
	private readonly camera: IsoCamera;
	private readonly highlights: ZoneHighlights;
	private readonly input: PointerController;
	private readonly built: BuiltWorld;
	private readonly agents: Agent[];
	private readonly resizeObserver: ResizeObserver;
	private readonly dayNight: DayNight;
	private readonly pipeline: RenderPipeline;
	private selected: ZoneId | null = null;
	private hovered: ZoneId | null = null;
	private paused: boolean;
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
		this.scene.backgroundNode = mix(skyTop, skyBottom, screenUV.y);

		this.camera = new IsoCamera(o.mode);
		this.pipeline = createPipeline(renderer, this.scene, this.camera.camera, {
			tiltShift: o.density >= 1 && !o.lite,
			lite: o.lite,
		});
		this.highlights = new ZoneHighlights(this.scene);

		this.built = buildWorld(mulberry32(WORLD_SEED), o.density);
		this.scene.add(this.built.group);
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

		if (!this.paused) {
			this.acc += dt;
			let steps = 0;
			while (this.acc >= STEP && steps < 3) {
				for (const a of this.agents) a.update(STEP, this.simTime);
				this.simTime += STEP;
				this.acc -= STEP;
				steps++;
			}
			if (steps === 3) this.acc = 0;
		}
		simClock.value = this.simTime;

		const lighting = this.dayNight.update(dt, !this.paused);
		const animating = this.highlights.update(dt, this.reducedMotion);
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

	setMode(mode: CameraMode): void {
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
		this.selected = id;
		this.highlights.setSelected(id);
		this.dirty = true;
		this.o.onSelect(id);
	}

	hover(id: ZoneId | null): void {
		if (id === this.hovered) return;
		this.hovered = id;
		this.highlights.setHover(id);
		this.dirty = true;
		this.o.onHover(id);
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
		this.built.dispose();
		this.pipeline.dispose();
		this.renderer.dispose();
	}
}
