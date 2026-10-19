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
import { bench, lamp, pine, roundTree } from "../prefabs";
import { mulberry32, type Rng, WORLD_SEED } from "../rng";
import { scaled } from "../sim/agent";
import { type CrowdSpot, createCrowd } from "../sim/crowd";
import { chamfer, Polyline } from "../sim/path";
import {
	BumperCarsAgent,
	CarouselAgent,
	CoasterAgent,
	DropTowerAgent,
	FerrisAgent,
	LogFlumeAgent,
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

function pathBetween(
	points: [number, number][],
	width = 3,
): {
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
				width,
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
		[10.5, 75.3],
		[16, 75.3],
		[18.4, 66],
		[-5, 51.4],
		[-2.6, 40.8],
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
	{ x: 6.2, z: 44.4, label: "POPCORN" },
	{ x: 23.8, z: 44.8, label: "CANDY" },
	{ x: 23.8, z: 50.3, label: "HOT DOGS" },
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

/** Posts every ~1.1 m plus a rail between two points (grass height). */
function fenceRun(
	ctx: BuildContext,
	x0: number,
	z0: number,
	x1: number,
	z1: number,
	hex = 0x2b2b2b,
	h = 0.9,
): void {
	const len = Math.hypot(x1 - x0, z1 - z0);
	const n = Math.max(1, Math.round(len / 1.1));
	for (let i = 0; i <= n; i++) {
		const t = i / n;
		ctx.statics.push(
			box(0.1, h, 0.1, hex, x0 + (x1 - x0) * t, 0.1, z0 + (z1 - z0) * t),
		);
	}
	ctx.statics.push(
		box(
			0.06,
			0.06,
			len,
			hex,
			(x0 + x1) / 2,
			0.1 + h * 0.8,
			(z0 + z1) / 2,
			Math.atan2(x1 - x0, z1 - z0),
		),
	);
}

/** Walkways to the new attractions; they join the pedestrian network. */
function buildExtraPaths(ctx: BuildContext): void {
	const routes: [number, number][][] = [
		[
			[0.5, 72.5],
			[4.2, 72.5],
			[4.2, 76.4],
			[19.1, 76.4],
			[19.1, 62.6],
		],
		[
			[0.5, 50.2],
			[-13, 50.2],
		],
		[
			[-2.2, 41.4],
			[-2.2, 46.6],
		],
	];
	for (const route of routes) {
		const { geos, line } = pathBetween(route, 2);
		ctx.statics.push(...geos);
		ctx.sidewalks.push(line);
	}
}

/** Closed water-line centreline of the log flume (x, y, z): lift on the west side, plunge on the east. */
const FLUME_POINTS: [number, number, number][] = [
	[-19, 0.7, 54],
	[-19, 6, 66],
	[-19, 6, 71],
	[-17, 6, 73],
	[-14, 6, 73],
	[-12, 6, 71],
	[-12, 6, 68],
	[-12, 0.7, 57],
	[-12, 0.7, 54],
	[-14, 0.7, 52],
	[-17.5, 0.7, 52],
];

/** Log flume inside the coaster loop: timber trough on stilts, a lift hill, a plunge and a station. */
function buildFlume(ctx: BuildContext, signs: SignSpec[], rnd: Rng): void {
	const track = new Polyline(
		chamfer(
			FLUME_POINTS.map(([x, y, z]) => new Vector3(x, y, z)),
			1.3,
		),
		true,
	);
	const at = new Vector3();
	const tn = new Vector3();
	let i = 0;
	for (let s = 0; s < track.length; s += 1, i++) {
		track.pointAt(s, at);
		track.tangentAt(s, tn);
		const yaw = Math.atan2(tn.x, tn.z);
		const pitch = -Math.asin(tn.y);
		const rim = i % 2 === 0 ? 0xe8463c : 0xf2efe6;
		const piece: BufferGeometry[] = [
			box(2.36, 0.16, 1.2, 0x7a5230, 0, -0.46, 0),
			box(2.0, 0.1, 1.2, 0x4fb3e8, 0, -0.32, 0),
			box(0.16, 0.8, 1.2, 0xa9733f, -1.1, -0.46, 0),
			box(0.16, 0.8, 1.2, 0xa9733f, 1.1, -0.46, 0),
			box(0.34, 0.07, 1.2, rim, -1.1, 0.34, 0),
			box(0.34, 0.07, 1.2, rim, 1.1, 0.34, 0),
		];
		if (i % 3 === 0) {
			const neon = NEON[(i / 3) % NEON.length] as number;
			piece.push(
				glow(box(0.14, 0.14, 0.14, neon, -1.1, 0.42, 0), GLOW.night),
				glow(box(0.14, 0.14, 0.14, neon, 1.1, 0.42, 0), GLOW.night),
			);
		}
		ctx.statics.push(orient(merge(piece), at, yaw, pitch));
		if (i % 3 === 1 && at.y > 1.6) {
			ctx.statics.push(
				cyl(0.16, 0.16, at.y - 0.64, 6, 0xb8bcc2, at.x, 0.1, at.z),
				orient(box(2.9, 0.14, 0.3, 0x8a5a3c, 0, -0.66, 0), at, yaw, pitch),
			);
		}
	}

	// Splash-down foam where the plunge meets the flat run.
	for (const [dx, z] of [
		[-0.5, 55.6],
		[0.4, 56.4],
		[-0.3, 57.4],
		[0.5, 58.2],
	] as const) {
		ctx.statics.push(
			box(0.8, 0.3, 0.8, WHITE, -12 + dx, 0.46, z + rnd.range(-0.2, 0.2)),
		);
	}

	// Station on the north side of the bottom run.
	const queue: BufferGeometry[] = [];
	for (const x of [-17.6, -16.5, -15.4, -14.3]) {
		queue.push(
			place(personParts(rnd.pick(SHIRTS)), {
				x,
				y: 0.45,
				z: 50.2,
				ry: Math.PI,
			}),
		);
	}
	ctx.statics.push(
		box(6.4, 0.35, 1.2, 0xd6cfc4, -16, 0.1, 50.2),
		box(6.6, 0.22, 2.2, 0xe8463c, -16, 3.2, 50.2),
		box(4.4, 0.8, 0.12, 0x111111, -16, 3.5, 51.2),
		glow(box(4.6, 0.1, 0.1, 0xffe14a, -16, 3.35, 51.3), GLOW.always),
		glow(box(4.6, 0.1, 0.1, 0xffe14a, -16, 4.35, 51.3), GLOW.always),
		...queue,
	);
	for (const x of [-19, -13]) {
		for (const z of [49.8, 50.85]) {
			ctx.statics.push(box(0.15, 3.1, 0.15, 0x8a8a8a, x, 0.1, z));
		}
	}
	signs.push({
		label: "LOG FLUME",
		width: 4,
		height: 0.6,
		position: [-16, 3.9, 51.28],
		ry: 0,
	});

	const agent = new LogFlumeAgent(track, scaled(4, ctx.density));
	ctx.group.add(agent.pool.mesh);
	ctx.agents.push(agent);
}

/** Haunted house on the east edge, door facing west; graveyard to its south. */
function buildHaunted(ctx: BuildContext, signs: SignSpec[]): void {
	const stone = 0x6d6483;
	const dark = 0x2f2b3a;
	const GHOST = 0xb6ff6a;
	const parts: BufferGeometry[] = [
		box(8.3, 0.3, 4.3, 0x3a3548, 0, 0, 0),
		box(7.6, 4.2, 3.8, stone, 0, 0.3, 0),
		prism(8, 2.4, 4.2, dark, 0, 4.5, 0),
		box(2.2, 6.4, 2.2, 0x4a4160, -2.7, 0.3, -1.3),
		cone(1.75, 2.4, 6, dark, -2.7, 6.7, -1.3),
		cyl(0.03, 0.03, 1.2, 4, 0x333333, -2.7, 9, -1.3),
		box(0.7, 2.2, 0.7, 0x4a4160, 2.3, 4.5, 0.2),
		// Porch, door and the lantern ghost.
		box(2.4, 0.2, 1.2, 0x3a3548, 0.5, 0.3, 2.5),
		box(2.6, 0.15, 1.4, dark, 0.5, 2.85, 2.5),
		cyl(0.07, 0.07, 2.35, 5, 0x2b2b2b, -0.6, 0.5, 3),
		cyl(0.07, 0.07, 2.35, 5, 0x2b2b2b, 1.6, 0.5, 3),
		box(1.1, 2, 0.1, 0x1f1a24, 0.5, 0.5, 1.95),
		glow(box(0.5, 0.9, 0.35, 0xf4f4f4, 1.5, 0.5, 2.7), GLOW.night),
		glow(box(0.4, 0.32, 0.4, 0xf28c28, -0.5, 0.5, 2.9), GLOW.night),
		glow(box(0.4, 0.32, 0.4, 0xf28c28, 0.1, 0.5, 2.9), GLOW.night),
		// Windows: front, the camera-facing back wall, tower and end wall.
		glow(box(0.8, 1.1, 0.1, GHOST, -1.7, 1.2, 1.95), GLOW.always),
		glow(box(0.8, 1.1, 0.1, GHOST, 2.7, 1.2, 1.95), GLOW.always),
		glow(box(0.7, 0.9, 0.1, 0xffd27a, -2.7, 3, -2.45), GLOW.always),
		glow(box(0.7, 0.9, 0.1, GHOST, -2.7, 5.2, -2.45), GLOW.always),
		glow(box(0.1, 1, 0.8, GHOST, 3.85, 1, 0.8), GLOW.always),
		glow(box(0.1, 1, 0.8, 0xffd27a, 3.85, 1, -0.8), GLOW.always),
		glow(box(0.1, 1, 0.8, GHOST, 3.85, 2.8, 0), GLOW.always),
	];
	for (const x of [-0.2, 1.5, 3.1]) {
		for (const y of [1.1, 2.7]) {
			parts.push(
				glow(
					box(0.7, 1, 0.1, (x + y) % 2 < 1 ? GHOST : 0xffd27a, x, y, -1.95),
					GLOW.always,
				),
			);
		}
	}
	ctx.statics.push(
		place(merge(parts), { x: 23.2, y: 0.1, z: 69.5, ry: -Math.PI / 2 }),
	);
	signs.push({
		label: "HAUNTED HOUSE",
		width: 3.4,
		height: 0.55,
		position: [23.2, 3.6, 73.37],
		ry: 0,
	});

	// Graveyard with an iron fence, stones and a dead tree.
	fenceRun(ctx, 20.3, 74.1, 25.2, 74.1);
	fenceRun(ctx, 25.2, 74.1, 25.2, 77.3);
	fenceRun(ctx, 25.2, 77.3, 20.3, 77.3);
	fenceRun(ctx, 20.3, 77.3, 20.3, 74.1);
	for (const [x, z] of [
		[21.4, 75],
		[22.9, 74.8],
		[24.3, 75.1],
		[21.8, 76.6],
		[23.4, 76.5],
		[24.6, 76.7],
	] as const) {
		ctx.statics.push(
			box(0.55, 0.8, 0.16, 0x9a9aa0, x, 0.1, z),
			box(0.65, 0.12, 0.22, 0x82828a, x, 0.9, z),
		);
	}
	ctx.statics.push(
		cyl(0.1, 0.2, 2.2, 5, 0x3a2f2a, 21, 0.1, 76.9),
		place(box(0.1, 1.1, 0.1, 0x3a2f2a), { rz: 0.8, x: 21.2, y: 1.9, z: 76.9 }),
		place(box(0.1, 0.9, 0.1, 0x3a2f2a), { rz: -0.7, x: 20.8, y: 1.7, z: 76.9 }),
		glow(box(0.3, 0.3, 0.3, GHOST, 23.8, 0.1, 75.9), GLOW.night),
	);
}

interface HallSpec {
	cx: number;
	cz: number;
	/** Local width (across the front) and depth. */
	w: number;
	d: number;
	h: number;
	/** 0: front faces +Z, PI/2: front faces +X (both visible from the camera). */
	ry: number;
	wall: number;
	accent: number;
	label: string;
	roof: "pac" | "dice" | "none";
}

/** Neon amusement hall: glowing screen windows, a marquee, a roof gimmick and a back door. */
function buildHall(ctx: BuildContext, signs: SignSpec[], s: HallSpec): void {
	const { w, d, h, wall, accent } = s;
	const front = d / 2;
	const parts: BufferGeometry[] = [
		box(w, h, d, wall, 0, 0.1, 0),
		box(w + 0.4, 0.25, d + 0.4, 0x30344a, 0, h + 0.1, 0),
		box(w - 0.5, 1, 0.1, 0x111111, 0, h - 1.15, front + 0.05),
		glow(box(w - 0.5, 0.08, 0.1, accent, 0, h - 0.2, front + 0.1), GLOW.always),
		glow(
			box(w - 0.5, 0.08, 0.1, accent, 0, h - 1.25, front + 0.1),
			GLOW.always,
		),
		box(1.2, 2.1, 0.1, 0x1f1a24, 0, 0.1, -front - 0.05),
		glow(
			box(0.1, h - 0.4, 0.1, accent, w / 2 + 0.03, 0.3, front - 0.1),
			GLOW.always,
		),
		glow(
			box(0.1, h - 0.4, 0.1, accent, -w / 2 - 0.03, 0.3, front - 0.1),
			GLOW.always,
		),
	];
	const n = Math.max(2, Math.floor((w - 1.5) / 2.2));
	for (let k = 0; k < n; k++) {
		const x = -((n - 1) * 2.2) / 2 + k * 2.2;
		parts.push(
			box(1.5, 1.1, 0.1, 0x111111, x, 0.5, front + 0.05),
			glow(
				box(
					1.3,
					0.9,
					0.1,
					NEON[(k + 1) % NEON.length] as number,
					x,
					0.6,
					front + 0.1,
				),
				GLOW.always,
			),
		);
	}
	for (let k = 0; k < 8; k++) {
		parts.push(
			glow(
				box(
					0.12,
					0.12,
					0.12,
					0xfff1c4,
					-(w - 1) / 2 + (k * (w - 1)) / 7,
					h - 0.08,
					front + 0.16,
				),
				GLOW.night,
			),
		);
	}
	if (s.roof === "pac") {
		parts.push(
			place(cyl(0.9, 0.9, 0.3, 12, 0xffe14a), {
				rx: Math.PI / 2,
				x: -w / 4,
				y: h + 1.5,
				z: front - 0.5,
			}),
			box(0.9, 1, 0.3, 0xff4fa3, w / 6, h + 0.35, front - 0.65),
			glow(
				box(0.22, 0.22, 0.1, WHITE, w / 6 - 0.2, h + 1.0, front - 0.45),
				GLOW.always,
			),
			glow(
				box(0.22, 0.22, 0.1, WHITE, w / 6 + 0.2, h + 1.0, front - 0.45),
				GLOW.always,
			),
		);
		for (let k = 0; k < 3; k++) {
			parts.push(
				glow(
					box(
						0.2,
						0.2,
						0.1,
						0xffe14a,
						-w / 4 + 1.5 + k * 0.45,
						h + 0.9,
						front - 0.5,
					),
					GLOW.always,
				),
			);
		}
	} else if (s.roof === "dice") {
		parts.push(
			place(box(1.1, 1.1, 1.1, WHITE), {
				ry: 0.6,
				x: -w / 4,
				y: h + 0.35,
				z: front - 0.9,
			}),
			place(box(1.1, 1.1, 1.1, 0xe8463c), {
				ry: -0.4,
				x: w / 5,
				y: h + 0.35,
				z: front - 1,
			}),
			cyl(0.5, 0.5, 0.2, 10, 0x4cf0ff, w / 3.2, h + 0.35, front - 0.3),
		);
	}
	ctx.statics.push(place(merge(parts), { x: s.cx, y: 0, z: s.cz, ry: s.ry }));
	const c = Math.cos(s.ry);
	const sn = Math.sin(s.ry);
	const lz = front + 0.08;
	signs.push({
		label: s.label,
		width: Math.min(w - 0.9, 4.2),
		height: 0.7,
		position: [s.cx + lz * sn, h - 0.65, s.cz + lz * c],
		ry: s.ry,
	});
}

function buildHalls(ctx: BuildContext, signs: SignSpec[]): void {
	buildHall(ctx, signs, {
		cx: 10.1,
		cz: 79.3,
		w: 8.2,
		d: 3.4,
		h: 3.6,
		ry: 0,
		wall: 0x5a6bd6,
		accent: 0xff4fa3,
		label: "ARCADE",
		roof: "pac",
	});
	buildHall(ctx, signs, {
		cx: 19.8,
		cz: 79.3,
		w: 9.2,
		d: 3.4,
		h: 3.6,
		ry: 0,
		wall: 0x8a5ad6,
		accent: 0x4cf0ff,
		label: "GAME ZONE",
		roof: "dice",
	});
	// Prize hall by the main path: its front faces east onto the walkway.
	buildHall(ctx, signs, {
		cx: -5.85,
		cz: 44,
		w: 4.8,
		d: 5.3,
		h: 3.4,
		ry: Math.PI / 2,
		wall: 0xd6955a,
		accent: 0xffe14a,
		label: "PRIZES",
		roof: "none",
	});
}

/** Three-hole mini-golf course west of the Ferris wheel. */
function buildMiniGolf(ctx: BuildContext, signs: SignSpec[], rnd: Rng): void {
	const cx = 7.7;
	const felt = [0x3fa34d, 0x5cc06a, 0x2f9a46];
	const rail = 0x8a5a3c;
	const zs = [69.2, 71.7, 74.2];
	for (const [i, zc] of zs.entries()) {
		const hx = cx + (i % 2 === 0 ? 1.4 : -1.4);
		ctx.statics.push(
			box(4.4, 0.06, 2.2, felt[i] as number, cx, 0.1, zc),
			box(4.6, 0.22, 0.14, rail, cx, 0.1, zc - 1.14),
			box(4.6, 0.22, 0.14, rail, cx, 0.1, zc + 1.14),
			box(0.14, 0.22, 2.2, rail, cx - 2.27, 0.1, zc),
			box(0.14, 0.22, 2.2, rail, cx + 2.27, 0.1, zc),
			cyl(0.14, 0.14, 0.03, 8, 0x111111, hx, 0.15, zc),
			cyl(0.02, 0.02, 1, 4, WHITE, hx, 0.16, zc),
			box(0.3, 0.16, 0.02, 0xe8463c, hx + 0.16, 0.95, zc),
			box(0.5, 0.02, 0.4, 0x3b7dd8, cx - (hx - cx), 0.16, zc),
		);
	}
	ctx.statics.push(
		// Hole 1: windmill.
		box(0.7, 0.7, 0.7, 0xf6e7d8, cx - 0.2, 0.16, zs[0] as number),
		prism(0.9, 0.5, 0.9, 0xb5544a, cx - 0.2, 0.86, zs[0] as number),
		box(1.5, 0.08, 0.05, WHITE, cx - 0.2, 0.55, (zs[0] as number) + 0.4),
		box(0.08, 1.5, 0.05, WHITE, cx - 0.2, 0.5, (zs[0] as number) + 0.4),
		// Hole 2: grassy hump.
		box(1.4, 0.3, 0.9, 0x2a8a3d, cx, 0.16, zs[1] as number),
		box(0.8, 0.3, 0.5, 0x2a8a3d, cx, 0.46, zs[1] as number),
		// Hole 3: castle.
		box(0.9, 0.7, 0.9, 0xd0d0d0, cx + 0.2, 0.16, zs[2] as number),
		cyl(0.22, 0.22, 1, 6, 0xb8bcc2, cx - 0.4, 0.16, (zs[2] as number) - 0.35),
		cyl(0.22, 0.22, 1, 6, 0xb8bcc2, cx - 0.4, 0.16, (zs[2] as number) + 0.35),
		cone(0.3, 0.4, 6, 0xe8463c, cx - 0.4, 1.16, (zs[2] as number) - 0.35),
		cone(0.3, 0.4, 6, 0xe8463c, cx - 0.4, 1.16, (zs[2] as number) + 0.35),
		// Entrance board.
		box(0.12, 1.4, 0.12, 0x8a8a8a, cx - 1.3, 0.1, 67.9),
		box(0.12, 1.4, 0.12, 0x8a8a8a, cx + 1.3, 0.1, 67.9),
		box(2.8, 0.6, 0.1, 0x111111, cx, 1.3, 67.9),
		glow(box(2.9, 0.08, 0.1, rnd.pick(NEON), cx, 1.25, 67.92), GLOW.always),
		glow(box(2.9, 0.08, 0.1, rnd.pick(NEON), cx, 1.92, 67.92), GLOW.always),
	);
	signs.push({
		label: "MINI GOLF",
		width: 2.6,
		height: 0.5,
		position: [cx, 1.6, 67.97],
		ry: 0,
	});
}

function ticketBooth(ctx: BuildContext, x: number, z: number): void {
	ctx.statics.push(
		box(1.2, 2.1, 1.4, 0xe8463c, x, 0.1, z),
		box(1.6, 0.2, 1.8, 0xf2c94c, x, 2.2, z),
		glow(box(0.9, 0.6, 0.1, 0xfff1c4, x, 1.1, z + 0.72), GLOW.always),
		box(1.0, 0.12, 0.5, 0xf2c94c, x, 0.95, z + 0.9),
	);
}

function cart(
	ctx: BuildContext,
	x: number,
	z: number,
	body: number,
	canopy: number,
): void {
	const parts: BufferGeometry[] = [
		box(1.6, 0.9, 1, body, 0, 0.3, 0),
		box(1.7, 0.1, 1.1, WHITE, 0, 1.2, 0),
		cyl(0.03, 0.03, 1.5, 5, 0xeeeeee, 0.6, 1.3, 0),
		cone(1.1, 0.45, 8, canopy, 0.6, 2.7),
		glow(box(0.5, 0.2, 0.1, 0xffe14a, 0, 0.8, 0.52), GLOW.always),
	];
	for (const wx of [-0.55, 0.55]) {
		parts.push(
			place(cyl(0.25, 0.25, 0.1, 8, 0x222222), {
				rz: Math.PI / 2,
				x: wx,
				y: 0.45,
				z: 0.55,
			}),
		);
	}
	ctx.statics.push(place(merge(parts), { x, y: 0.1, z }));
}

/** Benches, flower beds, carts and ticket booths that fill the gaps between rides. */
function buildFurniture(ctx: BuildContext, rnd: Rng): void {
	const benches: [number, number, number][] = [
		[-1.95, 52, Math.PI / 2],
		[-1.95, 57, Math.PI / 2],
		[-1.95, 64.5, Math.PI / 2],
		[3, 44, -Math.PI / 2],
		[3, 57.2, -Math.PI / 2],
		[13.5, 63.6, Math.PI],
		[16.3, 63.6, Math.PI],
		[22.5, 63.6, Math.PI],
		[12.4, 75.1, 0],
		[16.6, 75.1, 0],
	];
	for (const [x, z, ry] of benches) {
		ctx.statics.push(place(bench(), { x, y: 0.1, z, ry }));
	}
	for (const x of [13.4, 16.4, 19.4]) {
		ctx.statics.push(
			box(2.2, 0.4, 0.9, 0x8a5a3c, x, 0.1, 54.3),
			box(2, 0.14, 0.7, rnd.pick(BRIGHTS), x, 0.5, 54.3),
		);
	}
	// Planters between the benches along the main path's west edge.
	for (const z of [54.5, 59.8, 61.9, 67.5]) {
		ctx.statics.push(
			box(0.7, 0.4, 2, 0x8a5a3c, -3.2, 0.1, z),
			box(0.55, 0.14, 1.85, rnd.pick(BRIGHTS), -3.2, 0.5, z),
		);
	}
	cart(ctx, 5.4, 63.5, 0xf29e6b, 0xff4fa3);
	cart(ctx, 8.2, 63.5, 0x58c27a, 0xf2c94c);
	ticketBooth(ctx, -3.3, 36.3);
	ticketBooth(ctx, 3.3, 36.3);
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
	// New attractions: arcade fronts, haunted-house porch, mini golf, flume queue, walkways.
	row(7, 76.4, 13, 76.4, 5);
	row(16, 76.4, 18.5, 76.4, 3);
	row(19.1, 64, 19.1, 75, 6);
	spots.push(
		{ x: 20.6, z: 69, y: 0.1 },
		{ x: 20.5, z: 70.2, y: 0.1 },
		{ x: 20.4, z: 71.4, y: 0.1 },
	);
	for (const [x, z] of [
		[6.4, 68.8],
		[8.9, 70.5],
		[6.8, 73],
		[9, 74.6],
	] as const) {
		spots.push({ x, z, y: 0.16 });
	}
	for (const x of [-17.4, -16.3, -15.2, -14.1])
		spots.push({ x, z: 50.2, y: 0.45 });
	row(-1, 49.6, -9, 49.6, 5);
	row(-2.2, 42, -2.2, 46, 3);
	row(-3.3, 38.3, 3.3, 38.3, 4);
	row(5, 62.6, 9, 62.6, 3);
	row(12, 62.7, 19, 62.7, 3);
	createCrowd(ctx, spots, { count: 156, spread: 0.55 });
}

function buildTrees(ctx: BuildContext, rnd: Rng): void {
	const spots: [number, number, number][] = [
		// East and south edges (clear of the haunted house, graveyard and halls).
		[25.1, 42.1, 0.8],
		[25.1, 63.4, 1],
		[4.8, 82.5, 1],
		[14.7, 82.5, 0.8],
		[25, 82.5, 1],
		// Around the coaster loop and flume.
		[-22, 55, 0.75],
		[-22, 59.5, 0.75],
		[-22, 64, 0.75],
		[-22, 68.5, 0.75],
		[-9.3, 57.5, 0.8],
		[-9.3, 61, 0.8],
		[-9.3, 64.5, 0.8],
		[-9.3, 68, 0.8],
		[-21.5, 48.5, 0.9],
		[-18, 47.6, 0.9],
		[-18.5, 76.2, 1],
		[-15.2, 76.7, 1],
		[-12.8, 76.2, 0.9],
		// Gate, prize hall and popcorn corner.
		[-14.2, 36, 1],
		[-10.6, 42.5, 1],
		[8.9, 44.2, 0.7],
		[-6.2, 48.4, 0.8],
	];
	for (const [i, [x, z, k]] of spots.entries()) {
		const s = k * rnd.range(0.95, 1.15);
		ctx.statics.push(
			place(i % 2 === 0 ? pine(s) : roundTree(s), { x, y: 0.1, z }),
		);
	}
}

export function buildThemePark(ctx: BuildContext): void {
	// Own stream so the extra detail never shifts the shared rng other districts draw from.
	const rnd = mulberry32(WORLD_SEED ^ 0x7a1e);
	const signs: SignSpec[] = [];
	buildGate(ctx, signs);
	buildPaths(ctx);
	buildExtraPaths(ctx);
	buildCoaster(ctx);
	buildFerris(ctx);
	buildCarousel(ctx);
	buildStalls(ctx, signs);
	buildDropTower(ctx);
	buildSwing(ctx);
	buildBumperCars(ctx, signs);
	buildFlume(ctx, signs, rnd);
	buildHaunted(ctx, signs);
	buildHalls(ctx, signs);
	buildMiniGolf(ctx, signs, rnd);
	buildFurniture(ctx, rnd);
	buildQueues(ctx);
	buildCrowd(ctx);
	buildTrees(ctx, rnd);
	ctx.group.add(signMesh(signs));
}
