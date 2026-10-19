import { useSelector } from "@tanstack/react-store";
import { Badge } from "#/components/ui/8bit/badge";
import { Card } from "#/components/ui/8bit/card";
import { uiStore } from "#/store/ui";

const TIER_LABEL = {
	webgpu: "WEBGPU",
	webgl2: "WEBGL2",
	pending: "LOADING",
} as const;

export function IdentityCard() {
	const tier = useSelector(uiStore, (s) => s.tier);
	return (
		<div className="fixed top-4 left-4 z-20">
			<Card font="normal" className="gap-2 px-4 py-3">
				<p className="retro text-sm">ADAM RAIS</p>
				<p className="text-xs max-sm:hidden">
					Senior Full-Stack Engineer · Tokyo
				</p>
				{tier !== "fallback" && (
					<Badge
						data-testid="tier-badge"
						className="w-fit text-[10px] max-sm:hidden"
					>
						{TIER_LABEL[tier]}
					</Badge>
				)}
			</Card>
		</div>
	);
}
