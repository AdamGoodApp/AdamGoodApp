import { useSelector } from "@tanstack/react-store";
import { Moon, Sun, SunMoon } from "lucide-react";
import type { TimeMode } from "#/city/env";
import { Button } from "#/components/ui/8bit/button";
import { setUi, uiStore } from "#/store/ui";

const NEXT: Record<TimeMode, TimeMode> = {
	auto: "day",
	day: "night",
	night: "auto",
};
const VIEW = {
	auto: { Icon: SunMoon, label: "AUTO", hint: "Day/night cycle: automatic" },
	day: { Icon: Sun, label: "DAY", hint: "Day/night cycle: always day" },
	night: { Icon: Moon, label: "NIGHT", hint: "Day/night cycle: always night" },
} as const;

/** Cycles the city clock between automatic, pinned day and pinned night. */
export function TimeButton() {
	const mode = useSelector(uiStore, (s) => s.timeMode);
	const { Icon, label, hint } = VIEW[mode];
	return (
		<div className="fixed top-5 right-5 z-20">
			<Button
				font="retro"
				className="text-[10px]"
				aria-label={`${hint}. Switch to ${NEXT[mode]}.`}
				title={hint}
				onClick={() => setUi({ timeMode: NEXT[mode] })}
			>
				<Icon className="size-4" />
				<span className="max-sm:hidden">{label}</span>
			</Button>
		</div>
	);
}
