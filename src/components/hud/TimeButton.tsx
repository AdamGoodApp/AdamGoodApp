import { useSelector } from "@tanstack/react-store";
import { Moon, Sun } from "lucide-react";
import { Button } from "#/components/ui/8bit/button";
import { setUi, uiStore } from "#/store/ui";

/**
 * Day/night control. The main button always flips what is on screen (and pins
 * it); while pinned, an AUTO button hands the clock back to the cycle.
 */
export function TimeButton() {
	const mode = useSelector(uiStore, (s) => s.timeMode);
	const isNight = useSelector(uiStore, (s) => s.isNight);
	const target = isNight ? "day" : "night";
	const Icon = isNight ? Moon : Sun;
	return (
		<div className="fixed top-5 right-5 z-20 flex gap-4">
			{mode !== "auto" && (
				<Button
					font="retro"
					variant="outline"
					className="text-[10px]"
					aria-label="Resume the automatic day/night cycle"
					onClick={() => setUi({ timeMode: "auto" })}
				>
					AUTO
				</Button>
			)}
			<Button
				font="retro"
				className="text-[10px]"
				data-testid="time-toggle"
				aria-label={`Switch to ${target}`}
				title={`Switch to ${target}`}
				onClick={() => setUi({ timeMode: target })}
			>
				<Icon className="size-4" />
				<span className="max-sm:hidden">{isNight ? "NIGHT" : "DAY"}</span>
			</Button>
		</div>
	);
}
