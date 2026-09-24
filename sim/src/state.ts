import { travelSeconds } from "./motion";
import { createPrng } from "./prng";

// Placeholder tuning. The client asked for the first cut to run four times
// slower, which puts one cycle at roughly 35 to 50 seconds. Ship speed lives
// in motion.ts.
export const WORKING_SECONDS = 12;
export const UNLOADING_SECONDS = 6;
export const CARGO_PER_TRIP = 10;
export const ASTEROID_MIN_DISTANCE = 200;
export const ASTEROID_MAX_DISTANCE = 400;

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

export type ShipState = "outbound" | "working" | "homebound" | "unloading";

export interface Ship {
  state: ShipState;
  position: Vec;
  // Seconds left in the current state.
  timer: number;
  cargo: number;
}

export interface Station {
  position: Vec;
  size: Size;
  inventory: number;
}

export interface Asteroid {
  position: Vec;
  size: Size;
}

export interface SimState {
  tickCount: number;
  station: Station;
  asteroid: Asteroid;
  ships: Ship[];
}

export function createInitialState(seed: number): SimState {
  const random = createPrng(seed);
  const angle = random() * 2 * Math.PI;
  const distance =
    ASTEROID_MIN_DISTANCE + random() * (ASTEROID_MAX_DISTANCE - ASTEROID_MIN_DISTANCE);

  const stationPosition = { x: 0, y: 0 };
  return {
    tickCount: 0,
    station: { position: stationPosition, size: STATION_SIZE, inventory: 0 },
    asteroid: {
      position: {
        x: stationPosition.x + Math.cos(angle) * distance,
        y: stationPosition.y + Math.sin(angle) * distance,
      },
      size: ASTEROID_SIZE,
    },
    ships: [
      {
        state: "outbound",
        position: { ...stationPosition },
        timer: travelSeconds(distance),
        cargo: 0,
      },
    ],
  };
}
