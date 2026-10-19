/** 12×18 pixel-art mouse: O outline, B body, S shine. The wheel is drawn separately so it can animate. */
const MOUSE = [
	"...OOOOOO...",
	"..OBBBBBBO..",
	".OBSBBBBBBO.",
	"OBSBB..BBBBO",
	"OBSBB..BBBBO",
	"OBBBB..BBBBO",
	"OOOOOOOOOOOO",
	"OBBBBBBBBBBO",
	"OBBBBBBBBBBO",
	"OBBBBBBBBBBO",
	"OBBBBBBBBBBO",
	"OBBBBBBBBBBO",
	"OBBBBBBBBBBO",
	"OBBBBBBBBBBO",
	".OBBBBBBBBO.",
	".OBBBBBBBBO.",
	"..OBBBBBBO..",
	"...OOOOOO...",
] as const;
const FILL: Record<string, string> = {
	O: "#1d1d1d",
	B: "#f4f4f0",
	S: "#ffffff",
};

/** Loading-screen hint that the city can be zoomed: a mouse with a rolling wheel. */
export function ScrollHint({ touch }: { touch: boolean }) {
	const cells: { x: number; y: number; fill: string }[] = [];
	MOUSE.forEach((row, y) => {
		for (let x = 0; x < row.length; x++) {
			const fill = FILL[row.charAt(x)];
			if (fill) cells.push({ x, y, fill });
		}
	});
	return (
		<div className="flex flex-col items-center gap-3" data-testid="scroll-hint">
			<svg
				viewBox="0 0 12 18"
				shapeRendering="crispEdges"
				aria-hidden="true"
				className="h-14 w-10 drop-shadow-[2px_2px_0_rgba(0,0,0,0.25)]"
			>
				{cells.map(({ x, y, fill }) => (
					<rect
						key={`${x}-${y}`}
						x={x}
						y={y}
						width="1"
						height="1"
						fill={fill}
					/>
				))}
				<rect
					x="5"
					y="3"
					width="2"
					height="2"
					fill="#d62828"
					className="motion-safe:animate-[scroll-wheel_1.4s_steps(3)_infinite]"
				/>
			</svg>
			<p className="retro text-[10px]">
				{touch ? "PINCH TO ZOOM" : "SCROLL OR PINCH TO ZOOM"}
			</p>
		</div>
	);
}
