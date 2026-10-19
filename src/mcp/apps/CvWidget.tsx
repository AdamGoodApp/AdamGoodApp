import type { App } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
	Badges,
	Bullets,
	external,
	ZoneContent,
} from "#/components/hud/ZoneContent";
import { Badge } from "#/components/ui/8bit/badge";
import { Button } from "#/components/ui/8bit/button";
import { Card } from "#/components/ui/8bit/card";
import { type WidgetResult, widgetResultSchema } from "../schemas";

type ResultOf<K extends WidgetResult["kind"]> = Extract<
	WidgetResult,
	{ kind: K }
>;

function applyTheme(theme: string | undefined): void {
	if (theme === undefined) return;
	document.documentElement.classList.toggle("dark", theme === "dark");
}

function Panel({
	title,
	subtitle,
	children,
}: {
	title: string;
	subtitle?: string;
	children?: ReactNode;
}) {
	return (
		<Card font="normal" className="gap-3 py-4">
			<div className="space-y-2 px-5">
				<h2 className="retro text-sm leading-relaxed">{title}</h2>
				{subtitle && (
					<p className="text-muted-foreground text-xs">{subtitle}</p>
				)}
			</div>
			{children && <div className="space-y-4 px-5 font-sans">{children}</div>}
		</Card>
	);
}

function LinkButton({ href, label }: { href: string; label: string }) {
	return (
		<Button asChild size="sm" font="retro" className="text-[10px]">
			<a href={href} {...external(href)}>
				{label}
			</a>
		</Button>
	);
}

function ProfileView({ result }: { result: ResultOf<"profile"> }) {
	const { links } = result;
	return (
		<Panel
			title={result.name}
			subtitle={`${result.title} · ${result.location}`}
		>
			<p className="text-sm leading-relaxed">{result.summary}</p>
			<h3 className="retro text-[10px]">Recent impact</h3>
			<Badges items={result.highlights} />
			<h3 className="retro text-[10px]">Spoken languages</h3>
			<Badges items={result.languages} />
			<div className="flex flex-wrap gap-4 px-1.5">
				<LinkButton href={links.linkedin} label="LINKEDIN" />
				<LinkButton href={links.github} label="GITHUB" />
				<LinkButton href={links.email} label="EMAIL" />
			</div>
		</Panel>
	);
}

function DistrictView({ result }: { result: ResultOf<"district"> }) {
	return (
		<Panel title={result.title} subtitle={result.tagline}>
			<ZoneContent
				zone={{
					id: result.id,
					title: result.title,
					tagline: result.tagline,
					blocks: result.blocks,
					...(result.links.length ? { links: result.links } : {}),
				}}
			/>
		</Panel>
	);
}

function ExperienceView({ result }: { result: ResultOf<"experience"> }) {
	return (
		<div className="space-y-4">
			{result.roles.map((role) => (
				<Panel
					key={`${role.company}-${role.period}`}
					title={`${role.company} · ${role.role}`}
					subtitle={[role.period, role.location].filter(Boolean).join(" · ")}
				>
					{role.summary && <p className="text-sm">{role.summary}</p>}
					<Bullets items={role.bullets} />
					<Badges items={role.stack} />
				</Panel>
			))}
			{result.education.length > 0 && (
				<Panel title="Education">
					<Bullets items={result.education} />
				</Panel>
			)}
		</div>
	);
}

function SkillsView({ result }: { result: ResultOf<"skills"> }) {
	return (
		<Panel title="Technical skills">
			{result.groups.map((g) => (
				<div key={g.group} className="space-y-2">
					<h3 className="retro text-[10px]">{g.group}</h3>
					<Badges items={g.items} />
				</div>
			))}
		</Panel>
	);
}

