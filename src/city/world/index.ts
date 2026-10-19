import { Group, Material, Mesh, Texture } from "three";
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
	agents: Agent[];
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

	const staticMesh = new Mesh(merge(ctx.statics), MAT_STATIC);
	staticMesh.castShadow = true;
	staticMesh.receiveShadow = true;
	group.add(staticMesh);
	if (ctx.facades.length > 0) {
		const facades = new Mesh(merge(ctx.facades), facadeMaterial());
		facades.castShadow = true;
		facades.receiveShadow = true;
		group.add(facades);
	}

	return {
		group,
		agents: ctx.agents,
		dispose() {
			group.traverse((o) => {
				if (o instanceof Mesh) {
					o.geometry.dispose();
					if (o.material instanceof Material && o.material !== MAT_STATIC) {
						const map = "map" in o.material ? o.material.map : null;
						if (map instanceof Texture) map.dispose();
					}
				}
			});
		},
	};
}
