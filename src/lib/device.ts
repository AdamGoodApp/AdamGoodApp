export const DESKTOP_QUERY = "(min-width: 1024px)";

export function isDesktopViewport(): boolean {
	return typeof window !== "undefined" && matchMedia(DESKTOP_QUERY).matches;
}

export function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

export function readParam(name: string): string | null {
	if (typeof window === "undefined") return null;
	return new URLSearchParams(window.location.search).get(name);
}
