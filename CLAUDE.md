# spaceship management sim

A management sim about mining ships on routes between connected star systems. A
ship is a small state machine on its own timer, and the game is meant to work at
the scale of many ships on many routes ticking in parallel, ending at a 4X where
the galaxy can be taken over.

Working name. The game has no title yet, so docs and the README say "spaceship
management sim" until one is picked.

Workflow: story lane (see workflow/WORKFLOW.md in the memory store).
Stories come from /plan-story and are built with /xp-story. Chores go through /next-task.

## Where the design lives

`docs/DESIGN.md` is the premise, and it is short enough to read whole. Read it
before any story work.

`docs/reference/` holds material copied out of the vault. It is background the
design draws on, not rules this game has adopted:

- `x4-ship-classes.md`, the ship-role catalogue from X4: Foundations, which is
  where the system-graph and ship-subclass ideas come from.
- `prior-art-colony-sim.md`, the deleted C++ colony sim this project reuses one
  idea from.

`docs/accepted-tradeoffs.md` is the ledger for review findings accepted as gaps.

## Status

The design is a premise and nothing more. Resources, the economy, combat, fleet
orders and the UI are all undecided, and the code so far decides none of them.

A question that blocks a story is a planning failure, not something to answer in
the code. Stop the story and go back to /plan-story with the client.

## Code invariants

These hold from the first commit, because retrofitting any of them means a
rewrite.

- `sim/` stays UI-free and dependency-free. No DOM access, no imports from
  `app/`, no I/O. It exposes a deterministic `tick(state, dt) -> state`. This is
  what lets the whole economy be tested headlessly, and it is the most important
  structural rule here.
- `sim/` also exposes `makeState(config)`. Fabricating an arbitrary mid-run fleet
  is a testing requirement, not a convenience. Without it, every balance
  observation costs a full playthrough.
- Never `Math.random`. The project owns a seeded PRNG in `sim/`, so a test can
  replay a run exactly. This is a determinism rule and nothing more. Whether the
  galaxy is generated or handcrafted is an open question (`docs/DESIGN.md` §8).
- A ship's behaviour is an explicit state machine (`idle`, `outbound`, `working`,
  `inbound`, `unloading`) with one timer per ship, advanced only by `tick`.
  Rendering reads state and never writes it.
- Timers count sim time, never wall-clock time and never frames. A test has to be
  able to run a thousand game-days in milliseconds.
- Scale is a design constraint, not a later optimisation. `tick` runs over every
  ship every tick, so per-ship work stays small and allocation-free where it can.

## Build and run

```sh
npm install
npm test                 # vitest across workspaces
npm run typecheck
npm run build            # writes dist/index.html, self-contained
npm run dev              # local server with reload
```

`dist/index.html` is the distributable. It opens from the filesystem with no
server and no network access, so a missing inline asset shows up as a blank
canvas rather than an error. Check the browser console when it looks empty.

## CI and the merge gate

The repo is public, so branch protection works: CI produces a required `build`
check and the default branch needs one approving review. A green tick here is the
gate, not just information.

The check runs the tests, not only the build. A build-only gate passes a
simulation that returns wrong numbers.

Never commit to `main`. Branch as `type/short-slug`. The client merges on the PR
page.
