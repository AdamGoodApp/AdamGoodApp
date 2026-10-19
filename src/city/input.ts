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
/** Wheel delta (pixels) → zoom exponent; trackpad pinches (ctrlKey) report small deltas. */
const WHEEL_ZOOM = 0.0015;
const PINCH_ZOOM = 0.012;

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
		// On window so scrolling over the floating HUD (light bulbs, labels) still zooms.
		window.addEventListener("wheel", this.onWheel, { passive: false });
		// Safari reports trackpad pinches as gesture events instead of ctrl+wheel.
		window.addEventListener("gesturestart", this.onGesture, { passive: false });
		window.addEventListener("gesturechange", this.onGesture, {
			passive: false,
		});
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
		window.removeEventListener("wheel", this.onWheel);
		window.removeEventListener("gesturestart", this.onGesture);
		window.removeEventListener("gesturechange", this.onGesture);
	}

	/** Mouse wheel and trackpad scroll/pinch zoom toward the pointer. */
	private onWheel = (e: WheelEvent) => {
		// Cards and drawers scroll their own content.
		if (e.target instanceof Element && e.target.closest('[role="dialog"]'))
			return;
		e.preventDefault();
		const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
		const factor = Math.exp(-px * (e.ctrlKey ? PINCH_ZOOM : WHEEL_ZOOM));
		const r = this.canvas.getBoundingClientRect();
		const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
		const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
		this.camera.zoomAt(factor, nx, ny);
		this.updateCursor();
		this.handlers.panned();
	};

	private gestureScale = 1;

	/** Safari trackpad pinch: `scale` is cumulative since gesturestart. */
	private onGesture = (e: Event) => {
		if (e.target instanceof Element && e.target.closest('[role="dialog"]'))
			return;
		e.preventDefault();
		// Touch pinches on iOS also fire pointer events, which pannable mode already handles.
		if (this.mode !== "fixed") return;
		const scale = "scale" in e && typeof e.scale === "number" ? e.scale : 1;
		if (e.type === "gesturestart") {
			this.gestureScale = scale;
			return;
		}
		const x =
			"clientX" in e && typeof e.clientX === "number" ? e.clientX : null;
		const y =
			"clientY" in e && typeof e.clientY === "number" ? e.clientY : null;
		const r = this.canvas.getBoundingClientRect();
		const nx = x === null ? 0 : ((x - r.left) / r.width) * 2 - 1;
		const ny = y === null ? 0 : -((y - r.top) / r.height) * 2 + 1;
		this.camera.zoomAt(scale / this.gestureScale, nx, ny);
		this.gestureScale = scale;
		this.updateCursor();
		this.handlers.panned();
	};

	/** Desktop drags pan only once the view is zoomed in past the default framing. */
	private canDragPan(): boolean {
		return this.mode === "pannable" || this.camera.zoomFactor > 1.001;
	}

	private updateCursor(): void {
		if (this.mode !== "fixed") return;
		this.canvas.style.cursor = this.down?.moved
			? "grabbing"
			: this.lastHover
				? "pointer"
				: this.camera.zoomFactor > 1.001
					? "grab"
					: "default";
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
		this.updateCursor();
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
		if (this.canDragPan()) this.canvas.setPointerCapture(e.pointerId);
	};

	private onMove = (e: PointerEvent) => {
		if (
			this.down &&
			Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > TAP_PX
		) {
			this.down.moved = true;
		}
		const dragging = this.down?.moved === true && this.canDragPan();
		if (this.mode === "fixed" && !dragging) {
			const prev = this.pointers.get(e.pointerId);
			if (prev) {
				prev.x = e.clientX;
				prev.y = e.clientY;
			}
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
			this.updateCursor();
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
		this.updateCursor();
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
