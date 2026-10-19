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
	MAT_STATIC,
	merge,
	paint,
	paintBy,
	place,
	prism,
} from "../geometry";
import { PAVEMENT, SHIRTS, WHITE } from "../palette";
import { pine, roundTree } from "../prefabs";
import { Polyline } from "../sim/path";
import { CarouselAgent, CoasterAgent, FerrisAgent } from "../sim/rides";
import type { BuildContext } from "./context";
import { signMesh } from "./signs";

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

function buildGate(ctx: BuildContext): void {
	ctx.statics.push(
		box(1, 6, 1, 0xe8463c, -4.5, 0, GATE_Z),
		box(1, 6, 1, 0xe8463c, 4.5, 0, GATE_Z),
		box(10, 1.2, 1, 0xf2c94c, 0, 6, GATE_Z),
		box(8.4, 1.8, 0.3, 0x2b2b2b, 0, 7.2, GATE_Z),
	);
	ctx.group.add(
		signMesh([
			{
				label: "FUN PARK",
				width: 8,
				height: 1.5,
				position: [0, 8.1, GATE_Z + 0.2],
				ry: 0,
			},
		]),
	);
}

function buildPaths(ctx: BuildContext): void {
	const start: [number, number] = [0, 34.2];
	const routes: [number, number][][] = [
		[start, [-18, 38]],
		[start, [11, 47]],
		[start, [2, 62], [10, 66]],
	];
	for (const route of routes) {
		const { geos, line } = pathBetween(route);
		ctx.statics.push(...geos);
		ctx.sidewalks.push(line);
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
			if (h > 1.5)
				ctx.statics.push(cyl(0.15, 0.15, h, 6, 0x777777, at.x, 0.1, at.z));
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
	const agent = new CarouselAgent(CAROUSEL_CENTER, 3.8);
	ctx.group.add(agent.pool.mesh);
	ctx.agents.push(agent);
}

function buildStalls(ctx: BuildContext): void {
	const spots: [number, number][] = [
		[6, 44],
		[-2, 50],
		[8, 58],
	];
	for (const [x, z] of spots) {
		const awning = paintBy(prism(3.4, 0.8, 3, 0xe8463c), (px) =>
			Math.floor((px + 10) / 0.5) % 2 === 0 ? 0xe8463c : WHITE,
		);
		ctx.statics.push(
			box(3, 2.5, 2.5, WHITE, x, 0.1, z),
			place(awning, { x, y: 2.6, z }),
			box(3.2, 0.2, 1, 0xf2c94c, x, 1.1, z + 1.5),
		);
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

function buildTrees(ctx: BuildContext): void {
	const spots: [number, number][] = [
		[25.5, 40],
		[25.5, 52],
		[25.5, 64],
		[25.5, 76],
		[-10, 82.5],
		[0, 82.5],
		[10, 82.5],
		[20, 82.5],
	];
	for (const [i, [x, z]] of spots.entries()) {
		const s = ctx.rng.range(0.9, 1.2);
		ctx.statics.push(
			place(i % 2 === 0 ? pine(s) : roundTree(s), { x, y: 0.1, z }),
		);
	}
}

export function buildThemePark(ctx: BuildContext): void {
	buildGate(ctx);
	buildPaths(ctx);
	buildCoaster(ctx);
	buildFerris(ctx);
	buildCarousel(ctx);
	buildStalls(ctx);
	buildQueues(ctx);
	buildTrees(ctx);
}
