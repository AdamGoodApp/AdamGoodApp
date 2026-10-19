import {
	type BufferGeometry,
	Color,
	type InstancedMesh,
	type Material,
	Object3D,
	type Vector3,
} from "three";
import { instanced } from "../geometry";

export interface Agent {
	update(dt: number, t: number): void;
}

const dummy = new Object3D();
dummy.rotation.order = "YXZ";
const tmpColor = new Color();

/** An InstancedMesh plus a matrix writer; one draw call per pool. */
export class Pool {
	readonly mesh: InstancedMesh;

	constructor(
		geo: BufferGeometry,
		material: Material,
		readonly count: number,
		opts: { shadow?: boolean; color?: number } = {},
	) {
		this.mesh = instanced(geo, material, count, {
			// Shadow passes cost a draw call per pool: only sizeable things opt in.
			shadow: opts.shadow ?? false,
			color: opts.color ?? 0xffffff,
		});
	}

	write(
		i: number,
		pos: Vector3,
		yaw: number,
		pitch = 0,
		roll = 0,
		scale = 1,
	): void {
		dummy.position.copy(pos);
		dummy.rotation.set(pitch, yaw, roll);
		dummy.scale.setScalar(scale);
		dummy.updateMatrix();
		this.mesh.setMatrixAt(i, dummy.matrix);
	}

	hide(i: number): void {
		dummy.position.set(0, -1000, 0);
		dummy.rotation.set(0, 0, 0);
		dummy.scale.setScalar(0);
		dummy.updateMatrix();
		this.mesh.setMatrixAt(i, dummy.matrix);
	}

	color(i: number, hex: number): void {
		this.mesh.setColorAt(i, tmpColor.setHex(hex));
		if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
	}

	commit(): void {
		this.mesh.instanceMatrix.needsUpdate = true;
	}
}

/** Number of agents for a base count at the current density (min 1 when n > 0). */
export function scaled(n: number, density: number): number {
	return n > 0 ? Math.max(1, Math.round(n * density)) : 0;
}
