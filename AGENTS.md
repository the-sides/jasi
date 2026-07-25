<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

# Project: jasi — "Setpiece"

A single-page 3D scene placement editor (built 2026-07-05 on the blank TanStack Start scaffold from the same day). Purpose: drop in primitives or .glb models, arrange them with move/rotate/scale gizmos, then export the transforms as JSON or ready-to-paste React Three Fiber JSX for hardcoding into a real scene.

## App architecture

- `src/routes/index.tsx` — the only page; `ssr: false` (three.js needs WebGL/DOM, so the route renders client-only — this is TanStack Start selective SSR, not `<ClientOnly>`)
- `src/components/editor/SceneEditor.tsx` — the whole editor: R3F `Canvas`, drei `OrbitControls` + `TransformControls` + `Grid`, panels (add palette, object list, inspector), export modal, keyboard shortcuts (G/R/S mode, X snap, D duplicate, Del delete, Esc deselect)
- `src/lib/scene.ts` — pure logic: `SceneObject` type, shared `GEOMETRY_ARGS` (viewport and exported JSX use the same args so pasted code matches), `toSceneJson()` / `toJsx()` generators. Unit-tested in `src/lib/scene.test.ts`
- Scene autosaves to localStorage (`jasi-setpiece-scene-v1`)

Key mechanics/gotchas:
- `TransformControls` mutates the three.js `Group` directly during drag; state is committed on `onMouseUp` (`commitTransform`). Inspector edits flow the other way (state → group props).
- Model files (.glb/.gltf) load via object URLs and are NOT persisted — after reload they render as an amber wireframe placeholder until a file with the same name is re-dropped. Exported JSX references `/models/<fileName>`, so users copy their .glb files into `public/models/`.
- Selection refs live in a `Map<string, Group>`; `selectedNode` is separate React state so `TransformControls` re-attaches when refs mount (see `registerRef`).
- Draco-compressed .glb files pull the decoder from a CDN (drei default) — offline use needs uncompressed models.
- Rotations are radians everywhere except the inspector, which displays degrees.
- Aesthetic: dark "instrument panel" — Spline Sans Mono + Bricolage Grotesque, ember-orange `#ff6a3d` accent, CSS vars in `src/styles.css`. The starter's Header/Footer/ThemeToggle/about were removed; the editor is the whole site.

## How this project was created

Scaffolded with the TanStack CLI (run in a scratch directory, then merged here since the target directory had to be the project root, not a new subdirectory):

```
npx @tanstack/cli@latest create my-tanstack-app --agent --package-manager pnpm --tailwind
```

Notes from that run:
- The `--tailwind` flag is deprecated and ignored — Tailwind (v4) is always included in TanStack Start scaffolds.
- The CLI's own `pnpm install`, `pnpm dlx @tanstack/intent install --map`, and `pnpm generate-routes` steps failed during scaffolding and were run manually afterward.

Follow-up TanStack Intent commands run after scaffolding:

```
npx @tanstack/intent@latest install   # created the Skill Loading block above
npx @tanstack/intent@latest list      # 9 intent-enabled packages, 31 skills
```

## Stack

- **Framework**: TanStack Start (`@tanstack/react-start`) on React 19
- **Routing**: TanStack Router, file-based routes in `src/routes/` with generated `src/routeTree.gen.ts`
- **Styling**: Tailwind CSS v4 (via `@tailwindcss/vite`), global styles in `src/styles.css`
- **Build**: Vite 8 (default CLI toolchain — kept as generated)
- **Testing**: Vitest + Testing Library + jsdom (`pnpm test`)
- **Icons**: lucide-react
- **Devtools**: TanStack Devtools (`@tanstack/devtools-vite` strips them from production builds)
- **Package manager**: pnpm (v11). pnpm is not globally installed on this machine — use `npx -y pnpm@latest <cmd>` or install it globally.

No database, auth, API layer, or deployment adapter is configured.

## Scripts

- `pnpm dev` — dev server on port 3000
- `pnpm build` — production build (client + SSR to `dist/`); verified working
- `pnpm preview` — preview production build
- `pnpm test` — run vitest
- `pnpm generate-routes` — regenerate `src/routeTree.gen.ts` (`tsr generate`); the Vite plugin also does this automatically during dev

## Project structure (generated — preserve unless there's a clear reason to change)

- `src/router.tsx` — router factory (`getRouter()`)
- `src/routes/__root.tsx` — root route / document shell (HeadContent, Scripts, devtools)
- `src/routes/index.tsx` — the editor page (the starter's about/Header/Footer were removed)
- `src/components/editor/` — editor components
- `src/routeTree.gen.ts` — generated; never edit by hand
- `tsr.config.json` — router codegen config
- `.cta.json` — TanStack CLI metadata (records template/add-on choices for future CLI runs)
- `package.json` `imports` field maps `#/*` → `./src/*` (use `#/` for internal imports)

## Environment variables

None required. When adding some:
- Client-exposed vars must be prefixed `VITE_` (accessed via `import.meta.env`)
- Server-only vars go through `process.env` inside server functions / server routes (see the `start-core/execution-model` Intent skill)

## Key decisions & gotchas

- Package renamed from `my-tanstack-app` to `jasi` to match the directory.
- pnpm 11 no longer reads `pnpm.onlyBuiltDependencies` from `package.json`; that setting was moved to `pnpm-workspace.yaml` (`onlyBuiltDependencies: esbuild, lightningcss`).
- Git repo was initialized by the CLI; no commits have been made yet.
- Tests live next to source (`src/lib/scene.test.ts`); `pnpm test` runs vitest.
- Dependencies on `latest` (`@tanstack/react-start`, `@tanstack/react-router`, etc.) are how the CLI pins them; consider pinning to caret ranges before production use.

## Deployment

Not configured. TanStack Start deploys to Vercel, Cloudflare Workers, Netlify, Node/Docker, Bun, etc. — load the `@tanstack/start-client-core#start-core/deployment` Intent skill before wiring up a target.

## Next steps (suggestions, not commitments)

- Make an initial git commit
- Pin `latest` dependencies
- Add real routes/features as needed (load the matching Intent skill first)
