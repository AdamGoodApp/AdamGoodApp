import { BufferAttribute, BufferGeometry, Color } from "three";
import {
	attribute,
	dFdx,
	dFdy,
	floor,
	fract,
	hash,
	mix,
	mod,
	step,
	texture,
	uv,
	vec2,
	vec3,
	vertexColor,
} from "three/tsl";
import { MeshLambertNodeMaterial } from "three/webgpu";
import { night, simClock, skyTop } from "../env";
import { place } from "../geometry";
import {
	ATLAS_COLS,
	ATLAS_ROWS,
	facadeAtlas,
	GUTTER_PX,
	TILE_PX,
	type Tile,
} from "./atlas";

/** Storey height and target bay width every facade is laid out on. */
export const FLOOR_H = 3.2;
export const BAY_W = 3;

export interface FacadeOptions {
	/** Tile for every storey above the ground floor. */
	upper: Tile;
	/** Ground-floor tile (shop fronts, lobbies); defaults to `upper`. */
	ground?: Tile;
	/** Tint multiplied into the atlas colour (keep it light: ≤ 0xffffff). */
	tint?: number;
	/** Per-building seed so lit windows differ between neighbours. */
	seed?: number;
	/** World y of the bottom of these walls (setback tiers start above 0). */
	base?: number;
	/** Storey height; houses use 3. */
	floor?: number;
	/** Skip walls by side: +z "front", -z "back", +x "right", -x "left". */
	skip?: ("front" | "back" | "left" | "right")[];
}

const tint = new Color();

/**
 * Four textured walls (no roof) of a w×d×h box centred on (0, base, 0).
 * UVs count bays horizontally and storeys vertically so the facade shader
 * tiles one atlas tile per bay per floor; v < 1 is the ground floor.
 */
export function facadeBox(
	w: number,
	d: number,
	h: number,
	o: FacadeOptions,
): BufferGeometry {
	const base = o.base ?? 0;
	const floorH = o.floor ?? FLOOR_H;
	const upper = o.upper;
	const ground = base > 0 ? upper : (o.ground ?? upper);
	const seed = o.seed ?? 0;
	tint.setHex(o.tint ?? 0xffffff);
	const hw = w / 2;
	const hd = d / 2;
	// [x0,z0] → [x1,z1] along the wall, outward normal [nx,nz], side name.
	const walls = [
		[-hw, hd, hw, hd, 0, 1, "front"],
		[hw, -hd, -hw, -hd, 0, -1, "back"],
		[hw, hd, hw, -hd, 1, 0, "right"],
		[-hw, -hd, -hw, hd, -1, 0, "left"],
	] as const;
	const pos: number[] = [];
	const nor: number[] = [];
	const uvs: number[] = [];
	for (const [x0, z0, x1, z1, nx, nz, side] of walls) {
		if (o.skip?.includes(side)) continue;
		const len = Math.hypot(x1 - x0, z1 - z0);
		const bays = Math.max(1, Math.round(len / BAY_W));
		const v1 = h / floorH;
		const quad = [
			[x0, 0, z0, 0, 0],
			[x1, 0, z1, bays, 0],
			[x1, h, z1, bays, v1],
			[x0, 0, z0, 0, 0],
			[x1, h, z1, bays, v1],
			[x0, h, z0, 0, v1],
		];
		for (const [x, y, z, u, v] of quad) {
			pos.push(x, y + base, z);
			nor.push(nx, 0, nz);
			uvs.push(u, v);
		}
	}
	const n = pos.length / 3;
	const g = new BufferGeometry();
	g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
	g.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
	g.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
	const col = new Float32Array(n * 3);
	const tiles = new Float32Array(n * 2);
	const seeds = new Float32Array(n).fill(seed);
	for (let i = 0; i < n; i++) {
		col.set([tint.r, tint.g, tint.b], i * 3);
		tiles.set([upper, ground], i * 2);
	}
	g.setAttribute("color", new BufferAttribute(col, 3));
	g.setAttribute("facade", new BufferAttribute(tiles, 2));
	g.setAttribute("fseed", new BufferAttribute(seeds, 1));
	return g;
}

/** facadeBox positioned in the world (rotation about its own vertical axis). */
export function facadeAt(
	w: number,
	d: number,
	h: number,
	o: FacadeOptions & { x: number; z: number; ry?: number },
): BufferGeometry {
	return place(facadeBox(w, d, h, o), { x: o.x, z: o.z, ry: o.ry ?? 0 });
}

let material: MeshLambertNodeMaterial | null = null;

/** Shared facade material (created on first use; needs a DOM for the atlas). */
export function facadeMaterial(): MeshLambertNodeMaterial {
	if (material) return material;
	const { albedo, mask } = facadeAtlas();
	const cell = uv();
	const tiles = attribute("facade", "vec2");
	const tile = mix(tiles.x, tiles.y, step(cell.y, 1));
	const col = mod(tile, ATLAS_COLS);
	const row = floor(tile.div(ATLAS_COLS));
	const g = GUTTER_PX / TILE_PX;
	const inner = 1 - 2 * g;
	const local = fract(cell);
	const atlasUv = vec2(
		col.add(local.x.mul(inner).add(g)).div(ATLAS_COLS),
		row.add(1).sub(local.y.mul(inner).add(g)).div(ATLAS_ROWS).oneMinus(),
	);
	// Gradients from the continuous cell coordinates avoid seams where fract() wraps.
	const scale = vec2(inner / ATLAS_COLS, inner / ATLAS_ROWS);
	const dx = dFdx(cell).mul(scale);
	const dy = dFdy(cell).mul(scale);
	const base = texture(albedo, atlasUv).grad(dx, dy);
	const m = texture(mask, atlasUv).grad(dx, dy);

	const id = floor(cell);
	const seed = attribute("fseed", "float");
	const key = id.x.mul(31).add(id.y.mul(97)).add(seed.mul(1009));
	// Each window keeps its state for its own 20–60 s before re-rolling.
	const period = hash(key.add(7)).mul(40).add(20);
	const lit = step(0.55, hash(key.add(floor(simClock.div(period)).mul(13))));
	const warm = mix(
		vec3(1, 0.7, 0.36),
		vec3(0.8, 0.88, 1),
		hash(key.add(3)).mul(0.5),
	);

	const glass = m.r;
	const reflect = mix(
		base.rgb,
		skyTop.mul(0.9),
		glass.mul(0.35).mul(night.oneMinus()),
	);
	const mat = new MeshLambertNodeMaterial();
	mat.colorNode = reflect.mul(vertexColor());
	Object.assign(mat, {
		emissiveNode: warm
			.mul(glass.mul(lit).mul(0.85))
			.add(vec3(1, 0.8, 0.5).mul(m.g).mul(0.8))
			.mul(night),
	});
	material = mat;
	return mat;
}
