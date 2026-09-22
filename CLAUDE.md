# spaceship-management-sim

`README.md` describes the game.

Working name. There is no title yet.

## Code invariants

Two rules hold from the first commit, because retrofitting either one means a rewrite.

- `sim/` stays UI-free and dependency-free. No DOM access, no imports from `app/`, no I/O. It exposes a deterministic `tick(state, dt) -> state`. This is what lets the whole simulation be tested headlessly, and it is the most important structural rule here.
- Never `Math.random`. The project owns a seeded PRNG in `sim/`, so a test can replay a run exactly.

## Conventions

Never commit to `main`. Branch as `type/short-slug`. Merges happen on the PR page.

Never make a check pass by weakening it. If the right fix is unclear, stop and report.
