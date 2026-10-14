# Design notes

How the code is laid out, and why. Written for a player curious about what is under the game, or a new contributor.

See also: [controls.md](controls.md) for everything the game accepts, and the [README](../README.md) for how to run it.

## Two halves

The repo is a small npm workspace with three packages: `sim/`, the simulation; `app/`, everything drawn on screen; and `tools/`, the build script. The split follows one rule: `sim/` never touches the screen. It has no DOM access, no imports from `app/`, and no input or output of any kind. `app/` imports `sim/` through a single file, `sim/src/index.ts`, and never the other way round.

The point is that the whole simulation then runs headless. A test can create a state, call `tick(state, dt)` a thousand times and assert on the result without a browser. Roughly 37 test files sit next to the sim sources and about 38 next to the app sources, all plain Vitest.

The second hard rule is determinism. There is no `Math.random` anywhere in `sim/`. Instead the PRNG is a seeded mulberry32 generator whose state is a plain number stored inside the state itself, advanced by a pure `nextRandom(state)` that returns the value and the new state. A URL parameter seeds it (`?seed=N`, noted as "replays a sector exactly" in `app/src/main.ts`), so the same seed produces the same rocks, hives and world every time.

## The tick

`sim/src/tick.ts` does not step the world at a fixed frame rate. It walks the world event to event: it finds the soonest expiring timer in the whole state (a ship arriving, a module finishing, an asteroid respawning, a ship build completing), advances that far at once, and then settles: it fires everything that just expired and moves each affected ship to its next state. A frame that delivers two seconds of game time applies the intermediate events in order, so nothing depends on frame rate, and leaving the tab in the background and coming back replays exactly what would have happened.

State is rebuilt immutably each tick: the tick works on a draft copy, outputs a new state object, and `app/` holds that new state. The UI regenerates its panels from the state each frame, which also means a paused game keeps its selections, menus and orders working against a frozen world.

## What the sim models

- `model.ts` holds the plain types: ships, stations, orders, materials, and the lists of buildable station and ship modules.
- `state.ts` builds the initial world: the home station, the starting sector, its asteroid field.
- Each ship is a small state machine. `ShipState` is a union of states such as `moving`, `outbound` (heading out to mine), `working` (filling its hold on a timer), `homebound`, `unloading`, `waiting`, `holding`, plus the states for hauling along routes and jumping between sectors. Each state carries a timer; when the timer runs out, `finish()` picks the next state. An order (mine, move, supply a build, haul to a gate) overrides the ship's default behaviour until it is done.
- `orders.ts` resolves player orders; `haul.ts` and `gate-hauling.ts` carry stock along haul routes and to gate ends.
- Stations grow in one place: `station-building.ts` and the queue, placement and geometry files beside it handle the build queue, module construction, and which free slots a new module may take. `dock-packing.ts` packs ships into a Dock's pixel area by bounding box, with no fixed pads, which is what lets six small ships or one big one share the same Dock.
- `fields.ts`, `enemies.ts` and `shields.ts` cover asteroid fields, respawning rocks, bugs, hives and damage.
- `prng.ts` is the seeded generator; `ship.ts` and `motion.ts` turn a ship design into its speed, hold size, mining time and travel times.

## What the app does

`app/` is organised by job rather than by screen, one file per responsibility:

- `main.ts` is the entry point: it sets up the state, installs the input handlers, and runs the frame loop that calls `tick` and then draws.
- `renderer.ts` and the `*-rendering.ts` files draw the world, stations, panels, menus and overlays onto the canvas and HTML panels.
- `input.ts` and the `*-input.ts` files each own one input mode: box selection, click selection, camera (pan and zoom), the context menu, gate placement, map navigation, the speed keys, rename. The event handlers in `main.ts` stay thin by design.
- `panels.ts` and the panel components build the ship, storage and station panels; the read-only parts are rebuilt each frame, but dropdowns and text the player is editing are patched in place instead of replaced, so a panel never eats a click out from under you.
- `shipyard.ts` and `blueprints.ts` are the ship builder and its saved designs (blueprints persist in the browser).

## Building and testing

`tools/build.mjs` is an esbuild driver. `npm run dev` rebuilds `app/` live and serves it with a URL printed to the terminal. `npm run build` bundles everything and inlines the whole bundle into `dist/index.html`, a single file that opens from the filesystem with no server.

`npm run typecheck` runs TypeScript across every workspace, and `npm test` runs the Vitest suites in all of them. CI does the same, which is the gate every PR must pass.
