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
const PAN_LIMIT = 120;

export type CameraMode = "fixed" | "pannable";

export class IsoCamera {
	readonly camera = new OrthographicCamera(-1, 1, 1, -1, 1, 2000);
	readonly target = new Vector3();
	zoomFactor = 1;
	private fitHalfW = 1;
	private fitHalfH = 1;
	private readonly raycaster = new Raycaster();
	private readonly ndc = new Vector2();

	constructor(mode: CameraMode) {
		this.zoomFactor = mode === "pannable" ? 2.4 : 1;
		this.camera.up.set(0, 1, 0);
		this.reposition();
	}

	setMode(mode: CameraMode): void {
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
		this.reposition();
		const margin = 1.0;
		if (aspect >= maxX / maxY) {
			this.fitHalfH = maxY * margin;
			this.fitHalfW = this.fitHalfH * aspect;
		} else {
			this.fitHalfW = maxX * margin;
			this.fitHalfH = this.fitHalfW / aspect;
		}
		this.applyFrustum();
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
		this.target.x = Math.min(PAN_LIMIT, Math.max(-PAN_LIMIT, this.target.x));
		this.target.z = Math.min(PAN_LIMIT, Math.max(-PAN_LIMIT, this.target.z));
		this.target.y = 0;
		this.reposition();
	}

	zoomBy(factor: number): void {
		this.zoomFactor = Math.min(3.5, Math.max(1, this.zoomFactor * factor));
		this.applyFrustum();
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
