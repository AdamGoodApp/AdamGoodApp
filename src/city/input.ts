import type { ZoneId } from "#/data/zones";
import type { CameraMode, IsoCamera } from "./camera";
import { pickZone } from "./picking";

export interface PointerHandlers {
	hover(id: ZoneId | null): void;
	tap(id: ZoneId | null): void;
	panned(): void;
}

const TAP_PX = 6;
const TAP_MS = 300;

export class PointerController {
	private mode: CameraMode;
	private readonly pointers = new Map<number, { x: number; y: number }>();
	private down: { x: number; y: number; t: number; moved: boolean } | null =
		null;
	private lastHover: ZoneId | null = null;
	private pinchDist = 0;

	constructor(
		private readonly canvas: HTMLCanvasElement,
		private readonly camera: IsoCamera,
		private readonly handlers: PointerHandlers,
		mode: CameraMode,
	) {
		this.mode = mode;
		canvas.addEventListener("pointerdown", this.onDown);
		canvas.addEventListener("pointermove", this.onMove);
		canvas.addEventListener("pointerup", this.onUp);
		canvas.addEventListener("pointercancel", this.onCancel);
		canvas.addEventListener("pointerleave", this.onLeave);
	}

	setMode(mode: CameraMode): void {
		this.mode = mode;
		this.pointers.clear();
		this.down = null;
	}

	dispose(): void {
		const c = this.canvas;
		c.removeEventListener("pointerdown", this.onDown);
		c.removeEventListener("pointermove", this.onMove);
		c.removeEventListener("pointerup", this.onUp);
		c.removeEventListener("pointercancel", this.onCancel);
		c.removeEventListener("pointerleave", this.onLeave);
	}

	private zoneAtEvent(e: PointerEvent): ZoneId | null {
		const r = this.canvas.getBoundingClientRect();
		const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
		const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
		return pickZone(this.camera.ray(nx, ny));
	}

	private setHover(id: ZoneId | null): void {
		if (id === this.lastHover) return;
		this.lastHover = id;
		this.canvas.style.cursor = id ? "pointer" : "default";
		this.handlers.hover(id);
	}

	private onDown = (e: PointerEvent) => {
		this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (this.pointers.size === 1) {
			this.down = {
				x: e.clientX,
				y: e.clientY,
				t: performance.now(),
				moved: false,
			};
		} else {
			this.down = null;
			this.pinchDist = this.spread();
		}
		if (this.mode === "pannable") this.canvas.setPointerCapture(e.pointerId);
	};

	private onMove = (e: PointerEvent) => {
		if (
			this.down &&
			Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > TAP_PX
		) {
			this.down.moved = true;
		}
		if (this.mode === "fixed") {
			this.setHover(this.zoneAtEvent(e));
			return;
		}
		const prev = this.pointers.get(e.pointerId);
		if (!prev) return;
		const dx = e.clientX - prev.x;
		const dy = e.clientY - prev.y;
		prev.x = e.clientX;
		prev.y = e.clientY;
		if (this.pointers.size === 1) {
			if (this.down && !this.down.moved) return;
			const r = this.canvas.getBoundingClientRect();
			this.camera.pan(dx, dy, r.width, r.height);
			this.handlers.panned();
		} else if (this.pointers.size === 2) {
			const d = this.spread();
			if (this.pinchDist > 0) this.camera.zoomBy(d / this.pinchDist);
			this.pinchDist = d;
			this.handlers.panned();
		}
	};

	private onUp = (e: PointerEvent) => {
		const down = this.down;
		this.pointers.delete(e.pointerId);
		this.pinchDist = this.pointers.size === 2 ? this.spread() : 0;
		this.down = null;
		if (
			down &&
			!down.moved &&
			performance.now() - down.t <= TAP_MS &&
			this.pointers.size === 0
		) {
			this.handlers.tap(this.zoneAtEvent(e));
		}
	};

	private onCancel = (e: PointerEvent) => {
		this.pointers.delete(e.pointerId);
		this.down = null;
	};

	private onLeave = () => {
		if (this.mode === "fixed") this.setHover(null);
	};

	private spread(): number {
		const [a, b] = [...this.pointers.values()];
		return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
	}
}
