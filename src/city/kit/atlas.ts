import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from "three";
import { mulberry32 } from "../rng";

/**
 * Procedural facade atlas: every tile is ONE bay × ONE floor of a building
 * face, tiled by the facade shader. `albedo` holds colour; `mask` holds
 * R = window glass that can light up at night, G = shop-front light.
 */
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 4;
export const TILE_PX = 128;
/** Edge pixels repeated around each tile so mip levels don't bleed between tiles. */
export const GUTTER_PX = 8;

export const TILE = {
	brickRed: 0,
	brickBrown: 1,
	brickDark: 2,
	stoneBeige: 3,
	stuccoCream: 4,
	stoneGrey: 5,
	glassBlue: 6,
	glassTeal: 7,
	glassDark: 8,
	officeBand: 9,
	officeWhite: 10,
	apartment: 11,
	sidingWhite: 12,
	sidingBlue: 13,
	sidingYellow: 14,
	houseBrick: 15,
	storeGlass: 16,
	storeBrick: 17,
	storeDark: 18,
	lobby: 19,
	garageRed: 20,
	blankBrick: 21,
	blankConcrete: 22,
	blankStone: 23,
	hospital: 24,
	stoneWhite: 25,
	brickOrange: 26,
	garageWhite: 27,
} as const;
export type Tile = (typeof TILE)[keyof typeof TILE];

type Ctx = CanvasRenderingContext2D;
type Painter = (a: Ctx, m: Ctx, rng: () => number) => void;

const S = TILE_PX - 2 * GUTTER_PX;

function rect(
	c: Ctx,
	color: string,
	x: number,
	y: number,
	w: number,
	h: number,
) {
	c.fillStyle = color;
	c.fillRect(x, y, w, h);
}

function vary(
	base: [number, number, number],
	amount: number,
	rng: () => number,
): string {
	const k = 1 + (rng() - 0.5) * amount;
	const [r, g, b] = base.map((v) =>
		Math.max(0, Math.min(255, Math.round(v * k))),
	);
	return `rgb(${r},${g},${b})`;
}

function bricks(
	a: Ctx,
	base: [number, number, number],
	mortar: string,
	rng: () => number,
) {
	rect(a, mortar, 0, 0, S, S);
	const rowH = 7;
	for (let y = 0, row = 0; y < S; y += rowH, row++) {
		const off = row % 2 ? 0 : -8;
		for (let x = off; x < S; x += 16) {
			rect(a, vary(base, 0.22, rng), x + 1, y + 1, 14, rowH - 1);
		}
	}
}

function stone(a: Ctx, base: [number, number, number], rng: () => number) {
	rect(a, vary(base, 0, rng), 0, 0, S, S);
	for (let y = 0; y < S; y += 14) {
		for (let x = (y / 14) % 2 ? 0 : -14; x < S; x += 28) {
			rect(a, vary(base, 0.08, rng), x + 1, y + 1, 26, 12);
		}
	}
}

function glassGradient(
	a: Ctx,
	x: number,
	y: number,
	w: number,
	h: number,
	top: string,
	bottom: string,
) {
	const g = a.createLinearGradient(x, y, x + w * 0.4, y + h);
	g.addColorStop(0, top);
	g.addColorStop(1, bottom);
	a.fillStyle = g;
	a.fillRect(x, y, w, h);
}

/** A framed sash window with sill; marks the glass in the mask's red channel. */
function sash(
	a: Ctx,
	m: Ctx,
	frame: string,
	x: number,
	y: number,
	w: number,
	h: number,
) {
	rect(a, frame, x - 3, y - 3, w + 6, h + 6);
	glassGradient(a, x, y, w, h, "#5d7690", "#26384c");
	rect(a, frame, x + w / 2 - 1, y, 2, h);
	rect(a, frame, x, y + h * 0.45, w, 2);
	rect(a, "#d8d2c4", x - 5, y + h + 3, w + 10, 4);
	rect(m, "#ff0000", x, y, w, h);
}

function siding(a: Ctx, base: [number, number, number], rng: () => number) {
	for (let y = 0; y < S; y += 8) {
		rect(a, vary(base, 0.04, rng), 0, y, S, 7);
		rect(a, vary(base, -0.25, rng), 0, y + 7, S, 1);
	}
}

function storefront(a: Ctx, m: Ctx, pier: string, sign: string) {
	rect(a, pier, 0, 0, S, S);
	rect(a, sign, 6, 6, S - 12, 18);
	glassGradient(a, 10, 30, S - 20, S - 34, "#7b98b2", "#2a3b4f");
	rect(a, "#1d1d1d", S / 2 + 18, 44, 22, S - 48);
	rect(a, pier, S / 2 - 2, 30, 4, S - 34);
	rect(m, "#00ff00", 10, 30, S - 20, S - 34);
}

