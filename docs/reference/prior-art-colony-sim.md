# Reference: prior art, colony-sim

`EmpressIrulan/colony-sim` was the closest earlier attempt at this kind of game. It
was archived and then deleted once its source had been copied into the vault, where
the full tree still lives as `notes/colony-sim-source.md`. No code is copied here.

## What it was

A colony sim in the Dwarf Fortress and RimWorld line, written in C++:

- `Map` held a 2D vector of `CoordsTile`, each tile carrying an integer type.
- `main.cpp` built a 10x10 map and printed the tile types.
- `Colonist` was a stub with needs (thirst, hunger, sleep) and a position, no
  methods.

There was no game loop and no pathfinding. It stopped before anything moved.

## What carries over

One idea: simulate a lot of small independent agents, each on its own timer, and
let the interesting behaviour come out of their number rather than out of any one
of them being clever. That is §3 of `../DESIGN.md`.

## What does not

- Colonists become ships. Per-agent needs go away, and a ship's only internal
  state is its task and its timer.
- The tile grid becomes a system graph (§2). Free movement across tiles is
  replaced by hops along edges, which removes pathfinding as a problem.
- The C++ and the tile printing are gone. This project is TypeScript with a canvas
  renderer.

## Why the failure mode matters

colony-sim died at the point where a data model existed and nothing ran. That is
the argument for walking-skeleton ordering: get one ship moving on one route end
to end, then add.
