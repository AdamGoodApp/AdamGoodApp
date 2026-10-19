import { Mesh, Path, type Scene, Shape, ShapeGeometry } from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { ZONES, type ZoneId } from "#/data/zones";

const INSET = 1.2;

export class ZoneHighlights {
	private readonly rings = new Map<
		ZoneId,
		Mesh<ShapeGeometry, MeshBasicNodeMaterial>
	>();
	private hovered: ZoneId | null = null;
	private selected: ZoneId | null = null;
	private t = 0;

	constructor(scene: Scene) {
		for (const zone of ZONES) {
			const { minX, maxX, minZ, maxZ } = zone.rect;
			// Shape lives in XY; rotating -90° about X maps shape y to world -z.
			const outer = new Shape()
				.moveTo(minX, -maxZ)
				.lineTo(maxX, -maxZ)
				.lineTo(maxX, -minZ)
				.lineTo(minX, -minZ)
				.lineTo(minX, -maxZ);
			const hole = new Path()
				.moveTo(minX + INSET, -maxZ + INSET)
				.lineTo(minX + INSET, -minZ - INSET)
				.lineTo(maxX - INSET, -minZ - INSET)
				.lineTo(maxX - INSET, -maxZ + INSET)
				.lineTo(minX + INSET, -maxZ + INSET);
			outer.holes.push(hole);
			const geo = new ShapeGeometry(outer);
			geo.rotateX(-Math.PI / 2);
			geo.translate(0, 0.3, 0);
			const mat = new MeshBasicNodeMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0,
				depthWrite: false,
			});
			const mesh = new Mesh(geo, mat);
			mesh.renderOrder = 5;
			mesh.visible = false;
			scene.add(mesh);
			this.rings.set(zone.id, mesh);
		}
	}

	setHover(id: ZoneId | null): void {
		this.hovered = id;
	}

	setSelected(id: ZoneId | null): void {
		this.selected = id;
	}

	/** Returns true while any ring is still animating. */
	update(dt: number, instant = false): boolean {
		this.t += dt;
		const k = instant ? 1 : 1 - Math.exp(-dt * 14);
		let animating = false;
		for (const [id, ring] of this.rings) {
			const on = id === this.hovered || id === this.selected;
			let goal = on ? 1 : 0;
			if (id === this.selected && !instant) {
				goal = 0.75 + 0.25 * Math.sin(this.t * 3);
			}
			const mat = ring.material;
			mat.opacity += (goal - mat.opacity) * k;
			if (Math.abs(goal - mat.opacity) > 0.01) animating = true;
			ring.visible = mat.opacity > 0.01;
		}
		return animating;
	}

	dispose(): void {
		for (const ring of this.rings.values()) {
			ring.geometry.dispose();
			ring.material.dispose();
			ring.removeFromParent();
		}
	}
}
