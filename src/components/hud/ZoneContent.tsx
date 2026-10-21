import { Badge } from "#/components/ui/8bit/badge";
import { Button } from "#/components/ui/8bit/button";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "#/components/ui/8bit/tabs";
import type { Block, ZoneContent as ZoneContentData } from "#/data/cv";

export function Badges({ items }: { items: string[] }) {
	return (
		<ul className="flex flex-wrap gap-x-4 gap-y-2 px-1.5">
			{items.map((item) => (
				<li key={item}>
					<Badge font="normal" variant="outline" className="text-xs">
						{item}
					</Badge>
				</li>
			))}
		</ul>
	);
}

export function Bullets({ items }: { items: string[] }) {
	return (
		<ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed">
			{items.map((item) => (
				<li key={item}>{item}</li>
			))}
		</ul>
	);
}

export function external(href: string) {
	return href.startsWith("mailto:")
		? {}
		: { target: "_blank", rel: "noreferrer" };
}

/**
 * `outline`: the screen-reader / crawler copy. Every tab is rendered (Radix
 * renders only the selected one) and links are kept out of the Tab order,
 * since the outline is visually hidden.
 */
function BlockView({ block, outline }: { block: Block; outline: boolean }) {
	const linkProps = outline ? { tabIndex: -1 } : {};
	switch (block.kind) {
		case "heading":
			return (
				<h3 className="retro text-[11px] leading-relaxed">{block.text}</h3>
			);
		case "text":
			return <p className="text-sm leading-relaxed">{block.text}</p>;
		case "bullets":
			return <Bullets items={block.items} />;
		case "badges":
			return (
				<div className="space-y-2">
					{block.heading && (
						<h4 className="retro text-[10px]">{block.heading}</h4>
					)}
					<Badges items={block.items} />
				</div>
			);
		case "tabs":
			if (outline) {
				return (
					<div className="space-y-3">
						{block.tabs.map((tab) => (
							<section key={tab.label} className="space-y-3">
								<h3>
									{tab.label}: {tab.heading}
								</h3>
								<p>{tab.sub}</p>
								<Bullets items={tab.bullets} />
								<Badges items={tab.badges} />
							</section>
						))}
					</div>
				);
			}
			return (
				<Tabs defaultValue={block.tabs[0]?.label} className="gap-4">
					<TabsList className="mx-1.5 w-[calc(100%-12px)]">
						{block.tabs.map((tab) => (
							<TabsTrigger
								key={tab.label}
								value={tab.label}
								className="text-[10px]"
							>
								{tab.label}
							</TabsTrigger>
						))}
					</TabsList>
					{block.tabs.map((tab) => (
						<TabsContent
							key={tab.label}
							value={tab.label}
							className="space-y-3 font-sans"
						>
							<h3 className="retro text-[11px] leading-relaxed">
								{tab.heading}
							</h3>
							<p className="text-muted-foreground text-xs">{tab.sub}</p>
							<Bullets items={tab.bullets} />
							<Badges items={tab.badges} />
						</TabsContent>
					))}
				</Tabs>
			);
		case "project":
			return (
				<article className="space-y-2">
					<h3 className="retro text-[11px]">{block.name}</h3>
					<p className="text-sm leading-relaxed">{block.text}</p>
					<Button asChild size="sm" font="retro" className="ml-1.5 text-[10px]">
						<a href={block.href} {...external(block.href)} {...linkProps}>
							OPEN ↗
						</a>
					</Button>
				</article>
			);
	}
}

export function ZoneContent({
	zone,
	outline = false,
}: {
	zone: ZoneContentData;
	outline?: boolean;
}) {
	return (
		<div className="space-y-5 font-sans">
			{zone.blocks.map((block, i) => (
				// Blocks are static content; the index is a stable key.
				// biome-ignore lint/suspicious/noArrayIndexKey: static list
				<BlockView key={i} block={block} outline={outline} />
			))}
			{zone.links && (
				<div className="flex flex-wrap gap-4 px-1.5">
					{zone.links.map((link) => (
						<Button
							key={link.href}
							asChild
							size="sm"
							font="retro"
							className="text-[10px]"
						>
							<a
								href={link.href}
								{...external(link.href)}
								{...(outline ? { tabIndex: -1 } : {})}
							>
								{link.label.toUpperCase()}
							</a>
						</Button>
					))}
				</div>
			)}
		</div>
	);
}
