import {
	Box3,
	OrthographicCamera,
	Plane,
	type Ray,
	Raycaster,
	Vector2,
	Vector3,
} from "three";

const OFFSET = new Vector3(400, 400, 400);
const FIT_BOX = new Box3(new Vector3(-88, 0, -88), new Vector3(88, 14, 88));
const RIGHT = new Vector3(1, 0, -1).normalize();
/** Ground direction that moves up the screen; √3 undoes the 35.26° tilt. */
const UP_ON_GROUND = new Vector3(-1, 0, -1)
	.normalize()
	.multiplyScalar(Math.sqrt(3));
const GROUND = new Plane(new Vector3(0, 1, 0), 0);
/**
 * Half-extent of the built city in view units (screen-right u, screen-up v);
 * matches the outskirts culling in world/outskirts.ts. The view never leaves it.
 */
const BUILT_U = 215;
const BUILT_V = 115;

export type CameraMode = "fixed" | "pannable";

export class IsoCamera {
	readonly camera = new OrthographicCamera(-1, 1, 1, -1, 1, 2000);
	readonly target = new Vector3();
	zoomFactor = 1;
	private fitHalfW = 1;
	private fitHalfH = 1;
	private readonly raycaster = new Raycaster();
	private readonly ndc = new Vector2();

	private mode: CameraMode;

	constructor(mode: CameraMode) {
		this.mode = mode;
		this.zoomFactor = mode === "pannable" ? 2.4 : 1;
		this.camera.up.set(0, 1, 0);
		this.reposition();
	}

	setMode(mode: CameraMode): void {
		this.mode = mode;
		this.zoomFactor = mode === "pannable" ? 2.4 : 1;
		if (mode === "fixed") this.target.set(0, 0, 0);
		this.reposition();
		this.applyFrustum();
	}

	private reposition(): void {
		this.camera.position.copy(this.target).add(OFFSET);
		this.camera.lookAt(this.target);
		this.camera.updateMatrixWorld();
	}

	fit(aspect: number): void {
		// Measure the box from a camera centred on the origin so panning never changes the fit.
		const saved = this.target.clone();
		this.target.set(0, 0, 0);
		this.reposition();
		let maxX = 0;
		let maxY = 0;
		const v = new Vector3();
		for (let i = 0; i < 8; i++) {
			v.set(
				i & 1 ? FIT_BOX.max.x : FIT_BOX.min.x,
				i & 2 ? FIT_BOX.max.y : FIT_BOX.min.y,
				i & 4 ? FIT_BOX.max.z : FIT_BOX.min.z,
			).applyMatrix4(this.camera.matrixWorldInverse);
			maxX = Math.max(maxX, Math.abs(v.x));
			maxY = Math.max(maxY, Math.abs(v.y));
		}
		this.target.copy(saved);
		const margin = 1.0;
		if (aspect >= maxX / maxY) {
			this.fitHalfH = maxY * margin;
			this.fitHalfW = this.fitHalfH * aspect;
		} else {
			this.fitHalfW = maxX * margin;
			this.fitHalfH = this.fitHalfW / aspect;
		}
		this.applyFrustum();
		this.clampTarget();
	}

	private applyFrustum(): void {
		const hw = this.fitHalfW / this.zoomFactor;
		const hh = this.fitHalfH / this.zoomFactor;
		this.camera.left = -hw;
		this.camera.right = hw;
		this.camera.top = hh;
		this.camera.bottom = -hh;
		this.camera.updateProjectionMatrix();
	}

	pan(dxPx: number, dyPx: number, width: number, height: number): void {
		const sx = (-dxPx * (2 * this.fitHalfW)) / this.zoomFactor / width;
		const sy = (dyPx * (2 * this.fitHalfH)) / this.zoomFactor / height;
		this.target.addScaledVector(RIGHT, sx).addScaledVector(UP_ON_GROUND, sy);
		this.clampTarget();
	}

	zoomBy(factor: number): void {
		const min = Math.max(1, this.fitHalfW / BUILT_U, this.fitHalfH / BUILT_V);
		this.zoomFactor = Math.min(3.5, Math.max(min, this.zoomFactor * factor));
		this.applyFrustum();
		this.clampTarget();
	}

	/**
	 * Zoom keeping the ground under the pointer (NDC `ndcX`, `ndcY`) fixed on screen:
	 * the target slides toward the pointer by the share of the view the zoom removed.
	 */
	zoomAt(factor: number, ndcX: number, ndcY: number): void {
		const hw = this.fitHalfW / this.zoomFactor;
		const hh = this.fitHalfH / this.zoomFactor;
		this.zoomBy(factor);
		const hw2 = this.fitHalfW / this.zoomFactor;
		const hh2 = this.fitHalfH / this.zoomFactor;
		this.target
			.addScaledVector(RIGHT, ndcX * (hw - hw2))
			.addScaledVector(UP_ON_GROUND, ndcY * (hh - hh2));
		// Fully zoomed out on desktop: return to the default centred framing.
		if (this.mode === "fixed" && this.zoomFactor <= 1.0001)
			this.target.set(0, 0, 0);
		this.clampTarget();
	}

	/** Keep the whole view inside the built city (in view space: u right, v up). */
	private clampTarget(): void {
		const hw = this.fitHalfW / this.zoomFactor;
		const hh = this.fitHalfH / this.zoomFactor;
		const t = this.target;
		const limU = Math.max(0, BUILT_U - hw);
		const limV = Math.max(0, BUILT_V - hh);
		const u = Math.min(limU, Math.max(-limU, (t.x - t.z) / Math.SQRT2));
		const v = Math.min(limV, Math.max(-limV, -(t.x + t.z) / Math.sqrt(6)));
		t.set(
			(u * Math.SQRT2 - v * Math.sqrt(6)) / 2,
			0,
			(-v * Math.sqrt(6) - u * Math.SQRT2) / 2,
		);
		this.reposition();
	}

	screenPoint(world: Vector3, width: number, height: number) {
		const v = world.clone().project(this.camera);
		return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
	}

	ray(ndcX: number, ndcY: number): Ray {
		this.ndc.set(ndcX, ndcY);
		this.raycaster.setFromCamera(this.ndc, this.camera);
		return this.raycaster.ray;
	}

	groundPoint(ndcX: number, ndcY: number): { x: number; z: number } | null {
		const out = new Vector3();
		return this.ray(ndcX, ndcY).intersectPlane(GROUND, out)
			? { x: out.x, z: out.z }
			: null;
	}
}
