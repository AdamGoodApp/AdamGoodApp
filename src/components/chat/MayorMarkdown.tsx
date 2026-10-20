import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const REMARK_PLUGINS = [remarkGfm];

/** The Mayor's answers: GitHub-flavoured markdown, links open in a new tab. */
export function MayorMarkdown({ children }: { children: string }) {
	return (
		<div className="text-sm leading-relaxed [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_h1,&_h2,&_h3]:mt-2 [&_h1,&_h2,&_h3]:text-base [&_h1,&_h2,&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_strong]:font-semibold [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5">
			<Markdown
				remarkPlugins={REMARK_PLUGINS}
				components={{
					a: ({ node: _node, ...props }) => (
						<a
							{...props}
							target="_blank"
							rel="noreferrer"
							className="underline decoration-white/40 underline-offset-2"
						/>
					),
				}}
			>
				{children}
			</Markdown>
		</div>
	);
}
