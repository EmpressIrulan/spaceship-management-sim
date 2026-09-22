# Design premise

This is the whole design. It is a premise captured from a chat seed idea on
2026-09-20, not a spec, and everything it does not say is open.

TODO: the game has no title. Docs use "spaceship management sim" as a working
name until one is picked.

## 1. The core loop

A ship is sent to mine. It travels to the nearest asteroid, a timer runs while its
cargo fills, then a return timer runs while it flies back and unloads.

That is the unit of play. A ship is a small state machine (idle, travelling out,
working, travelling back, unloading) ticking against its own timer.

## 2. Systems are a graph, not a map

Systems connect to each other the way X4's sectors do. A ship's route is a hop
between connected systems rather than free movement on an open map, so a route is
a path through a graph and travel time is a property of the edge taken.

`reference/x4-ship-classes.md` is the X4 material this draws on.

## 3. Scale is the point

One ship on one route barely produces or sells anything. The game is meant to work
at scale: many ships on many routes running in parallel, each ticking against its
own timer.

This is a constraint on how the sim is written, not a target for later. A design
that only reads well with five ships is the wrong design.

## 4. Presentation

Pixel sprites, small movement animations, and timers. The animations are driven by
the ship state machines rather than the other way round, so the sim decides what
is happening and the renderer only shows it.

## 5. Where it ends up

A 4X where the galaxy can be taken over if the player wants to. Bannerlord, but
with individual standing orders for fleets and ships. After some setup it should
run like X4, where the player can sit and watch most of an empire grow slowly.

## 6. The economy

An active economy is wanted, simulated rather than abstracted into a price table.
The seed note breaks off mid-sentence here, so nothing further about it is
decided. What each system produces, what ships sell and to whom, and whether
prices move are all open questions.

## 7. Prior art

`colony-sim` is the closest earlier attempt, and `reference/prior-art-colony-sim.md`
records what carries over. In short: keep the idea of simulating many small
independent agents on timers, and drop the colonists and the tile grid.

## 8. Open questions

Not a plan, just the list of things a story will have to settle. These get decided
with the client in /plan-story, one story at a time, from watching the game run.

1. Resources. What is mined, what it turns into, and where it is stored.
2. The economy of §6.
3. Standing orders. What a player sets on a ship or fleet, and how a route is
   chosen once there is more than one.
4. Combat, which §5 implies and nothing else mentions.
5. The screens. §4 describes the map view and nothing else.

## Log

- 2026-09-22: copied from `notes/spaceship-management-sim.md` in the vault when
  this repo was initialized.
