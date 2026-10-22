import { Group, Material, Mesh, Texture } from "three";
import { BuildingRegistry } from "../disasters/buildings";
import { DisasterDirector } from "../disasters/director";
import { DISASTER_KINDS, DISASTER_PRESETS } from "../disasters/presets";
import { CityEvents } from "../events";
import { MAT_STATIC, merge } from "../geometry";
import { facadeMaterial } from "../kit/facade";
import type { Rng } from "../rng";
import type { Agent } from "../sim/agent";
import { createOutskirtTraffic } from "../sim/outskirt-traffic";
import { createPeople } from "../sim/people";
import { createSkyTraffic } from "../sim/sky";
import { createTraffic } from "../sim/traffic";
import { buildArena } from "./arena";
import { buildBeach } from "./beach";
import { buildClouds } from "./clouds";
import { buildCommercial } from "./commercial";
import type { BuildContext } from "./context";
import { buildDowntown } from "./downtown";
import { buildGround } from "./ground";
import { buildHospital } from "./hospital";
import { buildMountains } from "./mountains";
import { buildOcean } from "./ocean";
import { buildOutskirtsNorth } from "./out-north";
import { buildOutskirtsSouth } from "./out-south";
import { buildOutskirtsEast, buildOutskirtsWest } from "./out-urban";
import { buildOutskirts } from "./outskirts";
import { buildPark } from "./park";
import { buildResidential } from "./residential";
import { buildRoads } from "./roads";
import { buildRural } from "./rural";
import { buildThemePark } from "./themepark";

export interface BuiltWorld {
	group: Group;
	/** Effects that stay put while the island itself is animated (disasters). */
	fx: Group;
	agents: Agent[];
	events: CityEvents;
	disasters: DisasterDirector;
	dispose(): void;
}

export function buildWorld(rng: Rng, density: number): BuiltWorld {
	const group = new Group();
	const ctx: BuildContext = {
		rng,
		density,
		statics: [],
		facades: [],
		group,
		agents: [],
		events: new CityEvents(),
		buildings: new BuildingRegistry(),
		sidewalks: [],
		residentialDoors: [],
		residentialLoop: null,
		parkLoop: null,
	};

	buildOutskirts(ctx);
	buildOutskirtsWest(ctx);
	buildOutskirtsNorth(ctx);
	buildOutskirtsEast(ctx);
	buildOutskirtsSouth(ctx);
	buildGround(ctx);
	buildRoads(ctx);
	buildDowntown(ctx);
	buildCommercial(ctx);
	buildResidential(ctx);
	buildBeach(ctx);
	buildThemePark(ctx);
	buildRural(ctx);
	buildMountains(ctx);
	buildArena(ctx);
	buildHospital(ctx);
	buildPark(ctx);
	buildOcean(ctx);
	buildClouds(ctx);

	// Shared pools read what the district builders registered.
	createTraffic(ctx);
	createPeople(ctx);
	createSkyTraffic(ctx);
	createOutskirtTraffic(ctx);

	// Vertex ranges must be taken before merge() disposes the inputs.
	const index = ctx.buildings.resolve(ctx.statics, ctx.facades);
	const staticMesh = new Mesh(merge(ctx.statics), MAT_STATIC);
	staticMesh.castShadow = true;
	staticMesh.receiveShadow = true;
	group.add(staticMesh);
	let facadesMesh: Mesh | null = null;
	if (ctx.facades.length > 0) {
		facadesMesh = new Mesh(merge(ctx.facades), facadeMaterial());
		facadesMesh.castShadow = true;
		facadesMesh.receiveShadow = true;
		group.add(facadesMesh);
	}

	const fx = new Group();
	const disasters = new DisasterDirector({
		group,
		fx,
		events: ctx.events,
		index,
		statics: staticMesh,
		facades: facadesMesh,
		rng: ctx.rng,
		density,
	});
	ctx.agents.push(disasters);
	for (const kind of DISASTER_KINDS) {
		ctx.events.onStage(kind, () => disasters.start(DISASTER_PRESETS[kind]));
	}

	const disposeMeshes = (root: Group) =>
		root.traverse((o) => {
			if (o instanceof Mesh) {
				o.geometry.dispose();
				if (o.material instanceof Material && o.material !== MAT_STATIC) {
					const map = "map" in o.material ? o.material.map : null;
					if (map instanceof Texture) map.dispose();
				}
			}
		});
	return {
		group,
		fx,
		agents: ctx.agents,
		events: ctx.events,
		disasters,
		dispose() {
			disposeMeshes(group);
			disposeMeshes(fx);
		},
	};
}
