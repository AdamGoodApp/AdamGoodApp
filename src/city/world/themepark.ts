import {
	type BufferGeometry,
	CatmullRomCurve3,
	Group,
	Mesh,
	Object3D,
	TorusGeometry,
	TubeGeometry,
	Vector3,
} from "three";
import {
	box,
	cone,
	cyl,
	GLOW,
	glow,
	MAT_STATIC,
	merge,
	paint,
	paintBy,
	place,
	prism,
} from "../geometry";
import { BRIGHTS, PAVEMENT, SHIRTS, WHITE } from "../palette";
import { lamp, pine, roundTree } from "../prefabs";
import { scaled } from "../sim/agent";
import { type CrowdSpot, createCrowd } from "../sim/crowd";
import { Polyline } from "../sim/path";
import {
	BumperCarsAgent,
	CarouselAgent,
	CoasterAgent,
	DropTowerAgent,
	FerrisAgent,
	SwingAgent,
} from "../sim/rides";
import type { BuildContext } from "./context";
import { type SignSpec, signMesh } from "./signs";

const GATE_Z = 35.5;
const PATH_Y = 0.16;
const SAMPLES = 600;

const COASTER_POINTS: [number, number, number][] = [
	[-24, 1.5, 36],
	[-24, 2.5, 46],
	[-24, 9, 58],
	[-24, 18, 70],
	[-21, 16, 79],
	[-13, 5, 80],
	[-6, 14, 72],
	[-4, 6, 62],
	[-8, 10, 52],
	[-14, 3, 44],
	[-19, 6, 38],
];
const LIFT_TOP_INDEX = 3;

const FERRIS_CENTER = new Vector3(14, 10, 70);
const FERRIS_YAW = Math.PI / 4;
const FERRIS_RADIUS = 9;
const CAROUSEL_CENTER = new Vector3(16, 0, 48);

const DROP_X = 22.5;
const DROP_Z = 38.5;
const DROP_HEIGHT = 28;
const SWING_X = 0.5;
const SWING_Z = 76.5;
const SWING_PIVOT_Y = 11.35;
const BUMPER = { x: 7.8, z: 55.6, halfX: 4, halfZ: 3.1 };

const NEON = [0xff4fa3, 0x4cf0ff, 0xffe14a, 0x7dff6a, 0xff8a3d] as const;

const frame = new Object3D();
frame.rotation.order = "YXZ";

/** Orient a geometry built along +Z by yaw/pitch (YXZ), then move it to `at`. */
function orient(
	geo: BufferGeometry,
	at: Vector3,
	yaw: number,
	pitch: number,
): BufferGeometry {
	frame.position.copy(at);
	frame.rotation.set(pitch, yaw, 0);
	frame.updateMatrix();
	geo.applyMatrix4(frame.matrix);
	return geo;
}

function pathBetween(points: [number, number][]): {
	geos: BufferGeometry[];
	line: Polyline;
} {
	const geos: BufferGeometry[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		const [ax, az] = points[i] as [number, number];
		const [bx, bz] = points[i + 1] as [number, number];
		const len = Math.hypot(bx - ax, bz - az);
		geos.push(
			box(
				3,
				0.06,
				len + 0.5,
				PAVEMENT,
				(ax + bx) / 2,
				0.1,
				(az + bz) / 2,
				Math.atan2(bx - ax, bz - az),
			),
		);
	}
	return {
		geos,
		line: new Polyline(
			points.map(([x, z]) => new Vector3(x, PATH_Y, z)),
			false,
		),
	};
}

function buildGate(ctx: BuildContext, signs: SignSpec[]): void {
	const parts: BufferGeometry[] = [
		box(1, 6, 1, 0xe8463c, -4.5, 0, GATE_Z),
		box(1, 6, 1, 0xe8463c, 4.5, 0, GATE_Z),
		box(10, 1.2, 1, 0xf2c94c, 0, 6, GATE_Z),
		box(8.4, 1.8, 0.3, 0x2b2b2b, 0, 7.2, GATE_Z),
		box(9.2, 0.14, 0.14, 0xff4fa3, 0, 9.1, GATE_Z + 0.15),
	];
	for (const x of [-4.5, 4.5]) {
		parts.push(
			glow(box(0.2, 5.6, 0.2, 0xffe14a, x, 0.2, GATE_Z + 0.6), GLOW.night),
		);
	}
	for (const [x, color] of [
		[-4.5, 0xff4fa3],
		[4.5, 0x4cf0ff],
	] as const) {
		parts.push(glow(box(0.6, 0.6, 0.6, color, x, 7, GATE_Z), GLOW.always));
	}
	ctx.statics.push(...parts);
	signs.push({
		label: "FUN PARK",
		width: 8,
		height: 1.5,
		position: [0, 8.1, GATE_Z + 0.2],
		ry: 0,
	});
}

