import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { StaticFallback } from "#/components/StaticFallback";
import appCss from "../styles.css?url";

const TITLE = "AdamGoodApp — Senior Full-Stack Engineer";
const DESCRIPTION =
	"Adam: frontend-focused full-stack engineer in Tokyo (TypeScript, React, TanStack, three.js, AI/LLM systems). Explore the city to read the CV.";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1, viewport-fit=cover",
			},
			{ title: TITLE },
			{ name: "description", content: DESCRIPTION },
			{ property: "og:title", content: TITLE },
			{ property: "og:description", content: DESCRIPTION },
			{ property: "og:type", content: "website" },
			{ property: "og:url", content: "https://adamgoodapp.com" },
			{ property: "og:image", content: "https://adamgoodapp.com/og.jpg" },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "theme-color", content: "#9fd3ff" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
			{ rel: "canonical", href: "https://adamgoodapp.com" },
		],
	}),
	shellComponent: RootDocument,
	errorComponent: StaticFallback,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
