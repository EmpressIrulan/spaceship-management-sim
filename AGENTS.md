# spaceship-management-sim

`README.md` describes the game.

Working name. There is no title yet.

Workflow: story lane. A change to what the game does is planned as a story and accepted by playing it; everything else is a chore.

## Working rules

- Never commit to the default branch. Branch as `type/short-slug`.
- GitHub writes go out as the project's bot account, never the owner's. No co-author trailers, agent footers or session links.
- Merging belongs to Alice, on the PR page. An agent merges only a PR Alice has named in the conversation, and that permission doesn't carry to the next PR or session.
- Never make a check pass by weakening it. If the fix is unclear, stop and report.
- The tracker holds accepted stories and open chores. Review findings go to `docs/accepted-tradeoffs.md` or become a future story, questions get asked in planning, and none of those become issues.
- Repo visibility, force pushes, deleting anything not already merged, and repo settings stay manual.

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

`.github/workflows/ci.yml` runs `npm ci`, `npm run typecheck` and `npm test` on every PR and on push to `main`. It installs with `npm ci` rather than `npm install` so a lockfile that has drifted from `package.json` fails the check instead of being quietly repaired. Its job is named `build`, and that check gates merges once branch protection is on.