function buildPaths(ctx: BuildContext): void {
	const routes: [number, number][][] = [
		[
			[0.5, 34.2],
			[0.5, 72.5],
		],
		[
			[0.5, 38.5],
			[-18, 38.5],
		],
		[
			[0.5, 41.5],
			[22.5, 41.5],
		],
		[
			[0.5, 48],
			[10.5, 48],
		],
		[
			[0.5, 61],
			[24, 61],
		],
		[
			[0.5, 66],
			[10.8, 66],
		],
	];
	for (const route of routes) {
		const { geos, line } = pathBetween(route);
		ctx.statics.push(...geos);
		ctx.sidewalks.push(line);
	}
	const lamps: [number, number][] = [
		[2.7, 45],
		[2.7, 53],
		[2.7, 63.5],
		[2.7, 69.5],
		[-1.9, 60],
		[-1.9, 46],
		[12.5, 43.8],
		[19, 43.8],
		[12, 63.8],
		[20, 63.8],
		[-10, 40.5],
		[-1.9, 36.5],
	];
	for (const [x, z] of lamps) {
		ctx.statics.push(place(lamp(), { x, y: PATH_Y, z }));
	}
	// Flower planters beside the gate.
	for (const x of [-7, -10.5]) {
		ctx.statics.push(
			box(3, 0.5, 1.2, 0x8a5a3c, x, 0.1, 36),
			box(2.8, 0.15, 1, ctx.rng.pick(BRIGHTS), x, 0.6, 36),
		);
	}
}

function buildCoaster(ctx: BuildContext): void {
	const curve = new CatmullRomCurve3(
		COASTER_POINTS.map(([x, y, z]) => new Vector3(x, y, z)),
		true,
		"centripetal",
	);
	const pts = curve.getPoints(SAMPLES).slice(0, SAMPLES);
	for (const p of pts) {
		p.x = Math.max(p.x, -25.5);
		p.z = Math.min(p.z, 83);
		p.y = Math.max(p.y, 1);
	}
	const track = new Polyline(pts, true);

	const up = new Vector3(0, 1, 0);
	const t = new Vector3();
	const side = new Vector3();
	const left: Vector3[] = [];
	const right: Vector3[] = [];
	for (let i = 0; i < pts.length; i++) {
		const p = pts[i] as Vector3;
		const next = pts[(i + 1) % pts.length] as Vector3;
		const prev = pts[(i + pts.length - 1) % pts.length] as Vector3;
		t.subVectors(next, prev).normalize();
		side.crossVectors(up, t).normalize();
		left.push(p.clone().addScaledVector(side, 0.45));
		right.push(p.clone().addScaledVector(side, -0.45));
	}
	for (const rail of [left, right]) {
		const tube = new TubeGeometry(
			new CatmullRomCurve3(rail, true),
			SAMPLES,
			0.12,
			6,
			true,
		);
		ctx.statics.push(paint(tube, 0x3b3b3b));
	}

	const at = new Vector3();
	const tn = new Vector3();
	let support = 0;
	for (let s = 0; s < track.length; s += 1) {
		track.pointAt(s, at);
		track.tangentAt(s, tn);
		const yaw = Math.atan2(tn.x, tn.z);
		const pitch = -Math.asin(tn.y);
		ctx.statics.push(
			orient(box(1.3, 0.1, 0.3, 0x8a5a3c, 0, -0.1, 0), at, yaw, pitch),
		);
		if (s % 4 < 1) {
			const h = at.y - 0.3;
			if (h > 1.5) {
				ctx.statics.push(
					cyl(0.15, 0.15, h, 6, 0x777777, at.x, 0.1, at.z),
					glow(
						box(
							0.1,
							h - 0.2,
							0.1,
							NEON[support++ % NEON.length] as number,
							at.x + 0.22,
							0.1,
							at.z,
						),
						GLOW.night,
					),
				);
			}
		}
	}

	let hMax = 0;
	for (const p of pts) hMax = Math.max(hMax, p.y);
	const liftTop = COASTER_POINTS[LIFT_TOP_INDEX] as [number, number, number];
	const liftEnd = track.nearestS(
		new Vector3(liftTop[0], liftTop[1], liftTop[2]),
	);

	const agent = new CoasterAgent(track, liftEnd, hMax);
	ctx.group.add(agent.pool.mesh);
	ctx.agents.push(agent);
}

