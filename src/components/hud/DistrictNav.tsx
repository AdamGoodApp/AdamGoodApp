import { Button } from "#/components/ui/8bit/button";
import { ZONES, type ZoneId } from "#/data/zones";

export function DistrictNav({
	onSelect,
	onHover,
}: {
	onSelect(id: ZoneId): void;
	onHover(id: ZoneId | null): void;
}) {
	return (
		<nav
			aria-label="Districts"
			className="sr-only-until-focus fixed top-28 left-4 z-30 flex flex-col items-start gap-4"
		>
			{ZONES.map((zone) => (
				<Button
					key={zone.id}
					font="retro"
					className="text-[10px]"
					onClick={() => onSelect(zone.id)}
					onFocus={() => onHover(zone.id)}
					onBlur={() => onHover(null)}
				>
					{zone.district} — {zone.topic}
				</Button>
			))}
		</nav>
	);
}
