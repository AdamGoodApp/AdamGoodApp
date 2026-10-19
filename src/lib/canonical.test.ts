import { describe, expect, it } from "vitest";
import { redirectForHost } from "./canonical";

describe("redirectForHost", () => {
	it("301s www to the apex, keeping path and query", () => {
		const res = redirectForHost(new URL("https://www.adamgoodapp.com/x?y=1"));
		expect(res?.status).toBe(301);
		expect(res?.headers.get("location")).toBe("https://adamgoodapp.com/x?y=1");
	});

	it("upgrades plain-http www requests to https", () => {
		const res = redirectForHost(new URL("http://www.adamgoodapp.com/"));
		expect(res?.headers.get("location")).toBe("https://adamgoodapp.com/");
	});

	it("leaves the apex and other hosts alone", () => {
		expect(redirectForHost(new URL("https://adamgoodapp.com/"))).toBeNull();
		expect(redirectForHost(new URL("http://localhost:3000/"))).toBeNull();
		expect(redirectForHost(new URL("https://xxx.adamgoodapp.com/"))).toBeNull();
	});
});
