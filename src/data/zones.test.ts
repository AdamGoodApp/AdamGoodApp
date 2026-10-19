import { describe, expect, it } from "vitest";
import { zoneAt } from "./zones";

describe("zoneAt", () => {
	it("finds the district under a ground point", () => {
		expect(zoneAt(-58, -58)).toBe("downtown");
		expect(zoneAt(58, 58)).toBe("residential");
		expect(zoneAt(-58, 58)).toBe("beach");
	});

	it("treats the park, the arena and the avenues as non-interactive", () => {
		expect(zoneAt(0, 0)).toBeNull();
		expect(zoneAt(58, -58)).toBeNull();
		expect(zoneAt(-30, 0)).toBeNull();
	});

	it("includes the rectangle boundary", () => {
		expect(zoneAt(-84, -84)).toBe("downtown");
		expect(zoneAt(-85, -84)).toBeNull();
	});
});
