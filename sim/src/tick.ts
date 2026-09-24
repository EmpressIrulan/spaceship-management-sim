import { distanceAlong, travelSeconds } from "./motion";
import {
  CARGO_PER_TRIP,
  UNLOADING_SECONDS,
  WORKING_SECONDS,
  type Ship,
  type SimState,
  type Vec,
} from "./state";

interface Route {
  station: Vec;
  asteroid: Vec;
  length: number;
  legSeconds: number;
}

function pointAlong(from: Vec, to: Vec, route: Route, elapsed: number): Vec {
  const fraction = distanceAlong(route.length, elapsed) / route.length;
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

// Cargo moves in whole units, in step with how far through the timer the ship is.
function unitsDone(timer: number, duration: number): number {
  return Math.floor(CARGO_PER_TRIP * (1 - timer / duration) + 1e-9);
}

// Moves a ship partway through its current state, leaving `timer` seconds.
function progress(ship: Ship, timer: number, route: Route): { ship: Ship; banked: number } {
  switch (ship.state) {
    case "outbound":
      return {
        ship: {
          ...ship,
          timer,
          position: pointAlong(route.station, route.asteroid, route, route.legSeconds - timer),
        },
        banked: 0,
      };
    case "homebound":
      return {
        ship: {
          ...ship,
          timer,
          position: pointAlong(route.asteroid, route.station, route, route.legSeconds - timer),
        },
        banked: 0,
      };
    case "working":
      return { ship: { ...ship, timer, cargo: unitsDone(timer, WORKING_SECONDS) }, banked: 0 };
    case "unloading": {
      const cargo = CARGO_PER_TRIP - unitsDone(timer, UNLOADING_SECONDS);
      return { ship: { ...ship, timer, cargo }, banked: ship.cargo - cargo };
    }
  }
}

// Moves a ship into its next state, with that state's full timer.
function finish(ship: Ship, route: Route): { ship: Ship; banked: number } {
  switch (ship.state) {
    case "outbound":
      return {
        ship: { ...ship, state: "working", position: { ...route.asteroid }, timer: WORKING_SECONDS, cargo: 0 },
        banked: 0,
      };
    case "working":
      return {
        ship: { ...ship, state: "homebound", timer: route.legSeconds, cargo: CARGO_PER_TRIP },
        banked: 0,
      };
    case "homebound":
      return {
        ship: { ...ship, state: "unloading", position: { ...route.station }, timer: UNLOADING_SECONDS },
        banked: 0,
      };
    case "unloading":
      return {
        ship: { ...ship, state: "outbound", timer: route.legSeconds, cargo: 0 },
        banked: ship.cargo,
      };
  }
}

// Spends the whole of dt, carrying leftover time into the next state so a
// large step (a tab coming back from the background) completes every cycle it
// covers rather than just one.
function advanceShip(start: Ship, route: Route, dt: number): { ship: Ship; banked: number } {
  let ship = start;
  let banked = 0;
  let remaining = dt;

  while (remaining > 0) {
    let step: { ship: Ship; banked: number };
    if (ship.timer > remaining) {
      step = progress(ship, ship.timer - remaining, route);
      remaining = 0;
    } else {
      remaining -= ship.timer;
      step = finish(ship, route);
    }
    ship = step.ship;
    banked += step.banked;
  }

  return { ship, banked };
}

export function tick(state: SimState, dt: number): SimState {
  const station = state.station.position;
  const asteroid = state.asteroid.position;
  const length = Math.hypot(asteroid.x - station.x, asteroid.y - station.y);
  const route: Route = { station, asteroid, length, legSeconds: travelSeconds(length) };

  let banked = 0;
  const ships = state.ships.map((ship) => {
    const result = advanceShip(ship, route, dt);
    banked += result.banked;
    return result.ship;
  });

  return {
    ...state,
    tickCount: state.tickCount + 1,
    station: { ...state.station, inventory: state.station.inventory + banked },
    ships,
  };
}