function buildFerris(ctx: BuildContext): void {
	const group = new Group();
	group.position.set(FERRIS_CENTER.x, 0, FERRIS_CENTER.z);
	group.rotation.y = FERRIS_YAW;
	group.updateMatrix();

	const legAngle = (18 * Math.PI) / 180;
	const legLen = 10.5 / Math.cos(legAngle);
	const baseX = legLen * Math.sin(legAngle);
	const frameParts: BufferGeometry[] = [];
	for (const z of [-1.4, 1.4]) {
		for (const sign of [-1, 1]) {
			frameParts.push(
				place(box(0.6, legLen, 0.6, 0xc9ccd1, 0, 0, 0), {
					rz: sign * legAngle,
					x: sign * baseX,
					z,
				}),
			);
		}
	}
	frameParts.push(
		place(cyl(0.3, 0.3, 3.4, 8, 0x777777, 0, -1.7, 0), {
			rx: Math.PI / 2,
			y: 10,
		}),
	);
	const supports = merge(frameParts);
	supports.applyMatrix4(group.matrix);
	ctx.statics.push(supports);

	const wheelParts: BufferGeometry[] = [
		paint(new TorusGeometry(FERRIS_RADIUS, 0.25, 8, 36), 0xe8eaee),
		cyl(0.5, 0.5, 1.2, 8, 0xe8463c, 0, 0, 0),
	];
	wheelParts[1] = place(wheelParts[1] as BufferGeometry, {
		rx: Math.PI / 2,
		z: 0.6,
	});
	for (let i = 0; i < 12; i++) {
		wheelParts.push(
			place(box(0.15, FERRIS_RADIUS, 0.15, 0xf2c94c), {
				rz: (i * Math.PI) / 6,
			}),
		);
	}
	for (let i = 0; i < 24; i++) {
		const a = (i * Math.PI) / 12;
		wheelParts.push(
			glow(
				box(
					0.3,
					0.3,
					0.8,
					i % 2 === 0 ? 0xfff1c4 : (NEON[i % NEON.length] as number),
					Math.cos(a) * FERRIS_RADIUS,
					Math.sin(a) * FERRIS_RADIUS - 0.15,
					0,
				),
				GLOW.night,
			),
		);
	}
	const wheel = new Mesh(merge(wheelParts), MAT_STATIC);
	wheel.position.y = FERRIS_CENTER.y;
	wheel.castShadow = true;
	wheel.receiveShadow = true;
	group.add(wheel);
	ctx.group.add(group);

	const agent = new FerrisAgent(
		wheel,
		FERRIS_CENTER,
		FERRIS_YAW,
		FERRIS_RADIUS,
	);
	ctx.group.add(agent.pool.mesh);
	ctx.agents.push(agent);
}

function buildCarousel(ctx: BuildContext): void {
	const { x, z } = CAROUSEL_CENTER;
	const roof = paintBy(cone(5.6, 2.5, 16, WHITE, 0, 4.6), (px, _y, pz) =>
		Math.floor(((Math.atan2(pz, px) + Math.PI) / (Math.PI * 2)) * 16) % 2 === 0
			? 0xe8463c
			: WHITE,
	);
	ctx.statics.push(
		place(cyl(5, 5, 0.6, 16, 0xf2c94c), { x, y: 0.1, z }),
		place(cyl(0.25, 0.25, 4.5, 8, 0xe8eaee), { x, y: 0.7, z }),
		place(roof, { x, z }),
	);
	for (let i = 0; i < 16; i++) {
		const a = (i * Math.PI) / 8;
		ctx.statics.push(
			glow(
				box(
					0.25,
					0.25,
					0.25,
					i % 2 === 0 ? 0xfff1c4 : (NEON[i % NEON.length] as number),
					x + Math.cos(a) * 5.3,
					4.4,
					z + Math.sin(a) * 5.3,
				),
				GLOW.night,
			),
			glow(
				box(
					0.3,
					0.12,
					0.3,
					0xfff1c4,
					x + Math.cos(a) * 4.9,
					0.7,
					z + Math.sin(a) * 4.9,
				),
				GLOW.night,
			),
		);
	}
	const agent = new CarouselAgent(CAROUSEL_CENTER, 3.8);
	ctx.group.add(agent.pool.mesh);
	ctx.agents.push(agent);
}

