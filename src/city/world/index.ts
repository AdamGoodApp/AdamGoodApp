import { Group, Material, Mesh, Texture } from "three";
import { MAT_STATIC, merge } from "../geometry";
import { facadeMaterial } from "../kit/facade";
import type { Rng } from "../rng";
import type { Agent } from "../sim/agent";
import { createPeople } from "../sim/people";
import { createTraffic } from "../sim/traffic";
import { createWindowPool } from "../sim/windows";
import { buildAirport } from "./airport";
import { buildBeach } from "./beach";
import { buildClouds } from "./clouds";
import { buildCommercial } from "./commercial";
import type { BuildContext } from "./context";
import { buildDowntown } from "./downtown";
import { buildGround } from "./ground";
import { buildMountains } from "./mountains";
import { buildOcean } from "./ocean";
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
		windows: [],
		sidewalks: [],
		residentialDoors: [],
		residentialLoop: null,
		parkLoop: null,
	};

	buildGround(ctx);
	buildRoads(ctx);
	buildDowntown(ctx);
	buildCommercial(ctx);
	buildResidential(ctx);
	buildBeach(ctx);
	buildThemePark(ctx);
	buildRural(ctx);
	buildMountains(ctx);
	buildAirport(ctx);
	buildPark(ctx);
	buildOcean(ctx);
	buildClouds(ctx);

	// Shared pools read what the district builders registered.
	ctx.agents.push(createWindowPool(ctx));
	createTraffic(ctx);
	createPeople(ctx);

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