function ProjectsView({ result }: { result: ResultOf<"projects"> }) {
	return (
		<Panel title="Open-source playground">
			{result.projects.map((p) => (
				<article key={p.href} className="space-y-2">
					<h3 className="retro text-[11px]">{p.name}</h3>
					<p className="text-sm leading-relaxed">{p.text}</p>
					<div className="px-1.5">
						<LinkButton href={p.href} label="OPEN ↗" />
					</div>
				</article>
			))}
		</Panel>
	);
}

function SearchView({ result }: { result: ResultOf<"search"> }) {
	return (
		<Panel title={`Search: ${result.query}`}>
			{result.results.length === 0 ? (
				<p className="text-sm">No matches</p>
			) : (
				<ul className="space-y-4">
					{result.results.map((hit) => (
						<li
							key={`${hit.zoneId}-${hit.heading}-${hit.snippet}`}
							className="space-y-1.5"
						>
							<div className="flex items-center justify-between gap-3">
								<h3 className="retro text-[10px] leading-relaxed">
									{hit.district} — {hit.heading}
								</h3>
								<Badge font="normal" variant="outline" className="text-xs">
									{hit.score}
								</Badge>
							</div>
							<p className="text-sm leading-relaxed">{hit.snippet}</p>
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}

function ResultView({ result }: { result: WidgetResult }) {
	switch (result.kind) {
		case "profile":
			return <ProfileView result={result} />;
		case "district":
			return <DistrictView result={result} />;
		case "experience":
			return <ExperienceView result={result} />;
		case "skills":
			return <SkillsView result={result} />;
		case "projects":
			return <ProjectsView result={result} />;
		case "search":
			return <SearchView result={result} />;
	}
}

/** Links inside the host's sandboxed iframe open through the host. */
function useHostLinks(app: App | null) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const root = ref.current;
		if (!root || !app) return;
		const onClick = (e: MouseEvent) => {
			const target = e.target instanceof Element ? e.target : null;
			const anchor = target?.closest("a[href]");
			const href = anchor?.getAttribute("href");
			if (!href) return;
			e.preventDefault();
			app.openLink({ url: href }).catch(() => window.open(href, "_blank"));
		};
		root.addEventListener("click", onClick);
		return () => root.removeEventListener("click", onClick);
	}, [app]);
	return ref;
}

export function CvWidget() {
	const [result, setResult] = useState<WidgetResult | null>(null);
	const [raw, setRaw] = useState<string | null>(null);
	const { app, isConnected, error } = useApp({
		appInfo: { name: "adamgoodapp-cv", version: "1.0.0" },
		capabilities: {},
		onAppCreated: (created) => {
			created.ontoolresult = (r) => {
				const parsed = widgetResultSchema.safeParse(r.structuredContent);
				if (parsed.success) {
					setResult(parsed.data);
					setRaw(null);
					return;
				}
				let text = "Unsupported result";
				for (const c of r.content ?? []) {
					if (c.type === "text") {
						text = c.text;
						break;
					}
				}
				setResult(null);
				setRaw(text);
			};
			created.onhostcontextchanged = (ctx) => applyTheme(ctx.theme);
		},
	});
	const ref = useHostLinks(app);

	useEffect(() => {
		if (isConnected) applyTheme(app?.getHostContext()?.theme);
	}, [isConnected, app]);

	let body: ReactNode;
	if (error) {
		body = (
			<p className="text-sm">Could not connect to the host: {error.message}</p>
		);
	} else if (!isConnected) {
		body = (
			<p className="retro animate-pulse text-[10px]">WAITING FOR THE HOST…</p>
		);
	} else if (result) {
		body = <ResultView result={result} />;
	} else if (raw !== null) {
		body = <pre className="text-xs whitespace-pre-wrap">{raw}</pre>;
	} else {
		body = <p className="retro animate-pulse text-[10px]">LOADING…</p>;
	}

	return (
		<div
			ref={ref}
			data-testid="cv-widget"
			className="max-w-2xl p-3 font-sans text-foreground"
		>
			{body}
		</div>
	);
}