interface Stall {
	x: number;
	z: number;
	label: string;
}

const STALLS: readonly Stall[] = [
	{ x: 7.5, z: 37.2, label: "BURGERS" },
	{ x: 11.5, z: 37.2, label: "PIZZA" },
	{ x: 15.5, z: 37.2, label: "TACOS" },
	{ x: 15, z: 56.8, label: "DONUTS" },
	{ x: 19, z: 56.8, label: "ICE CREAM" },
	{ x: 23, z: 56.8, label: "DRINKS" },
];

function buildStalls(ctx: BuildContext, signs: SignSpec[]): void {
	for (const [i, { x, z, label }] of STALLS.entries()) {
		const neon = NEON[i % NEON.length] as number;
		const awning = paintBy(prism(3.4, 0.8, 3, 0xe8463c), (px) =>
			Math.floor((px + 10) / 0.5) % 2 === 0 ? 0xe8463c : WHITE,
		);
		const parts: BufferGeometry[] = [
			box(3, 2.5, 2.5, WHITE, 0, 0.1, 0),
			place(awning, { y: 2.6 }),
			box(3.2, 0.2, 1, 0xf2c94c, 0, 1.1, 1.5),
			box(2.6, 0.7, 0.12, 0x111111, 0, 3.25, 1.35),
			glow(box(2.8, 0.1, 0.1, neon, 0, 4, 1.4), GLOW.always),
			glow(box(2.8, 0.1, 0.1, neon, 0, 3.15, 1.4), GLOW.always),
			glow(box(0.1, 0.9, 0.1, neon, -1.4, 3.15, 1.4), GLOW.always),
			glow(box(0.1, 0.9, 0.1, neon, 1.4, 3.15, 1.4), GLOW.always),
		];
		for (const lx of [-1.2, -0.4, 0.4, 1.2]) {
			parts.push(
				glow(box(0.12, 0.12, 0.12, 0xfff1c4, lx, 2.45, 1.55), GLOW.night),
			);
		}
		ctx.statics.push(place(merge(parts), { x, z }));
		signs.push({
			label,
			width: 2.4,
			height: 0.55,
			position: [x, 3.6, z + 1.42],
			ry: 0,
		});
	}
}

function personParts(shirt: number): BufferGeometry {
	return merge([
		box(0.4, 0.6, 0.25, shirt, 0, 0.7),
		box(0.26, 0.26, 0.26, 0xf1c9a5, 0, 1.3),
		box(0.14, 0.7, 0.2, 0x2b2b2b, -0.1, 0),
		box(0.14, 0.7, 0.2, 0x2b2b2b, 0.1, 0),
	]);
}

function buildQueues(ctx: BuildContext): void {
	const queues: {
		x: number;
		z: number;
		dx: number;
		dz: number;
		yaw: number;
	}[] = [
		{ x: -18, z: 38.5, dx: 0, dz: 0.9, yaw: 0 },
		{ x: 10, z: 66, dx: -0.9, dz: 0, yaw: Math.PI / 2 },
	];
	for (const q of queues) {
		for (let i = 0; i < 5; i++) {
			ctx.statics.push(
				place(personParts(ctx.rng.pick(SHIRTS)), {
					x: q.x + q.dx * i,
					y: 0.1,
					z: q.z + q.dz * i,
					ry: q.yaw,
				}),
			);
		}
	}
}

