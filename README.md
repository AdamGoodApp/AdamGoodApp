# AdamGoodApp

Senior Full-Stack Engineer in Tokyo — TypeScript, React/TanStack, three.js, AI/LLM systems.

[![CI](https://github.com/AdamGoodApp/AdamGoodApp/actions/workflows/ci.yml/badge.svg)](https://github.com/AdamGoodApp/AdamGoodApp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020?logo=cloudflare&logoColor=white)
![three.js WebGPU](https://img.shields.io/badge/three.js-WebGPU-000?logo=threedotjs)

[![The AdamGoodApp city](public/city.jpg)](https://adamgoodapp.com)

**→ [adamgoodapp.com](https://adamgoodapp.com)**

## What it is

My CV as a living, SimCity-style isometric city that fills the whole screen: seven career districts in the middle, surrounded by downtown overspill, an industrial belt, dense neighbourhoods and a marina, with the sea only off the beach corner. Every district is a chapter of my career, marked by a floating light bulb: hover a bulb or a district to outline it, click to read that section. Scroll or pinch to zoom toward the pointer and drag to pan around the details. Traffic, buses, a tram and police patrols fill the roads, fire crews fight a house fire in the suburbs, ambulances run to the hospital, a rally gathers outside the town hall, the arena lights up its searchlights at night, boats sail past the lighthouse, and an "AdamGoodApp" sign glows on the hill in the middle. The city runs a day/night cycle; the button in the top-right corner flips between day and night, and AUTO resumes the cycle. LinkedIn, GitHub and email are in the bottom-right corner.

## Districts → CV

| District | CV section |
| --- | --- |
| Downtown | Experience: Tofu, U-NEXT, Synspective |
| The Peaks | FATMAP (3D mapping, Berlin) |
| Old Town & Campus | Roots: Automata Technologies, education |
| Shop Street | Technical skills |
| The Beach | About me, languages, contact |
| Fun Park | Open-source projects |
| Suburbs | Off the clock |

## How the city is built

- **Procedural everything.** No models or textures are downloaded. Buildings come from a parametric kit (`src/city/kit/buildings.ts`: walk-ups, offices, art-deco and glass towers, apartments, houses) whose walls use a facade atlas drawn on a canvas at load time (`src/city/kit/atlas.ts`: brick, stone, glass curtain walls, storefronts, siding). Props, vehicles and people are prefabs built from boxes, cylinders and cones and painted with vertex colours.
- **Outskirts.** A 30 m street grid (`src/city/world/outskirts.ts`) surrounds the districts; only blocks that can appear on screen are generated and filled (`out-urban.ts`, `out-north.ts`, `out-south.ts`), with conveyor-style through traffic on their streets.
- **Two static meshes.** All vertex-coloured scenery is merged into one mesh and all textured walls into another, so the island's scenery is two draw calls.
- **Facade shader.** One TSL material tiles the atlas per bay and floor, mirrors the sky in the glass by day and switches windows on and off at night, each window on its own timer.
- **Day/night.** Sun, moon, sky gradient, street lamps, headlights, neon, LED screens and bloom follow a three-minute cycle (`src/city/env.ts`); a per-vertex `glow` attribute marks what lights up, and siren light bars flash red/blue.
- **Instanced agents.** Each kind of moving thing (cars, police cars, ambulances, people, flames, smoke, water jets, gulls, gondolas, …) is one `InstancedMesh`.
- **Fixed-step simulation.** Agents update at 60 Hz independent of the display rate (`src/city/world.ts`); cars reserve junctions so 100+ vehicles never overlap.
- **WebGPU first.** three.js `WebGPURenderer` runs on WebGPU and falls back to its WebGL2 backend, with a post-processing pipeline for bloom and a tilt-shift blur. Without either backend, a static snapshot with the same links and an accessible text CV is shown.
- **Respectful.** `prefers-reduced-motion` freezes the simulation, hidden tabs pause it, and the full CV is server-rendered for screen readers and crawlers. The light bulbs are real buttons, so keyboard users <kbd>Tab</kbd> through the districts.

## AI agents (MCP)

[![Claude answering "show me the relevant work history where Rust is used" through the AdamGoodApp MCP, with the 8-bit CV card rendered inline](public/mcp-demo.mp4)](https://adamgoodapp.com/mcp-demo.mp4)

### Try it in Claude

1. Claude → **Settings → Connectors → Add custom connector**, URL `https://adamgoodapp.com/mcp` (no login).
2. Turn the connector on in a chat and ask, e.g. "Using AdamGoodApp mcp, show me the relevant work history where Rust is used."

Claude Desktop without connectors: add `{"mcpServers":{"adamgoodapp":{"command":"npx","args":["-y","mcp-remote","https://adamgoodapp.com/mcp"]}}}` to `claude_desktop_config.json` (text answers only; no card).

The site is callable by AI agents three ways, all built from one set of TanStack AI `toolDefinition`s (`src/mcp/definitions.ts`):

- **Remote MCP server** at **`https://adamgoodapp.com/mcp`** (Streamable HTTP, stateless, no auth). Add it as a custom connector in Claude or ChatGPT, or point the MCP Inspector at it. Tools: `get_profile`, `list_districts`, `get_district_content`, `search_cv`, `list_experience`, `list_skills`, `list_projects`, `get_contact`, `get_site_guide`; resources `cv://profile` and `cv://sections/{district}` (markdown).
- **MCP Apps card.** Six of those tools carry `_meta.ui.resourceUri = ui://adamgoodapp/cv-widget.html`: hosts that support MCP Apps render the answer as the site's own 8-bit CV card inline in the chat (`src/mcp/apps/`, built into one HTML file by `vite.widget.config.ts`; its font loads from `/fonts`).
- **In-page WebMCP tools** on `document.modelContext` for browser agents (native WebMCP, or the MCP-B polyfill and extension): the nine data tools plus city control — `get_city_state`, `focus_district`, `set_view`, `reset_view`, `open_district`, `close_district`, `highlight_district`, `highlight_spot` (ring a landmark or point), `set_time_of_day`, `control_simulation`, `show_message` (a message bubble) and `run_tour` (a guided camera tour with captions) — and city life: `get_city_events` (a news feed the simulation writes, `src/city/events.ts`: fire flare-ups, fire engine runs, bus arrivals, helicopter flights, festivals, plus landmarks) and `stage_event` (fire flare-up, fire engine dispatch, helicopter launch, park festival).

```sh
curl -s https://adamgoodapp.com/mcp -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_profile","arguments":{}}}'
```

## Stack

TanStack Start (React 19, file-based routing, SSR) on Cloudflare Workers · three.js r186 (`three/webgpu`, TSL) · TanStack Store · TanStack AI tool definitions + MCP TypeScript SDK v2 + MCP Apps + MCP-B (WebMCP) · Tailwind CSS v4 · shadcn/ui + 8bitcn/ui · Biome · Vitest · Playwright + axe · lefthook · GitHub Actions.

## Getting started

```sh
corepack enable pnpm
pnpm i
pnpm dev            # http://localhost:3000 (?tier=webgl2|fallback forces a renderer, ?time=day|night pins the clock); MCP at /mcp
pnpm test           # unit + component tests (builds the MCP Apps widget first)
pnpm build && pnpm e2e
pnpm preview & pnpm capture   # re-render public/city.jpg and public/og.jpg
```

## CI/CD

`.github/workflows/ci.yml` runs on every push and pull request:

1. **check** — `biome ci`, `tsc`, Vitest, production build.
2. **e2e** — Playwright (desktop, mobile and fallback specs, axe scan) against `pnpm preview` with SwiftShader.
3. **deploy** — on `main` only: `wrangler deploy` to the `adamgoodapp` Worker, which owns the custom domains `adamgoodapp.com` and `www.adamgoodapp.com` (`www` 301s to the apex).

Required repository secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts edit + zone DNS/Workers Routes edit for `adamgoodapp.com`) and `CLOUDFLARE_ACCOUNT_ID`.

## Project structure

```
src/
  city/          three.js city (framework-free): renderer, camera, input, prefabs
    world/       district builders (downtown, beach, theme park, …)
    sim/         agents: traffic, people, planes, boats, rides, animals
  components/    React HUD, zone card/drawer, agent message bubble, static fallback
  data/          CV content, CV queries, district layout, links
  mcp/           tool definitions, in-page (WebMCP) and remote (/mcp) implementations
    apps/        MCP Apps CV card (single-file widget build)
  routes/        TanStack Start routes (/, /mcp)
  start.ts       request middleware (www → apex)
e2e/             Playwright specs
scripts/         snapshot capture
```

## Credits

[three.js](https://threejs.org) · [shadcn/ui](https://ui.shadcn.com) · [8bitcn/ui](https://www.8bitcn.com) · [Simple Icons](https://simpleicons.org) · [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) by CodeMan38

## License

[MIT](LICENSE)
