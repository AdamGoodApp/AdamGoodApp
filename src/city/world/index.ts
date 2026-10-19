import { Group, Mesh } from "three";
import { MAT_STATIC, merge } from "../geometry";
import type { Rng } from "../rng";
import type { Agent } from "../sim/agent";
import type { BuildContext } from "./context";
import { buildGround } from "./ground";
import { buildRoads } from "./roads";

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

	const staticMesh = new Mesh(merge(ctx.statics), MAT_STATIC);
	staticMesh.castShadow = true;
	staticMesh.receiveShadow = true;
	group.add(staticMesh);

	return {
		group,
		agents: ctx.agents,
		dispose() {
			group.traverse((o) => {
				if (o instanceof Mesh) o.geometry.dispose();
			});
		},
	};
}
