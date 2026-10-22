import { CvOutline } from "./hud/CvOutline";
import { NavButtons } from "./hud/NavButtons";

export function StaticFallback() {
	return (
		<div
			data-testid="static-fallback"
			className="fixed inset-0 bg-cover bg-center"
			style={{ backgroundImage: "url(/city.jpg)" }}
		>
			<div className="absolute inset-0 bg-black/55" />
			<div className="absolute inset-0 flex items-center justify-center p-6">
				<div
					data-testid="fallback-center"
					className="flex flex-col items-center gap-6 text-center"
				>
					<h1 className="retro text-2xl text-white md:text-4xl">ADAMGOODAPP</h1>
					<p className="text-white">
						Adam — Senior Full-Stack Engineer · Tokyo
					</p>
					<NavButtons layout="center" />
					<p className="text-white/70 text-xs">
						The 3D city needs WebGPU or WebGL2 — showing a snapshot instead.
					</p>
				</div>
			</div>
			<CvOutline />
		</div>
	);
}
