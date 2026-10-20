import { lazy, type RefObject, Suspense, useEffect, useState } from "react";
import type { CityWorld } from "#/city/world";
import type { ZoneId } from "#/data/zones";

const MayorDock = lazy(() =>
	import("./MayorDock").then((m) => ({ default: m.MayorDock })),
);

export interface MayorChatProps {
	worldRef: RefObject<CityWorld | null>;
	select(id: ZoneId | null): void;
	hover(id: ZoneId | null): void;
}

/**
 * The Mayor chat dock. Client-only (liquid-glass-react reads `navigator`
 * while rendering) and lazy, so the chat code stays out of the main bundle.
 */
export function MayorChat(props: MayorChatProps) {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	if (!mounted) return null;
	return (
		<Suspense fallback={null}>
			<MayorDock {...props} />
		</Suspense>
	);
}
