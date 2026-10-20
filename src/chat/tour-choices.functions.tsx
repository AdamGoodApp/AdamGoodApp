import { createServerFn } from "@tanstack/react-start";
import { createCompositeComponent } from "@tanstack/react-start/rsc";
import type { ComponentType, JSX } from "react";
import { TOUR_AUDIENCES, type TourAudienceId } from "#/data/tours";
import { ZONE_BY_ID } from "#/data/zones";

/** The interactive button the dock renders inside each server-rendered choice. */
export interface TourChoiceButtonProps {
	audience: TourAudienceId;
	label: string;
}

export interface TourChoiceSlots {
	Button?: ComponentType<TourChoiceButtonProps>;
}

/**
 * One streamed choice row; render it with `<CompositeComponent src Button />`.
 * The RSC package exports no named type for a typed composite, so it is
 * inferred from `createCompositeComponent` here, once.
 */
export type TourChoiceSource = Awaited<
	ReturnType<
		typeof createCompositeComponent<(props: TourChoiceSlots) => JSX.Element>
	>
>;

/**
 * The ask_tour_audience choices as React Server Components, streamed one per
 * audience. The server renders each row and its route; the client fills the
 * `Button` slot with the clickable 8-bit button.
 */
export const streamTourChoices = createServerFn({ method: "GET" }).handler(
	async function* (): AsyncGenerator<TourChoiceSource> {
		for (const audience of TOUR_AUDIENCES) {
			const route = audience.stops
				.map((id) => ZONE_BY_ID[id].district)
				.join(" → ");
			yield await createCompositeComponent((props: TourChoiceSlots) => (
				<li
					data-testid="tour-choice"
					className="flex flex-col items-start gap-1.5"
				>
					{props.Button && (
						<props.Button audience={audience.id} label={audience.label} />
					)}
					<span className="retro text-[9px] leading-[1.8] text-white/60">
						{audience.stops.length} stops · {route}
					</span>
				</li>
			));
		}
	},
);
