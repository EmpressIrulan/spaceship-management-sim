import { travelSeconds } from "./motion";
import { nextRandom } from "./prng";

// Placeholder tuning. The client asked for the first cut to run four times
// slower, which puts one cycle at roughly 35 to 50 seconds. Ship speed lives
// in motion.ts.
export const WORKING_SECONDS = 12;
export const UNLOADING_SECONDS = 6;
export const CARGO_PER_TRIP = 10;
export const ASTEROID_MIN_DISTANCE = 200;
export const ASTEROID_MAX_DISTANCE = 400;
export const ASTEROID_COUNT = 4;
// Three full trips per asteroid.
export const ASTEROID_ORE = 30;
// Placeholder, to tune at the demo.
export const RESPAWN_SECONDS = 30;
// Keeps asteroids from landing on top of each other, or a respawn from landing
// where the last one ran out. About three asteroid widths.
export const ASTEROID_MIN_SPACING = 40;

export const STATION_SIZE = { width: 60, height: 60 };
// The mining ship is meant to be the smallest ship class.
export const SHIP_SIZE = { width: 10, height: 7 };
export const ASTEROID_SIZE = { width: 13, height: 10 };

export interface Vec {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

// "idle" means waiting at the station because no asteroid has ore.
export type ShipState = "idle" | "outbound" | "working" | "homebound" | "unloading";

export interface Target {
  asteroidId: number;
  // Where the ship mines from. Kept on the ship so it can fly home after the
  // asteroid has been mined out and removed.
  site: Vec;
}

export interface Ship {
  state: ShipState;
  position: Vec;
  // Seconds left in the current state. Unused while idle.
  timer: number;
  cargo: number;
  target: Target | null;
}

export interface Station {
  position: Vec;
  size: Size;
  inventory: number;
}

export interface Asteroid {
  id: number;
  position: Vec;
  size: Size;
  ore: number;
}

export interface Respawn {
  // Seconds until a new asteroid appears.
  timer: number;
  // Where the emptied asteroid was, so the new one lands somewhere else.
  lastPosition: Vec;
}

export interface SimState {
  tickCount: number;
  // PRNG state, carried here so respawn spots replay exactly from the seed.
  rng: number;
  nextAsteroidId: number;
  station: Station;
  asteroids: Asteroid[];
  respawns: Respawn[];
  ships: Ship[];
}

function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// A random spot in the band around the station, re-rolled a few times if it
// lands too close to anything in `avoid`.
export function placeAsteroid(
  rng: number,
  station: Vec,
  avoid: Vec[],
): { position: Vec; rng: number } {
  let position: Vec = station;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const angle = nextRandom(rng);
    const band = nextRandom(angle.state);
    rng = band.state;
    const d =
      ASTEROID_MIN_DISTANCE + band.value * (ASTEROID_MAX_DISTANCE - ASTEROID_MIN_DISTANCE);
    position = {
      x: station.x + Math.cos(angle.value * 2 * Math.PI) * d,
      y: station.y + Math.sin(angle.value * 2 * Math.PI) * d,
    };
    if (avoid.every((other) => distance(other, position) >= ASTEROID_MIN_SPACING)) break;
  }
  return { position, rng };
}

// The asteroid with ore left that is closest to the station, or null.
export function nearestWithOre(station: Vec, asteroids: Asteroid[]): Asteroid | null {
  let best: Asteroid | null = null;
  for (const asteroid of asteroids) {
    if (asteroid.ore <= 0) continue;
    if (!best || distance(station, asteroid.position) < distance(station, best.position)) {
      best = asteroid;
    }
  }
  return best;
}

// Sends a ship waiting at the station to the nearest asteroid with ore, or
// leaves it idle if there is none.
export function depart(ship: Ship, station: Vec, asteroids: Asteroid[]): Ship {
  const asteroid = nearestWithOre(station, asteroids);
  if (!asteroid) {
    return { ...ship, state: "idle", position: { ...station }, timer: 0, cargo: 0, target: null };
  }
  const site = { ...asteroid.position };
  return {
    ...ship,
    state: "outbound",
    position: { ...station },
    timer: travelSeconds(distance(station, site)),
    cargo: 0,
    target: { asteroidId: asteroid.id, site },
  };
}

export function createInitialState(seed: number): SimState {
  const stationPosition = { x: 0, y: 0 };
  let rng = seed >>> 0;
  const asteroids: Asteroid[] = [];
  for (let id = 0; id < ASTEROID_COUNT; id += 1) {
    const placed = placeAsteroid(
      rng,
      stationPosition,
      asteroids.map((a) => a.position),
    );
    rng = placed.rng;
    asteroids.push({ id, position: placed.position, size: ASTEROID_SIZE, ore: ASTEROID_ORE });
  }

  const idle: Ship = {
    state: "idle",
    position: { ...stationPosition },
    timer: 0,
    cargo: 0,
    target: null,
  };
  return {
    tickCount: 0,
    rng,
    nextAsteroidId: ASTEROID_COUNT,
    station: { position: stationPosition, size: STATION_SIZE, inventory: 0 },
    asteroids,
    respawns: [],
    ships: [depart(idle, stationPosition, asteroids)],
  };
}
