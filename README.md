# spaceship management sim

A management sim about mining ships on routes between connected star systems. Send
a ship to mine and it hops out to an asteroid, fills its hold on a timer, flies
back and unloads. One ship earns almost nothing. The game is many of them running
at once while you set standing orders and watch.

Pixel sprites, small movement animations, and an empire that grows slowly while you
watch it.

Status: no game yet. `docs/DESIGN.md` is the premise, and the repo is being built
one playable slice at a time.

Working name. It has no title yet.

## Running it

Needs Node 22.

```sh
npm install
npm run dev      # then open the printed URL
```

`npm run build` writes `dist/index.html`, one self-contained file that opens from
the filesystem with no server.

## Repo layout

```
sim/     the simulation. No UI, no dependencies, tested headlessly.
app/     canvas renderer. Reads sim state, never writes it.
tools/   the build.
docs/    the design premise and the reference material behind it.
```

`CLAUDE.md` holds the conventions, for agents and people alike.
