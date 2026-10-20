import {
	Braces,
	FileText,
	GitFork,
	type LucideIcon,
	Map as MapIcon,
	Newspaper,
} from "lucide-react";

export interface MayorSuggestion {
	id: string;
	label: string;
	prompt: string;
	icon: LucideIcon;
	/** Ask for a job-description file first; the message sends once it is read. */
	pickFile?: boolean;
}

export const FIT_CHECK_PROMPT = "How well does Adam fit this job description?";

export const MAYOR_SUGGESTIONS: readonly MayorSuggestion[] = [
	{
		id: "rust",
		label: "What did Adam build with Rust?",
		prompt: "What did Adam build with Rust?",
		icon: Braces,
	},
	{
		id: "tour",
		label: "Give me a 60-second tour",
		prompt: "Give me a 60-second tour of the city.",
		icon: MapIcon,
	},
	{
		id: "news",
		label: "What's happening in the city?",
		prompt: "What's happening in the city right now?",
		icon: Newspaper,
	},
	{
		id: "fit",
		label: "Check a job description",
		prompt: FIT_CHECK_PROMPT,
		icon: FileText,
		pickFile: true,
	},
	{
		id: "oss",
		label: "Show me the open-source projects",
		prompt: "Show me Adam's open-source projects.",
		icon: GitFork,
	},
];
