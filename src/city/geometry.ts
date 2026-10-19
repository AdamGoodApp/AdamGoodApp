import {
	BoxGeometry,
	BufferAttribute,
	BufferGeometry,
	Color,
	ConeGeometry,
	CylinderGeometry,
	DoubleSide,
	DynamicDrawUsage,
	Euler,
	Float32BufferAttribute,
	FrontSide,
	InstancedMesh,
	type Material,
	Matrix4,
	Quaternion,
	type Side,
	Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { attribute, fract, positionLocal, step, vertexColor } from "three/tsl";
import { MeshBasicNodeMaterial, MeshLambertNodeMaterial } from "three/webgpu";
import { night, simClock } from "./env";

const tmpColor = new Color();

/** Normalise to non-indexed position/normal/color so every geometry merges. */
function normalise(geo: BufferGeometry): BufferGeometry {
	let g = geo;
	if (g.index) {
		g = geo.toNonIndexed();
		geo.dispose();
	}
	if (g.hasAttribute("uv")) g.deleteAttribute("uv");
	if (g.hasAttribute("uv1")) g.deleteAttribute("uv1");
	if (!g.hasAttribute("normal")) g.computeVertexNormals();
	return g;
}

/**
 * Per-vertex emission class carried by every painted geometry (`glow` attribute):
 * `night` lights up after dusk (lamps, headlights), `siren` flashes red/blue by
 * side all day, `always` glows a little by day and fully at night (screens, neon).
 */
export const GLOW = { none: 0, night: 1, siren: 2, always: 3 } as const;
export type Glow = (typeof GLOW)[keyof typeof GLOW];

function setGlow(g: BufferGeometry, glow: Glow): BufferGeometry {
	const n = g.getAttribute("position").count;
	g.setAttribute(
		"glow",
		new BufferAttribute(new Float32Array(n).fill(glow), 1),
	);
	return g;
}

export function paint(
	geo: BufferGeometry,
	hex: number,
	glow: Glow = GLOW.none,
): BufferGeometry {
	const g = normalise(geo);
	setGlow(g, glow);
	tmpColor.setHex(hex);
	const n = g.getAttribute("position").count;
	const arr = new Float32Array(n * 3);
	for (let i = 0; i < n; i++) {
		arr[i * 3] = tmpColor.r;
		arr[i * 3 + 1] = tmpColor.g;
		arr[i * 3 + 2] = tmpColor.b;
	}
	g.setAttribute("color", new BufferAttribute(arr, 3));
	return g;
}

/** Paint each triangle by a colour picked from its centroid (x, y, z). */
export function paintBy(
	geo: BufferGeometry,
	pick: (x: number, y: number, z: number, tri: number) => number,
): BufferGeometry {
	const g = normalise(geo);
	setGlow(g, GLOW.none);
	const pos = g.getAttribute("position");
	const arr = new Float32Array(pos.count * 3);
	for (let t = 0; t < pos.count / 3; t++) {
		let cx = 0;
		let cy = 0;
		let cz = 0;
		for (let k = 0; k < 3; k++) {
			cx += pos.getX(t * 3 + k);
			cy += pos.getY(t * 3 + k);
			cz += pos.getZ(t * 3 + k);
		}
		tmpColor.setHex(pick(cx / 3, cy / 3, cz / 3, t));
		for (let k = 0; k < 3; k++) {
			const i = (t * 3 + k) * 3;
			arr[i] = tmpColor.r;
			arr[i + 1] = tmpColor.g;
			arr[i + 2] = tmpColor.b;
		}
	}
	g.setAttribute("color", new BufferAttribute(arr, 3));
	return g;
}

export interface Placement {
	x?: number;
	y?: number;
	z?: number;
	rx?: number;
	ry?: number;
	rz?: number;
	sx?: number;
	sy?: number;
	sz?: number;
}

const m4 = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const p = new Vector3();
const s = new Vector3();

/** Rotate (XYZ Euler), scale and translate a geometry in place. */
export function place(geo: BufferGeometry, t: Placement): BufferGeometry {
	e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
	q.setFromEuler(e);
	p.set(t.x ?? 0, t.y ?? 0, t.z ?? 0);
	s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
	geo.applyMatrix4(m4.compose(p, q, s));
	return geo;
}

/** Box whose base sits at `y`, rotated `ry` around its own vertical axis. */
export function box(
	w: number,
	h: number,
	d: number,
	hex: number,
	x = 0,
	y = 0,
	z = 0,
	ry = 0,
): BufferGeometry {
	const g = paint(new BoxGeometry(w, h, d), hex);
	g.translate(0, h / 2, 0);
	if (ry) g.rotateY(ry);
	return g.translate(x, y, z);
}

export function cyl(
	rTop: number,
	rBottom: number,
	h: number,
	seg: number,
	hex: number,
	x = 0,
	y = 0,
	z = 0,
): BufferGeometry {
	const g = paint(new CylinderGeometry(rTop, rBottom, h, seg), hex);
	return g.translate(x, y + h / 2, z);
}

export function cone(
	r: number,
	h: number,
	seg: number,
	hex: number,
	x = 0,
	y = 0,
	z = 0,
): BufferGeometry {
	const g = paint(new ConeGeometry(r, h, seg), hex);
	return g.translate(x, y + h / 2, z);
}

/** Triangular prism (gable roof): base width w, height h, ridge along z. */
export function prism(
	w: number,
	h: number,
	d: number,
	hex: number,
	x = 0,
	y = 0,
	z = 0,
): BufferGeometry {
	const hw = w / 2;
	const hd = d / 2;
	const A = [-hw, 0, -hd];
	const B = [hw, 0, -hd];
	const C = [0, h, -hd];
	const A2 = [-hw, 0, hd];
	const B2 = [hw, 0, hd];
	const C2 = [0, h, hd];
	const tris = [
		[A2, B2, C2],
		[B, A, C],
		[A, A2, C2],
		[A, C2, C],
		[B, C, C2],
		[B, C2, B2],
		[A, B, B2],
		[A, B2, A2],
	];
	const g = new BufferGeometry();
	g.setAttribute("position", new Float32BufferAttribute(tris.flat(2), 3));
	g.computeVertexNormals();
	return paint(g, hex).translate(x, y, z);
}

/** Merge painted geometries into one and dispose the inputs. */
export function merge(list: BufferGeometry[]): BufferGeometry {
	const merged = mergeGeometries(list, false);
	if (!merged) throw new Error("mergeGeometries failed: attribute mismatch");
	for (const g of list) g.dispose();
	return merged;
}

/** Re-tag an already painted geometry's emission class. */
export function glow(geo: BufferGeometry, kind: Glow): BufferGeometry {
	return setGlow(geo, kind);
}

function glowEmissive() {
	const g = attribute("glow", "float");
	const steady = step(0.5, g).mul(step(g, 1.5)).mul(night).mul(1.8);
	// Left and right halves of a light bar alternate twice a second.
	const phase = fract(simClock.mul(2.2).add(step(0, positionLocal.x).mul(0.5)));
	const siren = step(1.5, g).mul(step(g, 2.5)).mul(step(0.5, phase)).mul(3);
	const always = step(2.5, g).mul(night.mul(1.4).add(0.5));
	return vertexColor().mul(steady.add(siren).add(always));
}

function litMaterial(side: Side = FrontSide): MeshLambertNodeMaterial {
	const m = new MeshLambertNodeMaterial({
		vertexColors: true,
		flatShading: true,
		side,
	});
	// NodeMaterial reads emissiveNode for every lit material; the Lambert typings omit it.
	Object.assign(m, { emissiveNode: glowEmissive() });
	return m;
}

export const MAT_STATIC = litMaterial();
/** Instance colour multiplies vertex colour: paint tintable parts WHITE. */
export const MAT_INSTANCED = litMaterial();
export const MAT_BOAT = litMaterial(DoubleSide);
export const MAT_WINDOW = new MeshBasicNodeMaterial({ color: 0xffffff });

export function instanced(
	geo: BufferGeometry,
	material: Material,
	count: number,
	{ shadow = true, color }: { shadow?: boolean; color?: number } = {},
): InstancedMesh {
	const mesh = new InstancedMesh(geo, material, Math.max(1, count));
	mesh.count = count;
	mesh.castShadow = shadow;
	mesh.receiveShadow = shadow;
	mesh.frustumCulled = false;
	mesh.instanceMatrix.setUsage(DynamicDrawUsage);
	if (color !== undefined) {
		tmpColor.setHex(color);
		for (let i = 0; i < Math.max(1, count); i++) mesh.setColorAt(i, tmpColor);
	}
	return mesh;
}
