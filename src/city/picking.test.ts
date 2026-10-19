import { Ray, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { ZONE_BY_ID } from "#/data/zones";
import { pickZone } from "./picking";

const VIEW = new Vector3(-1, -1, -1).normalize();

function rayThrough(x: number, y: number, z: number): Ray {
	const origin = new Vector3(x, y, z).addScaledVector(VIEW, -500);
	return new Ray(origin, VIEW.clone());
}

describe("pickZone", () => {
	it("picks a district through its anchor (the top of its tallest building)", () => {
		for (const id of ["downtown", "mountains", "themepark", "beach"] as const) {
			const [x, y, z] = ZONE_BY_ID[id].anchor;
			expect(pickZone(rayThrough(x, y, z))).toBe(id);
		}
	});

	it("returns null over the park and the airport", () => {
		expect(pickZone(rayThrough(0, 0, 0))).toBeNull();
		expect(pickZone(rayThrough(58, 0, -58))).toBeNull();
	});
});
