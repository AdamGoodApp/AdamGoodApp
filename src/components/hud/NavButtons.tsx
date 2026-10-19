import { GithubIcon, LinkedinIcon, MailIcon } from "#/components/icons";
import { Button } from "#/components/ui/8bit/button";
import { LINKS } from "#/data/links";
import { cn } from "#/lib/utils";

const ITEMS = [
	{
		label: "LINKEDIN",
		name: "LinkedIn",
		href: LINKS.linkedin,
		Icon: LinkedinIcon,
		external: true,
	},
	{
		label: "GITHUB",
		name: "GitHub",
		href: LINKS.github,
		Icon: GithubIcon,
		external: true,
	},
	{
		label: "EMAIL",
		name: "Email",
		href: LINKS.email,
		Icon: MailIcon,
		external: false,
	},
] as const;

export function NavButtons({ layout }: { layout: "corner" | "center" }) {
	const corner = layout === "corner";
	return (
		<nav
			aria-label="Contact"
			className={cn(
				"flex gap-4",
				corner ? "fixed right-5 bottom-5 z-20" : "flex-wrap justify-center",
			)}
		>
			{ITEMS.map(({ label, name, href, Icon, external }) => (
				<Button
					key={label}
					asChild
					font="retro"
					className={cn("text-xs", corner && "max-sm:hidden")}
				>
					<a
						href={href}
						aria-label={name}
						{...(external ? { target: "_blank", rel: "noreferrer" } : {})}
					>
						<Icon className="size-4" />
						{label}
					</a>
				</Button>
			))}
			{corner &&
				ITEMS.map(({ label, name, href, Icon, external }) => (
					<Button
						key={`${label}-icon`}
						asChild
						size="icon"
						className="sm:hidden"
					>
						<a
							href={href}
							aria-label={name}
							{...(external ? { target: "_blank", rel: "noreferrer" } : {})}
						>
							<Icon className="size-4" />
						</a>
					</Button>
				))}
		</nav>
	);
}