/** Square lattice mast with braced faces and glowing corner strips. */
function buildDropTower(ctx: BuildContext): void {
	const half = 1.15;
	const step = 3.5;
	const ang = Math.atan2(2 * half, step);
	const len = Math.hypot(2 * half, step);
	const steel = 0xd9dde2;
	const parts: BufferGeometry[] = [
		box(5.4, 0.3, 5.4, 0x6d7077, 0, 0.1, 0),
		box(3.8, 1.1, 3.8, 0xe8463c, 0, DROP_HEIGHT - 0.4, 0),
		prism(3.8, 1.2, 3.8, 0xf2c94c, 0, DROP_HEIGHT + 0.7, 0),
		glow(box(0.4, 0.4, 0.4, 0xff2b2b, 0, DROP_HEIGHT + 1.9, 0), GLOW.always),
	];
	for (const sx of [-1, 1]) {
		for (const sz of [-1, 1]) {
			parts.push(
				box(0.2, DROP_HEIGHT - 0.3, 0.2, steel, sx * half, 0.4, sz * half),
				glow(
					box(
						0.14,
						DROP_HEIGHT - 0.8,
						0.14,
						NEON[(sx + 1 + sz + 1) % NEON.length] as number,
						sx * (half + 0.12),
						0.6,
						sz * (half + 0.12),
					),
					GLOW.night,
				),
			);
		}
	}
	let dir = 1;
	for (let y = 0.4; y + step < DROP_HEIGHT - 0.3; y += step) {
		for (const s of [-1, 1]) {
			parts.push(
				box(2 * half, 0.1, 0.1, steel, 0, y, s * half),
				box(0.1, 0.1, 2 * half, steel, s * half, y, 0),
				place(box(0.09, len, 0.09, steel), {
					rz: -dir * ang,
					x: -half * dir,
					y,
					z: s * half,
				}),
				place(box(0.09, len, 0.09, steel), {
					rx: dir * ang,
					y,
					x: s * half,
					z: -half * dir,
				}),
			);
		}
		dir = -dir;
	}
	ctx.statics.push(place(merge(parts), { x: DROP_X, z: DROP_Z }));
	const agent = new DropTowerAgent(
		DROP_X,
		DROP_Z,
		0.1 + 1.9,
		0.1 + DROP_HEIGHT - 2.4,
	);
	ctx.group.add(agent.pool.mesh);
	ctx.agents.push(agent);
}

function buildSwing(ctx: BuildContext): void {
	const canopy = paintBy(cone(3.9, 1.7, 16, WHITE, 0, 11.65), (px, _y, pz) =>
		Math.floor(((Math.atan2(pz, px) + Math.PI) / (Math.PI * 2)) * 16) % 2 === 0
			? 0x3b7dd8
			: WHITE,
	);
	const parts: BufferGeometry[] = [
		cyl(2.6, 2.8, 0.5, 16, 0x777777, 0, 0.1, 0),
		cyl(0.5, 0.7, 11, 10, 0xe8eaee, 0, 0.6, 0),
		cyl(3.5, 3.5, 0.35, 16, 0xf2c94c, 0, 11.3, 0),
		canopy,
		glow(box(0.4, 0.4, 0.4, 0xff4fa3, 0, 13.4, 0), GLOW.always),
	];
	for (let i = 0; i < 16; i++) {
		const a = (i * Math.PI) / 8;
		parts.push(
			glow(
				box(
					0.25,
					0.25,
					0.25,
					i % 2 === 0 ? 0xfff1c4 : (NEON[i % NEON.length] as number),
					Math.cos(a) * 3.55,
					11.05,
					Math.sin(a) * 3.55,
				),
				GLOW.night,
			),
		);
	}
	ctx.statics.push(place(merge(parts), { x: SWING_X, z: SWING_Z }));
	const agent = new SwingAgent(SWING_X, SWING_Z, SWING_PIVOT_Y, 3.2);
	ctx.group.add(agent.pool.mesh);
	ctx.agents.push(agent);
}

