import { distanceAlong, travelSeconds } from "./motion";
import {
  ASTEROID_ORE,
  ASTEROID_SIZE,
  CARGO_PER_TRIP,
  RESPAWN_SECONDS,
  UNLOADING_SECONDS,
  WORKING_SECONDS,
  depart,
  placeAsteroid,
  type Asteroid,
  type Ship,
  type SimState,
  type Vec,
} from "./state";

interface Route {
  station: Vec;
  site: Vec;
  length: number;
  legSeconds: number;
}

function routeOf(ship: Ship, station: Vec): Route | null {
  if (!ship.target) return null;
  const site = ship.target.site;
  const length = Math.hypot(site.x - station.x, site.y - station.y);
  return { station, site, length, legSeconds: travelSeconds(length) };
}

function pointAlong(from: Vec, to: Vec, route: Route, elapsed: number): Vec {
  const fraction = distanceAlong(route.length, elapsed) / route.length;
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

// Cargo moves in whole units, in step with how far through the timer the ship is.
function unitsDone(timer: number, duration: number): number {
  return Math.floor(CARGO_PER_TRIP * (1 - timer / duration) + 1e-9);
}

// Mutable copy of the parts of SimState that one tick changes. Built fresh
// from the input, so the caller's state is never touched.
interface Draft {
  rng: number;
  nextAsteroidId: number;
  station: Vec;
  inventory: number;
  asteroids: Asteroid[];
  respawns: SimState["respawns"];
  ships: Ship[];
}

// Takes ore from the asteroid a ship is mining, removing the asteroid and
// queueing its replacement once it is empty.
function mine(draft: Draft, ship: Ship, units: number): void {
  if (units <= 0 || !ship.target) return;
  const id = ship.target.asteroidId;
  const asteroid = draft.asteroids.find((a) => a.id === id);
  if (!asteroid) return;
  const ore = asteroid.ore - units;
  if (ore > 0) {
    draft.asteroids = draft.asteroids.map((a) => (a.id === id ? { ...a, ore } : a));
    return;
  }
  draft.asteroids = draft.asteroids.filter((a) => a.id !== id);
  draft.respawns = [...draft.respawns, { timer: RESPAWN_SECONDS, lastPosition: asteroid.position }];
}

// Moves a ship partway through its current state, leaving `timer` seconds.
function progress(draft: Draft, ship: Ship, timer: number): Ship {
  const route = routeOf(ship, draft.station);
  switch (ship.state) {
    case "idle":
      return ship;
    case "outbound":
      return {
        ...ship,
        timer,
        position: route
          ? pointAlong(route.station, route.site, route, route.legSeconds - timer)
          : ship.position,
      };
    case "homebound":
      return {
        ...ship,
        timer,
        position: route
          ? pointAlong(route.site, route.station, route, route.legSeconds - timer)
          : ship.position,
      };
    case "working": {
      const cargo = unitsDone(timer, WORKING_SECONDS);
      mine(draft, ship, cargo - ship.cargo);
      return { ...ship, timer, cargo };
    }
    case "unloading": {
      const cargo = CARGO_PER_TRIP - unitsDone(timer, UNLOADING_SECONDS);
      draft.inventory += ship.cargo - cargo;
      return { ...ship, timer, cargo };
    }
  }
}

// Moves a ship whose timer has run out into its next state.
function finish(draft: Draft, ship: Ship): Ship {
  const route = routeOf(ship, draft.station);
  switch (ship.state) {
    case "idle":
      return depart(ship, draft.station, draft.asteroids);
    case "outbound":
      return {
        ...ship,
        state: "working",
        position: route ? { ...route.site } : ship.position,
        timer: WORKING_SECONDS,
        cargo: 0,
      };
    case "working":
      mine(draft, ship, CARGO_PER_TRIP - ship.cargo);
      return {
        ...ship,
        state: "homebound",
        timer: route ? route.legSeconds : 0,
        cargo: CARGO_PER_TRIP,
      };
    case "homebound":
      return { ...ship, state: "unloading", position: { ...draft.station }, timer: UNLOADING_SECONDS };
    case "unloading":
      draft.inventory += ship.cargo;
      return depart({ ...ship, cargo: 0 }, draft.station, draft.asteroids);
  }
}

// Seconds until the next timer anywhere in the sector runs out.
function nextEvent(draft: Draft): number {
  let soonest = Infinity;
  for (const ship of draft.ships) {
    if (ship.state !== "idle") soonest = Math.min(soonest, ship.timer);
  }
  for (const respawn of draft.respawns) soonest = Math.min(soonest, respawn.timer);
  return soonest;
}

function advance(draft: Draft, seconds: number): void {
  draft.respawns = draft.respawns.map((r) => ({ ...r, timer: r.timer - seconds }));
  draft.ships = draft.ships.map((ship) => progress(draft, ship, ship.timer - seconds));
}

// Fires every timer that has reached zero. Respawns go first so a ship that
// becomes free at the same moment can head for the new asteroid.
function settle(draft: Draft): void {
  const due = draft.respawns.filter((r) => r.timer <= 0);
  draft.respawns = draft.respawns.filter((r) => r.timer > 0);
  for (const respawn of due) {
    const placed = placeAsteroid(draft.rng, draft.station, [
      respawn.lastPosition,
      ...draft.asteroids.map((a) => a.position),
    ]);
    draft.rng = placed.rng;
    draft.asteroids = [
      ...draft.asteroids,
      { id: draft.nextAsteroidId, position: placed.position, size: ASTEROID_SIZE, ore: ASTEROID_ORE },
    ];
    draft.nextAsteroidId += 1;
  }
  draft.ships = draft.ships.map((ship) => (ship.timer <= 0 ? finish(draft, ship) : ship));
}

// Steps from one timer running out to the next, so a large dt (a tab coming
// back from the background) plays out every trip and respawn it covers, in
// the order they would have happened.
export function tick(state: SimState, dt: number): SimState {
  const draft: Draft = {
    rng: state.rng,
    nextAsteroidId: state.nextAsteroidId,
    station: state.station.position,
    inventory: state.station.inventory,
    asteroids: state.asteroids,
    respawns: state.respawns,
    ships: state.ships,
  };

  let remaining = dt;
  do {
    const step = Math.min(remaining, nextEvent(draft));
    advance(draft, step);
    remaining -= step;
    settle(draft);
  } while (remaining > 0);

  return {
    ...state,
    tickCount: state.tickCount + 1,
    rng: draft.rng,
    nextAsteroidId: draft.nextAsteroidId,
    station: { ...state.station, inventory: draft.inventory },
    asteroids: draft.asteroids,
    respawns: draft.respawns,
    ships: draft.ships,
  };
}
