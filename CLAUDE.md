# spaceship-management-sim

`README.md` describes the game. Nothing has been added to it, and nothing should be.

Working name. There is no title yet.

Anything the README does not say is not decided. Do not write an answer into docs, into comments, or into the code, and do not add a design document. Ask instead.

## Repo layout

`sim/`, `app/` and `tools/` do not exist yet. They arrive with the first code.

```
sim/     the simulation. No UI, no dependencies, tested headlessly.
app/     canvas renderer. Reads sim state, never writes it.
tools/   the build.
```

## Code invariants

Two rules hold from the first commit, because retrofitting either one means a rewrite.

- `sim/` stays UI-free and dependency-free. No DOM access, no imports from `app/`, no I/O. It exposes a deterministic `tick(state, dt) -> state`. This is what lets the whole simulation be tested headlessly, and it is the most important structural rule here.
- Never `Math.random`. The project owns a seeded PRNG in `sim/`, so a test can replay a run exactly.

Everything else about the shape of the code is open, and gets settled by the slice that needs it settled.

## Build and run

```sh
npm install
npm test                 # vitest across workspaces
npm run typecheck
npm run build            # writes dist/index.html, self-contained
npm run dev              # local server with reload
```

`dist/index.html` opens from the filesystem with no server and no network access, so a missing inline asset shows up as a blank canvas rather than an error. Check the browser console when it looks empty.

## CI and the merge gate

The repo is public, so branch protection works: CI produces a required `build` check and `main` needs one approving review. A green tick is the gate, not just information.

The check runs the tests, not only the build. A build-only gate passes a simulation that returns wrong numbers.

Never commit to `main`. Branch as `type/short-slug`. Merges happen on the PR page.
