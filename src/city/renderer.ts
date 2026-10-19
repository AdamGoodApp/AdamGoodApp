import { ACESFilmicToneMapping, PCFShadowMap } from "three";
import { WebGPURenderer } from "three/webgpu";

export type GpuTier = "webgpu" | "webgl2";

export async function detectTier(
	forced: "webgl2" | null,
): Promise<GpuTier | "fallback"> {
	if (
		forced !== "webgl2" &&
		typeof navigator !== "undefined" &&
		navigator.gpu
	) {
		try {
			if (await navigator.gpu.requestAdapter()) return "webgpu";
		} catch {
			// fall through to the WebGL2 probe
		}
	}
	const probe = document.createElement("canvas");
	return probe.getContext("webgl2") ? "webgl2" : "fallback";
}

export async function createRenderer(
	canvas: HTMLCanvasElement,
	tier: GpuTier,
): Promise<WebGPURenderer> {
	const renderer = new WebGPURenderer({
		canvas,
		antialias: true,
		alpha: true,
		forceWebGL: tier === "webgl2",
	});
	await renderer.init();
	renderer.setClearColor(0x000000, 0);
	renderer.toneMapping = ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = PCFShadowMap;
	return renderer;
}
