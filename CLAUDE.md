# spaceship-management-sim

`README.md` describes the game. It is the client's brief in the client's words, nothing has been added to it, and nothing should be.

Working name. There is no title yet.

Workflow: story lane (see workflow/WORKFLOW.md in the memory store). Stories come from /plan-story and are built with /xp-story. Chores go through /next-task.

## What is not decided here

Anything the brief does not say gets decided with the client in /plan-story, one story at a time, and that is where the questions get asked. Do not answer them in docs, in comments, or in the code, and do not write a design document.

A question that blocks a story mid-build is a planning failure. Stop the story and go back to /plan-story.

Review findings accepted as gaps rather than fixed go in `docs/accepted-tradeoffs.md`, created by the first PR that has one. Never file a review-findings issue.

## Repo layout

`sim/`, `app/` and `tools/` arrive with the scaffold chore.

```
sim/     the simulation. No UI, no dependencies, tested headlessly.
app/     canvas renderer. Reads sim state, never writes it.
tools/   the build.
```

## Code invariants

These hold from the first commit, because retrofitting any of them means a rewrite.

- `sim/` stays UI-free and dependency-free. No DOM access, no imports from `app/`, no I/O. It exposes a deterministic `tick(state, dt) -> state`. This is what lets the whole economy be tested headlessly, and it is the most important structural rule here.
- `sim/` also exposes `makeState(config)`. Fabricating an arbitrary mid-run fleet is a testing requirement, not a convenience. Without it, every balance observation costs a full playthrough.
- Never `Math.random`. The project owns a seeded PRNG in `sim/`, so a test can replay a run exactly.
- A ship's behaviour is an explicit state machine with one timer per ship, advanced only by `tick`. Rendering reads state and never writes it.
- Timers count sim time, never wall-clock time and never frames. A test has to be able to run a long stretch of sim in milliseconds.
- Scale is a constraint from the start, not a later optimisation. `tick` runs over every ship every tick, so per-ship work stays small.

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

The repo is public, so branch protection works: CI produces a required `build` check and the default branch needs one approving review. A green tick here is the gate, not just information.

The check runs the tests, not only the build. A build-only gate passes a simulation that returns wrong numbers.

Never commit to `main`. Branch as `type/short-slug`. The client merges on the PR page.
