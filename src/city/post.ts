import type { Camera, Scene } from "three";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { gaussianBlur } from "three/addons/tsl/display/GaussianBlurNode.js";
import { abs, mix, pass, screenUV, smoothstep } from "three/tsl";
import { RenderPipeline, type WebGPURenderer } from "three/webgpu";
import { bloomStrength } from "./env";

/**
 * Scene pass → bloom (strong at night so windows and lamps glow) → tilt-shift:
 * a horizontal band through the middle of the screen stays sharp and the top
 * and bottom blur, which reads as a miniature city.
 */
export function createPipeline(
	renderer: WebGPURenderer,
	scene: Scene,
	camera: Camera,
	{ tiltShift, lite }: { tiltShift: boolean; lite: boolean },
): RenderPipeline {
	const pipeline = new RenderPipeline(renderer);
	const scenePass = pass(scene, camera, { samples: lite ? 0 : 4 });
	const color = scenePass.getTextureNode("output");
	if (lite) {
		pipeline.outputNode = color;
		return pipeline;
	}
	const lit = color.add(bloom(color, bloomStrength, 0.35, 0.85));
	if (!tiltShift) {
		pipeline.outputNode = lit;
		return pipeline;
	}
	const blurred = gaussianBlur(lit, null, 2.2, { resolutionScale: 0.5 });
	const band = smoothstep(0.2, 0.5, abs(screenUV.y.sub(0.5)));
	pipeline.outputNode = mix(lit, blurred, band);
	return pipeline;
}