function garage(a: Ctx, frame: string, door: string) {
	rect(a, frame, 0, 0, S, S);
	rect(a, door, 10, 22, S - 20, S - 22);
	for (let y = 30; y < S; y += 14)
		rect(a, "rgba(0,0,0,0.18)", 10, y, S - 20, 2);
}

function curtain(a: Ctx, m: Ctx, top: string, bottom: string, mullion: string) {
	glassGradient(a, 0, 0, S, S, top, bottom);
	rect(a, mullion, 0, 0, S, 5);
	rect(a, mullion, 0, 0, 4, S);
	rect(a, mullion, S / 2 - 1, 0, 2, S);
	// Curtain walls are mostly glass: dimmer mask so a lit bay is not a solid block.
	rect(m, "#8c0000", 4, 5, S - 4, S - 5);
}

const PAINTERS: Record<Tile, Painter> = {
	[TILE.brickRed]: (a, m, r) => {
		bricks(a, [158, 66, 50], "#c9b7a6", r);
		sash(a, m, "#efe7da", 34, 26, 44, 62);
		rect(a, "#d9cfbf", 30, 18, 52, 6);
	},
	[TILE.brickBrown]: (a, m, r) => {
		bricks(a, [118, 78, 56], "#b9a996", r);
		sash(a, m, "#e9e1d2", 30, 24, 52, 64);
	},
	[TILE.brickDark]: (a, m, r) => {
		bricks(a, [72, 52, 46], "#8a7d74", r);
		sash(a, m, "#c7bfb2", 32, 26, 48, 60);
	},
	[TILE.stoneBeige]: (a, m, r) => {
		stone(a, [212, 196, 164], r);
		sash(a, m, "#f4ecdc", 30, 20, 52, 72);
	},
	[TILE.stuccoCream]: (a, m, r) => {
		stone(a, [236, 224, 196], r);
		sash(a, m, "#ffffff", 34, 26, 44, 60);
		rect(a, "#5f7f5f", 22, 26, 9, 60);
		rect(a, "#5f7f5f", 81, 26, 9, 60);
	},
	[TILE.stoneGrey]: (a, m, r) => {
		stone(a, [176, 176, 170], r);
		rect(a, "#9a9a94", 0, 0, 12, S);
		rect(a, "#9a9a94", S - 12, 0, 12, S);
		glassGradient(a, 22, 10, S - 44, S - 22, "#5a6f86", "#1f2c3a");
		rect(a, "#8b8b85", 22, S - 18, S - 44, 6);
		rect(m, "#ff0000", 22, 10, S - 44, S - 22);
	},
	[TILE.glassBlue]: (a, m) => curtain(a, m, "#8fc3e8", "#2f6b9a", "#c7d6e2"),
	[TILE.glassTeal]: (a, m) => curtain(a, m, "#8fd8cf", "#2a7f78", "#d2e2de"),
	[TILE.glassDark]: (a, m) => curtain(a, m, "#59677a", "#1b2330", "#3b4350"),
	[TILE.officeBand]: (a, m) => {
		rect(a, "#d9dbdc", 0, 0, S, S);
		glassGradient(a, 0, 30, S, 54, "#6f8fab", "#2c4258");
		rect(a, "#c3c6c8", 0, 30, S, 3);
		rect(m, "#ff0000", 0, 33, S, 51);
	},
	[TILE.officeWhite]: (a, m) => {
		rect(a, "#eceeef", 0, 0, S, S);
		rect(a, "#d4d7d9", 0, S - 10, S, 10);
		glassGradient(a, 20, 18, S - 40, S - 44, "#7d9bb5", "#2b3f55");
		rect(m, "#ff0000", 20, 18, S - 40, S - 44);
	},
	[TILE.apartment]: (a, m, r) => {
		stone(a, [214, 210, 202], r);
		glassGradient(a, 18, 14, 44, 76, "#6d8aa6", "#26394d");
		rect(a, "#c6c2ba", 70, 30, 30, 40);
		rect(a, "#9a968f", 8, 84, S - 16, 8);
		for (let x = 10; x < S - 8; x += 9) rect(a, "#7c7872", x, 66, 2, 18);
		rect(a, "#7c7872", 8, 64, S - 16, 3);
		rect(m, "#ff0000", 18, 14, 44, 50);
	},
	[TILE.sidingWhite]: (a, m, r) => {
		siding(a, [238, 236, 230], r);
		sash(a, m, "#ffffff", 34, 26, 44, 56);
	},
	[TILE.sidingBlue]: (a, m, r) => {
		siding(a, [150, 178, 204], r);
		sash(a, m, "#ffffff", 34, 26, 44, 56);
	},
	[TILE.sidingYellow]: (a, m, r) => {
		siding(a, [232, 206, 140], r);
		sash(a, m, "#ffffff", 34, 26, 44, 56);
	},
	[TILE.houseBrick]: (a, m, r) => {
		bricks(a, [176, 92, 64], "#d6c7b6", r);
		sash(a, m, "#ffffff", 34, 26, 44, 56);
	},
	[TILE.storeGlass]: (a, m) => storefront(a, m, "#3d4a55", "#c94a3c"),
	[TILE.storeBrick]: (a, m) => storefront(a, m, "#7d3e30", "#2f5f8f"),
	[TILE.storeDark]: (a, m) => storefront(a, m, "#262626", "#e3b23c"),
	[TILE.lobby]: (a, m) => {
		glassGradient(a, 0, 0, S, S, "#9cc0dc", "#30506c");
		rect(a, "#2b2b2b", 0, 0, 6, S);
		rect(a, "#2b2b2b", 0, 0, S, 8);
		rect(m, "#00ff00", 6, 8, S - 6, S - 8);
	},
	[TILE.garageRed]: (a) => garage(a, "#e7e2d8", "#c8372b"),
	[TILE.blankBrick]: (a, _m, r) => bricks(a, [150, 70, 54], "#c4b2a2", r),
	[TILE.blankConcrete]: (a, _m, r) => stone(a, [190, 190, 186], r),
	[TILE.blankStone]: (a, _m, r) => stone(a, [214, 200, 172], r),
	[TILE.hospital]: (a, m) => {
		rect(a, "#f4f6f7", 0, 0, S, S);
		glassGradient(a, 14, 22, S - 28, 54, "#8fc3d8", "#3a7a96");
		rect(a, "#dfe4e6", 0, 84, S, 6);
		rect(m, "#ff0000", 14, 22, S - 28, 54);
	},
	[TILE.stoneWhite]: (a, m, r) => {
		stone(a, [240, 236, 226], r);
		sash(a, m, "#ffffff", 32, 20, 48, 70);
		rect(a, "#d7d1c3", 26, 12, 60, 7);
	},
	[TILE.brickOrange]: (a, m, r) => {
		bricks(a, [196, 104, 66], "#e1d2c0", r);
		sash(a, m, "#fbf6ec", 34, 24, 44, 64);
		rect(a, "#efe6d6", 28, 14, 56, 8);
	},
	[TILE.garageWhite]: (a) => garage(a, "#d9d4ca", "#f2f0ea"),
};

