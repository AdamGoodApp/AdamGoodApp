import type { ZoneId } from "#/data/zones";

declare global {
	interface Window {
		__city?: {
			zoneScreenPoint(id: ZoneId): { x: number; y: number };
			cameraTarget(): { x: number; z: number };
			tier: string;
			ready: boolean;
		};
	}
}