function buildBumperCars(ctx: BuildContext, signs: SignSpec[]): void {
	const { x, z, halfX, halfZ } = BUMPER;
	const wall = 0.5;
	const parts: BufferGeometry[] = [
		box(2 * halfX, 0.05, 2 * halfZ, 0x3a3f5c, x, 0.1, z),
		box(2 * halfX + 0.4, wall, 0.2, 0xe8463c, x, 0.1, z - halfZ - 0.1),
		box(2 * halfX + 0.4, wall, 0.2, 0xe8463c, x, 0.1, z + halfZ + 0.1),
		box(0.2, wall, 2 * halfZ, 0xe8463c, x - halfX - 0.1, 0.1, z),
		box(0.2, wall, 2 * halfZ, 0xe8463c, x + halfX + 0.1, 0.1, z),
		box(0.1, 2.9, 0.1, 0x777777, x - 2.2, 0.1, z - halfZ),
		box(0.1, 2.9, 0.1, 0x777777, x + 2.2, 0.1, z - halfZ),
		box(5, 0.9, 0.1, 0x111111, x, 2.2, z - halfZ - 0.02),
	];
	const corners: [number, number][] = [
		[x - halfX, z - halfZ],
		[x + halfX, z - halfZ],
		[x - halfX, z + halfZ],
		[x + halfX, z + halfZ],
	];
	for (const [i, [cx, cz]] of corners.entries()) {
		parts.push(
			box(0.15, 2.3, 0.15, 0x777777, cx, 0.1, cz),
			glow(
				box(
					0.3,
					0.3,
					0.3,
					NEON[i % NEON.length] as number,
					cx - 0.15,
					2.4,
					cz - 0.15,
				),
				GLOW.night,
			),
		);
	}
	for (let i = 0; i < 8; i++) {
		parts.push(
			glow(
				box(0.14, 0.14, 0.14, 0xfff1c4, x - 3.5 + i, 0.62, z + halfZ + 0.1),
				GLOW.night,
			),
		);
	}
	ctx.statics.push(...parts);
	signs.push({
		label: "BUMPER CARS",
		width: 4.6,
		height: 0.7,
		position: [x, 2.65, z - halfZ + 0.06],
		ry: 0,
	});
	const agent = new BumperCarsAgent(
		ctx.rng,
		scaled(6, ctx.density),
		x,
		z,
		halfX - 0.8,
		halfZ - 0.7,
		0.15,
	);
	ctx.group.add(agent.pool.mesh);
	ctx.agents.push(agent);
}

function buildCrowd(ctx: BuildContext): void {
	const y = PATH_Y;
	const spots: CrowdSpot[] = [];
	const row = (x0: number, z0: number, x1: number, z1: number, n: number) => {
		for (let i = 0; i < n; i++) {
			const t = n === 1 ? 0 : i / (n - 1);
			spots.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, y });
		}
	};
	row(-16, 38.5, -6, 38.5, 9);
	row(3.5, 66, 6.5, 66, 4);
	row(16.5, 41.8, 21, 41.8, 5);
	row(-0.5, 69.5, 1.5, 71, 3);
	row(5, 60.4, 11, 60.4, 4);
	row(8, 47, 9.5, 49.3, 3);
	for (const s of STALLS) {
		spots.push(
			{ x: s.x - 0.8, z: s.z + 3.4, y },
			{ x: s.x + 0.9, z: s.z + 3.3, y },
		);
	}
	row(0, 36.5, 1, 69, 11);
	row(-3, 40.5, 4, 43.5, 4);
	createCrowd(ctx, spots, { count: 84, spread: 0.55 });
}

function buildTrees(ctx: BuildContext): void {
	const spots: [number, number][] = [
		[25, 46],
		[25, 52],
		[25, 64],
		[25, 72],
		[25, 78],
		[5.5, 82.5],
		[11, 82.5],
		[16.5, 82.5],
		[22, 82.5],
	];
	for (const [i, [x, z]] of spots.entries()) {
		const s = ctx.rng.range(0.9, 1.2);
		ctx.statics.push(
			place(i % 2 === 0 ? pine(s) : roundTree(s), { x, y: 0.1, z }),
		);
	}
}

export function buildThemePark(ctx: BuildContext): void {
	const signs: SignSpec[] = [];
	buildGate(ctx, signs);
	buildPaths(ctx);
	buildCoaster(ctx);
	buildFerris(ctx);
	buildCarousel(ctx);
	buildStalls(ctx, signs);
	buildDropTower(ctx);
	buildSwing(ctx);
	buildBumperCars(ctx, signs);
	buildQueues(ctx);
	buildCrowd(ctx);
	buildTrees(ctx);
	ctx.group.add(signMesh(signs));
}