function makeCanvas(): HTMLCanvasElement {
	const c = document.createElement("canvas");
	c.width = ATLAS_COLS * TILE_PX;
	c.height = ATLAS_ROWS * TILE_PX;
	return c;
}

/** Copy each tile's edge pixels outward into its gutter. */
function bleedGutter(c: Ctx, x0: number, y0: number) {
	const g = GUTTER_PX;
	const inner = TILE_PX - 2 * g;
	const cv = c.canvas;
	c.drawImage(cv, x0 + g, y0 + g, inner, 1, x0 + g, y0, inner, g);
	c.drawImage(
		cv,
		x0 + g,
		y0 + g + inner - 1,
		inner,
		1,
		x0 + g,
		y0 + g + inner,
		inner,
		g,
	);
	c.drawImage(cv, x0 + g, y0, 1, TILE_PX, x0, y0, g, TILE_PX);
	c.drawImage(
		cv,
		x0 + g + inner - 1,
		y0,
		1,
		TILE_PX,
		x0 + g + inner,
		y0,
		g,
		TILE_PX,
	);
}

export interface FacadeAtlas {
	albedo: CanvasTexture;
	mask: CanvasTexture;
}

let cached: FacadeAtlas | null = null;

export function facadeAtlas(): FacadeAtlas {
	if (cached) return cached;
	const albedoCanvas = makeCanvas();
	const maskCanvas = makeCanvas();
	const a = albedoCanvas.getContext("2d");
	const m = maskCanvas.getContext("2d");
	if (!a || !m) throw new Error("2D canvas unavailable");
	rect(m, "#000000", 0, 0, maskCanvas.width, maskCanvas.height);
	const rng = mulberry32(0xfacade);
	for (const [key, paint] of Object.entries(PAINTERS)) {
		const t = Number(key);
		const x0 = (t % ATLAS_COLS) * TILE_PX;
		const y0 = Math.floor(t / ATLAS_COLS) * TILE_PX;
		for (const c of [a, m]) {
			c.save();
			c.translate(x0 + GUTTER_PX, y0 + GUTTER_PX);
			c.beginPath();
			c.rect(0, 0, S, S);
			c.clip();
		}
		paint(a, m, rng);
		a.restore();
		m.restore();
		bleedGutter(a, x0, y0);
		bleedGutter(m, x0, y0);
	}
	const albedo = new CanvasTexture(albedoCanvas);
	albedo.colorSpace = SRGBColorSpace;
	const mask = new CanvasTexture(maskCanvas);
	for (const t of [albedo, mask]) {
		t.minFilter = LinearMipmapLinearFilter;
		t.anisotropy = 4;
	}
	cached = { albedo, mask };
	return cached;
}
