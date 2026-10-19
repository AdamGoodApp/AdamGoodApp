export const GRASS = 0x7cc06b;
export const PARK = 0x86c96c;
export const SAND = 0xf1dfae;
export const CONCRETE = 0xc9ccd1;
export const PAVEMENT = 0xd6cfc4;
export const SIDEWALK = 0xd9d9d6;
export const ROAD = 0x4a4d52;
export const LANE = 0xe8e2c6;
export const WATER_DEEP = 0x2f8fd0;
export const WATER_LIGHT = 0x5cc0ee;
export const FOAM = 0xdff3fb;
export const ROCK = 0x8d8f8a;
export const SNOW = 0xf4f7fb;
export const PINE = 0x2f7a4a;
export const LEAF = 0x5fb257;
export const TRUNK = 0x7a5230;
export const FIELD_A = 0xc9b36b;
export const FIELD_B = 0x9bc46a;
export const FIELD_C = 0xe0c27a;
export const APRON = 0xb8bcc2;
export const RUNWAY = 0x3b3e43;
export const GLASS_DARK = 0x2f4866;
export const WINDOW_LIT = 0xffd27a;
export const WHITE = 0xffffff;

export const FACADES = [
	0xe8eaee, 0x9fb7c9, 0xc8c2b8, 0x6d7f93, 0xd8dde2, 0xf2d8c2,
] as const;
export const HOUSES = [0xf6e7d8, 0xe7f0f6, 0xf9f1c8, 0xe6f2dc] as const;
export const ROOFS = [0xb5544a, 0x5f6f87, 0x8a6f52] as const;
export const CARS = [
	0xe8463c, 0x3b7dd8, 0xf2c94c, 0xffffff, 0x2b2b2b, 0x58c27a, 0xf28c28,
] as const;
export const SHIRTS = [
	0xe85d5d, 0x4f8ef7, 0xf7d64f, 0x8fd36b, 0xffffff, 0xf29e6b, 0x9b6bf2,
] as const;
export const BRIGHTS = [
	0xe8463c, 0x3b7dd8, 0xf2c94c, 0x58c27a, 0xf28c28, 0x9b6bf2,
] as const;

/** Multiply a hex colour's RGB channels by `k`. */
export function darken(hex: number, k: number): number {
	const r = Math.round(((hex >> 16) & 0xff) * k);
	const g = Math.round(((hex >> 8) & 0xff) * k);
	const b = Math.round((hex & 0xff) * k);
	return (r << 16) | (g << 8) | b;
}
