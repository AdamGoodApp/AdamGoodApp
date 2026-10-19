<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `npx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `npx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

## Repository layout

- `src/city/` — the three.js city (renderer, camera, input, world builders, simulation). Framework-free: no React imports.
- `src/components/` — the React HUD (identity card, hover label, zone card/drawer, nav buttons, static fallback). 8bitcn components live in `src/components/ui/8bit/` and are generated (linting disabled there).
- `src/data/` — CV content (`cv.ts`), district geometry (`zones.ts`) and links; the single source of truth for both three.js and React.
- `e2e/` — Playwright specs (run against `pnpm preview`, so `pnpm build` first).
- `scripts/` — `capture-fallback.mjs` renders `public/city.jpg` and `public/og.jpg`.
- Checks: `pnpm check && pnpm typecheck && pnpm test`; `pnpm build && pnpm e2e`.
