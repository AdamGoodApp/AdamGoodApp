import { CV } from "#/data/cv";
import { ZONES } from "#/data/zones";
import { ZoneContent } from "./ZoneContent";

/** Screen-reader / crawler copy of the whole CV; the canvas is decorative. */
export function CvOutline() {
	return (
		<main className="sr-only">
			<h1>Adam Rais — Senior Full-Stack Software Engineer</h1>
			{ZONES.map((zone) => {
				const content = CV[zone.id];
				return (
					<section
						key={zone.id}
						aria-label={`${zone.district}: ${content.title}`}
					>
						<h2>{content.title}</h2>
						<p>{content.tagline}</p>
						<ZoneContent zone={content} outline />
					</section>
				);
			})}
		</main>
	);
}
