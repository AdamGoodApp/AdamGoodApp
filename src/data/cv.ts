import { LINKS } from "./links";
import type { ZoneId } from "./zones";

export type Block =
	| { kind: "heading"; text: string }
	| { kind: "text"; text: string }
	| { kind: "bullets"; items: string[] }
	| { kind: "badges"; heading?: string; items: string[] }
	| {
			kind: "tabs";
			tabs: {
				label: string;
				heading: string;
				sub: string;
				bullets: string[];
				badges: string[];
			}[];
	  }
	| { kind: "project"; name: string; text: string; href: string };

export interface ZoneContent {
	id: ZoneId;
	title: string;
	tagline: string;
	blocks: Block[];
	links?: { label: string; href: string }[];
}

export const CV: Record<ZoneId, ZoneContent> = {
	downtown: {
		id: "downtown",
		title: "Experience",
		tagline:
			"13 years shipping fast, accessible products in Tokyo, Berlin and London.",
		blocks: [
			{
				kind: "tabs",
				tabs: [
					{
						label: "Tofu",
						heading: "Tofu · Senior Engineer",
						sub: "May 2024 – present · Tokyo · AI-driven accounting automation",
						bullets: [
							"Replaced LLM document categorization (~100K docs/month) with a fine-tuned mBERT model served via ONNX Runtime with a confidence-gated LLM fallback: ~10 min → 8 s (75× faster), 90%+ cheaper (~US$10K/year saved).",
							"Built an AI sales agent grounded in Whisper transcripts of real sales calls (RAG + style-guided prompting); 18% of chats convert to paid sign-ups.",
							"Made 100% of the product operable through chat with a tool-calling agent mapped to every UI action, and shipped an MCP server so users can run the platform from Claude and ChatGPT.",
							"Initiated and led the move from invite-only to self-serve sign-up and payment: monthly sign-ups 5× (~20 → 100 in the first month).",
							"Built an Excel-style editor (virtualized 100K+ rows, undo/redo, paste from Excel) on an OCR + LLM extraction chain; per-user pgvector RAG lifted field accuracy 91% → 97%.",
							"Designed an LLM router (−45% API spend, −60% latency) and a Langfuse / LLM-as-judge evaluation harness (−35% extraction errors); mentored 3 engineers; 99.9% uptime on AWS with Terraform.",
							"Led a company-wide rebrand and a Tailwind/Radix design system in Storybook: green Core Web Vitals, WCAG 2.2 AA.",
							"AI video pipeline (LLM scripts, TTS, generative video, Remotion) lifted landing-page conversion 24% and 30-day retention 15%.",
						],
						badges: [
							"TypeScript",
							"React",
							"Next.js",
							"Tailwind CSS",
							"Radix UI",
							"Python",
							"Rust",
							"pgvector",
							"PyTorch",
							"ONNX Runtime",
							"LangGraph",
							"MCP",
							"Whisper",
							"Remotion",
							"AWS",
							"Terraform",
						],
					},
					{
						label: "U-NEXT",
						heading: "U-NEXT · Senior Software Engineer",
						sub: "May 2022 – Apr 2024 · Tokyo · video-on-demand platform, 4M+ paid subscribers",
						bullets: [
							"Single-handedly moved the PlayStation app from vanilla JavaScript to Solid.js with a spatial-navigation focus engine: −45% start-up time, steady 60 fps browsing.",
							"Led a frontend initiative cutting initial page load 40% (LCP 3.8 s → 2.3 s); WCAG 2.1 AA on core flows; an A/B framework lifted watch time per session 15%.",
							"Built a shared React component library (Storybook + Playwright visual tests) adopted by 4 teams, and a federated GraphQL BFF (Apollo Federation, DataLoader) cutting client round trips 60%.",
							"Built an ML recommender (implicit-feedback ALS re-ranked by LightGBM, precomputed nightly into Redis): +18% home-screen click-through.",
							"Turned product, marketing and licensing goals into roadmaps and a KPI dashboard (BigQuery, Looker Studio); the resulting sign-up redesign lifted trial-to-paid conversion 12%.",
							"Extended the Shaka web player (MSE/EME, Widevine, PlayReady): −25% rebuffering; built an in-house Rust/WebAssembly DRM that decrypts comic pages client-side.",
						],
						badges: [
							"TypeScript",
							"Solid.js",
							"React",
							"Next.js",
							"GraphQL",
							"Apollo Federation",
							"Rust",
							"WebAssembly",
							"Shaka Player",
							"Python",
							"LightGBM",
							"Playwright",
						],
					},
					{
						label: "Synspective",
						heading: "Synspective · Chief Technology Lead",
						sub: "Sep 2018 – Apr 2022 · Tokyo · SAR satellite analytics for infrastructure monitoring and disaster assessment",
						bullets: [
							"Directed a team of 8 (grown from 2) through design, development and deployment of the core data-analysis platform; defined hiring, code review and CI/CD practices.",
							"Architected the React/TypeScript mapping frontend with Mapbox GL, custom WebGL shaders and Web Workers, rendering millions of SAR measurement points and InSAR time series at 60 fps.",
							"Built a cloud-native SAR processing pipeline on Kubernetes (Argo Workflows, Go workers, GDAL) producing Cloud-Optimized GeoTIFFs and Protobuf vector tiles, served via Go gRPC, REST and OGC WMTS.",
						],
						badges: [
							"TypeScript",
							"React",
							"Mapbox GL",
							"WebGL",
							"Web Workers",
							"Go",
							"Kubernetes",
							"Argo Workflows",
							"GDAL",
							"gRPC",
							"GCP",
						],
					},
				],
			},
		],
	},
	mountains: {
		id: "mountains",
		title: "FATMAP · Senior Web Software Engineer",
		tagline:
			"Sep 2017 – Sep 2018 · Berlin · 3D outdoor mapping platform (acquired by Strava in 2023)",
		blocks: [
			{
				kind: "text",
				text: "The peaks: 3D maps for skiers and climbers — the same kind of rendering that draws this city.",
			},
			{
				kind: "bullets",
				items: [
					"Engineered 3D terrain and GPS visualizations with Three.js and React, adding level-of-detail tiling and GPU instancing to hold 60 fps on mid-range laptops.",
					"Built Rails backend services and GraphQL APIs for hundreds of thousands of active users; optimized PostGIS queries to cut route-search latency 70%.",
					"Served as Data Protection Officer leading GDPR compliance.",
				],
			},
			{
				kind: "badges",
				items: [
					"React",
					"Three.js",
					"WebGL",
					"Ruby on Rails",
					"PostgreSQL/PostGIS",
					"GraphQL",
					"Docker",
					"AWS",
				],
			},
		],
	},
	rural: {
		id: "rural",
		title: "Roots",
		tagline: "Where it started: London, 2013.",
		blocks: [
			{
				kind: "heading",
				text: "Automata Technologies · Full-Stack Developer · Oct 2013 – Sep 2017 · London",
			},
			{
				kind: "text",
				text: "Robotics startup behind Eva, a low-cost 6-axis robotic arm.",
			},
			{
				kind: "bullets",
				items: [
					"Built the browser app for programming and controlling Eva on a Rails backend — an early React adoption with a Blockly drag-and-drop editor and a Three.js 3D simulator.",
					"Engineered a low-latency C++/ZeroMQ messaging server for real-time commands and telemetry, and shipped a Python SDK for factory and lab integrations.",
				],
			},
			{
				kind: "badges",
				heading: "Stack",
				items: [
					"React",
					"Three.js",
					"Ruby on Rails",
					"C++",
					"ZeroMQ",
					"Python",
					"Jenkins",
				],
			},
			{
				kind: "badges",
				heading: "Education",
				items: [
					"BA (Hons) Business and Management — University of Northampton, 2011",
					"Web Development Immersive — General Assembly, London, 2013",
				],
			},
		],
	},
	commercial: {
		id: "commercial",
		title: "Technical skills",
		tagline: "Every shop on this street sells something I ship with.",
		blocks: [
			{
				kind: "badges",
				heading: "Frontend",
				items: [
					"TypeScript",
					"React",
					"Next.js (App Router, RSC)",
					"Solid.js",
					"TanStack (Start, Query, Table, Virtual)",
					"Tailwind CSS",
					"Radix UI",
					"Storybook",
					"Vite",
					"Three.js",
					"WebGL",
					"WebGPU",
					"Mapbox GL",
					"WebAssembly",
				],
			},
			{
				kind: "badges",
				heading: "AI / ML",
				items: [
					"OpenAI · Anthropic · Gemini APIs",
					"agents & tool calling",
					"MCP servers",
					"RAG",
					"LLM routing",
					"LangChain / LangGraph",
					"LLM evaluation (Langfuse)",
					"PyTorch",
					"Hugging Face",
					"ONNX Runtime",
					"Whisper",
					"AI video generation",
					"recommender systems (ALS, LightGBM)",
				],
			},
			{
				kind: "badges",
				heading: "Backend & Data",
				items: [
					"Node.js",
					"FastAPI",
					"GraphQL",
					"gRPC",
					"REST",
					"Ruby on Rails",
					"PostgreSQL (pgvector, PostGIS)",
					"Redis",
				],
			},
			{
				kind: "badges",
				heading: "Cloud & DevOps",
				items: [
					"AWS",
					"GCP",
					"Cloudflare Workers",
					"Docker",
					"Kubernetes",
					"Terraform",
					"GitHub Actions",
					"OpenTelemetry",
					"Datadog",
				],
			},
			{
				kind: "badges",
				heading: "Design & quality",
				items: [
					"Figma",
					"design systems & branding",
					"Core Web Vitals",
					"accessibility (WCAG 2.2 AA)",
					"i18n",
					"TV / 10-foot UI",
					"Remotion",
					"Playwright",
					"Vitest",
				],
			},
			{
				kind: "badges",
				heading: "Languages",
				items: [
					"TypeScript",
					"JavaScript",
					"Python",
					"Rust",
					"Go",
					"Ruby",
					"SQL",
				],
			},
		],
	},
	beach: {
		id: "beach",
		title: "About me",
		tagline:
			"Frontend-focused full-stack engineer — 13 years across Tokyo, Berlin and London.",
		blocks: [
			{
				kind: "text",
				text: "I build fast, accessible products across AI-powered accounting, video streaming, satellite analytics, 3D mapping and robotics. Expert in TypeScript, React/Next.js and TanStack, with production Node.js, Rust, Go and Python. I ship AI end to end — fine-tuned classifiers, LLM routing, conversational agents, MCP servers and RAG — and bridge product, design and business.",
			},
			{
				kind: "badges",
				heading: "Recent impact",
				items: [
					"75× faster document categorization",
					"5× growth in sign-ups",
					"45% faster Solid.js console app",
				],
			},
			{
				kind: "badges",
				heading: "Spoken languages",
				items: [
					"English — fluent",
					"Italian — conversational",
					"Japanese — basic",
				],
			},
			{ kind: "badges", heading: "Based in", items: ["Tokyo, Japan"] },
		],
		links: [
			{ label: "LinkedIn", href: LINKS.linkedin },
			{ label: "GitHub", href: LINKS.github },
			{ label: "Email", href: LINKS.email },
		],
	},
	themepark: {
		id: "themepark",
		title: "Open-source playground",
		tagline: "Side projects, built for the fun of it.",
		blocks: [
			{
				kind: "project",
				name: "Smash Browser",
				text: "Super Smash Bros. Melee running in the browser with no emulator: the decompiled game compiled to WebAssembly with Emscripten, GameCube graphics translated to WebGPU, AudioWorklet audio and OPFS storage.",
				href: "https://github.com/AdamGoodApp/smash-browser",
			},
			{
				kind: "project",
				name: "Blockies",
				text: "An online LEGO-style building platform: build brick models in the browser. TanStack Start on Cloudflare Workers.",
				href: "https://blockies.build",
			},
			{
				kind: "project",
				name: "House Party 98",
				text: "A Windows 95 desktop recreated as a web app — windows, taskbar and all.",
				href: "https://house-party-98.vercel.app",
			},
			{
				kind: "project",
				name: "adzOS",
				text: "A micro operating system written from scratch in Rust.",
				href: "https://github.com/AdamGoodApp/adzOS",
			},
			{
				kind: "project",
				name: "This city",
				text: "Procedural 3D city rendered with three.js WebGPU (WebGL2 fallback), TanStack Start, Cloudflare Workers.",
				href: LINKS.repo,
			},
		],
	},
	residential: {
		id: "residential",
		title: "Off the clock",
		tagline: "What I tinker with after hours.",
		blocks: [
			{
				kind: "badges",
				items: [
					"iOS apps in Swift",
					"Unreal Engine / C++ game development",
					"Cybersecurity",
					"Game Boy and CHIP-8 emulators in Rust",
					"Conway's Game of Life in Rust + WebAssembly",
				],
			},
			{
				kind: "text",
				text: "Home is Tokyo. The lights in these windows are the simulation's residents coming and going.",
			},
		],
	},
};
