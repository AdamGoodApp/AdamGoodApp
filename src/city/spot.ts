import { Mesh, RingGeometry, type Scene } from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";

/**
 * A pulsing ring on the ground around any point (a building, a landmark, an
 * event), drawn over the scenery so it is never hidden. One at a time.
 */
export class SpotHighlight {
	private readonly mesh: Mesh<RingGeometry, MeshBasicNodeMaterial>;
	private remaining = 0;
	private t = 0;

	constructor(scene: Scene) {
		const geo = new RingGeometry(0.86, 1, 48);
		geo.rotateX(-Math.PI / 2);
		const mat = new MeshBasicNodeMaterial({
			color: 0xffe066,
			transparent: true,
			opacity: 0,
			depthWrite: false,
			depthTest: false,
		});
		this.mesh = new Mesh(geo, mat);
		this.mesh.renderOrder = 6;
		this.mesh.visible = false;
		scene.add(this.mesh);
	}

	/** Shows the ring for `seconds` (0 keeps it until cleared). */
	show(x: number, z: number, radius: number, seconds: number): void {
		this.mesh.position.set(x, 0.4, z);
		this.mesh.scale.setScalar(Math.max(1, radius));
		this.remaining = seconds > 0 ? seconds : Number.POSITIVE_INFINITY;
		this.mesh.visible = true;
	}

	clear(): void {
		this.remaining = 0;
	}

	/** Advances on wall-clock time; returns true while the ring is on screen. */
	update(dt: number, instant = false): boolean {
		if (!this.mesh.visible) return false;
		this.t += dt;
		this.remaining -= dt;
		const mat = this.mesh.material;
		if (this.remaining <= 0) {
			mat.opacity = 0;
			this.mesh.visible = false;
			return true;
		}
		mat.opacity = instant ? 0.9 : 0.65 + 0.3 * Math.sin(this.t * 4);
		return true;
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
		this.mesh.removeFromParent();
	}
}
