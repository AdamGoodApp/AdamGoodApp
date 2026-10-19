# Adam Rais · AdamGoodApp

Senior Full-Stack Engineer in Tokyo — TypeScript, React/TanStack, three.js, AI/LLM systems.

[![CI](https://github.com/AdamGoodApp/AdamGoodApp/actions/workflows/ci.yml/badge.svg)](https://github.com/AdamGoodApp/AdamGoodApp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020?logo=cloudflare&logoColor=white)
![three.js WebGPU](https://img.shields.io/badge/three.js-WebGPU-000?logo=threedotjs)

[![The AdamGoodApp city](public/city.jpg)](https://adamgoodapp.com)

**→ [adamgoodapp.com](https://adamgoodapp.com)**

## What it is

My CV as a living, low-poly isometric city. Every district is a chapter of my career: hover one to outline it, click it to read that section. Cars, buses and a tram run the roads, residents walk out of their houses, planes take off, boats sail past the lighthouse, and an "AdamGoodApp" sign sits on the hill in the middle. LinkedIn, GitHub and email are in the bottom-right corner.

## Districts → CV

| District | CV section |
| --- | --- |
| Downtown | Experience: Tofu, U-NEXT, Synspective |
| The Peaks | FATMAP (3D mapping, Berlin) |
| Farmland | Roots: Automata Technologies, education |
| Shop Street | Technical skills |
| The Beach | About me, languages, contact |
| Fun Park | Open-source projects |
| Suburbs | Off the clock |

## How the city is built

- **Procedural everything.** No models or textures are downloaded: every building, tree, vehicle and animal is a prefab built from boxes, cylinders and cones (`src/city/prefabs.ts`) and painted with vertex colours.
- **One static mesh.** All scenery is merged into a single geometry with one material, so the whole island is one draw call.
- **Instanced agents.** Each kind of moving thing (cars, people, gulls, gondolas, …) is one `InstancedMesh`; the whole frame stays within a ~45 draw-call budget.
- **Fixed-step simulation.** Agents update at 60 Hz independent of the display rate (`src/city/world.ts`).
- **WebGPU first.** three.js `WebGPURenderer` runs on WebGPU and falls back to its WebGL2 backend; the ocean is a TSL node material. Without either, a static snapshot with the same links and an accessible text CV is shown.
- **Respectful.** `prefers-reduced-motion` freezes the simulation, hidden tabs pause it, and the full CV is server-rendered for screen readers and crawlers. Keyboard users get a district menu on the first <kbd>Tab</kbd>.

## Stack

TanStack Start (React 19, file-based routing, SSR) on Cloudflare Workers · three.js r186 (`three/webgpu`, TSL) · TanStack Store · Tailwind CSS v4 · shadcn/ui + 8bitcn/ui · Biome · Vitest · Playwright + axe · lefthook · GitHub Actions.

## Getting started

```sh
corepack enable pnpm
pnpm i
pnpm dev            # http://localhost:3000 (?tier=webgl2 or ?tier=fallback to force a tier)
pnpm test           # unit + component tests
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
  components/    React HUD, zone card/drawer, static fallback
  data/          CV content, district layout, links
  routes/        TanStack Start routes
  start.ts       request middleware (www → apex)
e2e/             Playwright specs
scripts/         snapshot capture
```

## Credits

[three.js](https://threejs.org) · [shadcn/ui](https://ui.shadcn.com) · [8bitcn/ui](https://www.8bitcn.com) · [Simple Icons](https://simpleicons.org) · [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) by CodeMan38

## License

[MIT](LICENSE)
