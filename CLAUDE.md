# spaceship-management-sim

`README.md` describes the game.

Working name. There is no title yet.

## Repo layout

- `sim/` the simulation core: state, `tick`, the seeded PRNG. See the invariants below.
- `app/` the canvas renderer and entry point. Imports `sim`, never the reverse.
- `tools/build.mjs` the esbuild driver. `--dev` serves `app/` with live rebuilds; with no flag it bundles and inlines everything into `dist/index.html`, a single file that opens from the filesystem with no server.

## Code invariants

Two rules hold from the first commit, because retrofitting either one means a rewrite.

- `sim/` stays UI-free and dependency-free. No DOM access, no imports from `app/`, no I/O. It exposes a deterministic `tick(state, dt) -> state`. This is what lets the whole simulation be tested headlessly, and it is the most important structural rule here.
- Never `Math.random`. The project owns a seeded PRNG in `sim/`, so a test can replay a run exactly.

## Build and run

Needs Node 22 (`.nvmrc`). `npm install` at the repo root covers both workspaces.

```sh
npm run dev        # serves app/ with live rebuilds
npm run build       # writes dist/index.html
npm run typecheck    # tsc across every workspace
npm test            # vitest across every workspace
```

`bash .claude/pre-pr.sh` runs the same install, typecheck and test steps CI does.

## Conventions

Never commit to `main`. Branch as `type/short-slug`. Merges happen on the PR page.

Never make a check pass by weakening it. If the right fix is unclear, stop and report.

## CI and merge gate

`.github/workflows/ci.yml` runs `npm install`, `npm run typecheck` and `npm test` on every PR and on push to `main`. Its job is named `build`, and that check gates merges once branch protection is on.
