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
a path through a graph.

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

An active economy is wanted. The seed note breaks off mid-sentence here, so nothing
further about it is decided, including whether it is simulated per station or
abstracted into prices. What each system produces, what ships sell and to whom, and
whether prices move are all open.

## 7. Prior art

`colony-sim` is the closest earlier attempt, and `reference/prior-art-colony-sim.md`
records what carries over. In short: keep the idea of simulating many small
independent agents on timers, and drop the colonists and the tile grid.

## 8. Open questions

Not a plan, just the list of things a story will have to settle. These get decided
with the client in /plan-story, one story at a time, from watching the game run.
Anything not answered here and not stated above is open too.

### 8.1 What the player gets

1. Resources. What is mined, what it turns into, and where it is stored.
2. The economy of §6.
3. Standing orders. What a player sets on a ship or fleet, and how a route is
   chosen once there is more than one.
4. Combat, which §5 implies and nothing else mentions.
5. The screens. §4 describes the map view and nothing else.
6. Whether the galaxy is generated per run or handcrafted, and whether a run can
   be saved and resumed at all.
7. Whether time passes while the game is closed. §5 says the player can sit and
   watch the empire grow, which says nothing about what happens when they stop
   watching.

### 8.2 How it works

1. What sets travel time on a route: the edge, the ship, or both. X4 gives every
   hull its own speed, and §3's scale target reads differently if a route's cost
   depends on which ship is flying it.
2. What a ship carries besides its task and its timer. Cargo capacity, speed,
   condition, crew and upgrades are all plausible and none are decided. Every one
   of them adds a number the player has to be shown somewhere.
3. How many ships the game is built to run at once. §3 says many and means it, but
   a target number is what decides whether the sim can afford per-ship allocation.
4. Whether ship types exist at all, or whether one hull does everything until a
   story says otherwise. `reference/x4-ship-classes.md` is the catalogue if they
   do.

## Log

- 2026-09-22: copied from `notes/spaceship-management-sim.md` in the vault when
  this repo was initialized.
