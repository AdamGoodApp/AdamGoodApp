import {
	BufferGeometry,
	CanvasTexture,
	Mesh,
	PlaneGeometry,
	SRGBColorSpace,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MeshBasicNodeMaterial } from "three/webgpu";

export interface SignSpec {
	label: string;
	width: number;
	height: number;
	/** Plane centre. */
	position: [number, number, number];
	/** Rotation about Y; the plane faces +Z before rotation. */
	ry: number;
}

const CELL_W = 256;
const CELL_H = 64;
const FONT_FAMILY = '"Press Start 2P", monospace';
const FONT_LOAD = '22px "Press Start 2P"';

function drawAtlas(canvas: HTMLCanvasElement, labels: readonly string[]): void {
	const g = canvas.getContext("2d");
	if (!g) return;
	g.fillStyle = "#111";
	g.fillRect(0, 0, canvas.width, canvas.height);
	g.fillStyle = "#fff";
	g.textAlign = "center";
	g.textBaseline = "middle";
	labels.forEach((label, i) => {
		let size = 22;
		g.font = `${size}px ${FONT_FAMILY}`;
		while (size > 8 && g.measureText(label).width > CELL_W - 16) {
			size -= 1;
			g.font = `${size}px ${FONT_FAMILY}`;
		}
		g.fillText(label, CELL_W / 2, i * CELL_H + CELL_H / 2 + 1);
	});
}

/** All signs in one mesh: one shared label atlas texture, one draw call. */
export function signMesh(signs: SignSpec[]): Mesh {
	const labels = [...new Set(signs.map((s) => s.label))];
	const rows = Math.max(1, labels.length);

	const canvas = document.createElement("canvas");
	canvas.width = CELL_W;
	canvas.height = CELL_H * rows;
	drawAtlas(canvas, labels);

	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	texture.anisotropy = 4;

	if (typeof document !== "undefined" && document.fonts) {
		document.fonts.load(FONT_LOAD).then(
			() => {
				drawAtlas(canvas, labels);
				texture.needsUpdate = true;
			},
			() => {},
		);
	}

	const parts = signs.map((s) => {
		const row = labels.indexOf(s.label);
		const v0 = 1 - (row + 1) / rows;
		const v1 = 1 - row / rows;
		const g = new PlaneGeometry(s.width, s.height);
		const uv = g.getAttribute("uv");
		for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
		g.rotateY(s.ry);
		g.translate(s.position[0], s.position[1], s.position[2]);
		return g;
	});

	let geometry = new BufferGeometry();
	if (parts.length > 0) {
		const merged = mergeGeometries(parts, false);
		if (!merged) throw new Error("signMesh: geometry merge failed");
		for (const p of parts) p.dispose();
		geometry = merged;
	}

	const mesh = new Mesh(geometry, new MeshBasicNodeMaterial({ map: texture }));
	mesh.castShadow = false;
	mesh.receiveShadow = false;
	return mesh;
}
