import { describe, expect, it } from "vitest";
import { CityEvents } from "./events";

describe("CityEvents", () => {
	it("names the district and pages by id", () => {
		const log = new CityEvents();
		log.emit("bus_at_stop", "A bus stops in {where}", -58, -58, 1);
		log.emit("festival_started", "Party in {where}", 0, 0, 2);
		const [bus, party] = log.since();
		expect(bus).toMatchObject({
			zone: "downtown",
			text: "A bus stops in Downtown",
		});
		expect(party).toMatchObject({ zone: null, text: "Party in the city" });
		expect(log.since(bus?.id).map((e) => e.kind)).toEqual(["festival_started"]);
		expect(log.since(log.lastId)).toEqual([]);
	});

	it("keeps only the latest events", () => {
		const log = new CityEvents();
		for (let i = 0; i < 100; i++) log.emit("bus_at_stop", `${i}`, 0, 0, i);
		const all = log.since();
		expect(all).toHaveLength(64);
		expect(all.at(-1)?.text).toBe("99");
		expect(log.since(0, 3).map((e) => e.text)).toEqual(["97", "98", "99"]);
	});

	it("runs registered stages and refuses unknown ones", () => {
		const log = new CityEvents();
		log.now = 12;
		let at = -1;
		log.onStage("park_festival", (t) => {
			at = t;
			return { ok: true, text: "on" };
		});
		expect(log.stageKinds()).toEqual(["park_festival"]);
		expect(log.stage("park_festival")).toEqual({ ok: true, text: "on" });
		expect(at).toBe(12);
		expect(log.stage("launch_helicopter").ok).toBe(false);
	});
});
