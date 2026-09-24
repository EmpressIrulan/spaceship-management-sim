import { describe, expect, it } from "vitest";
import { tick } from "./tick";
import {
  ASTEROID_SIZE,
  CARGO_PER_TRIP,
  SHIP_SIZE,
  UNLOADING_SECONDS,
  WORKING_SECONDS,
  createInitialState,
  type SimState,
  type Vec,
} from "./state";
import { travelSeconds } from "./motion";

function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function legSeconds(state: SimState): number {
  return travelSeconds(distance(state.station.position, state.asteroid.position));
}

function cycleSeconds(state: SimState): number {
  return 2 * legSeconds(state) + WORKING_SECONDS + UNLOADING_SECONDS;
}

// Steps at roughly 60fps, the way the renderer drives the sim.
function run(state: SimState, seconds: number, dt = 1 / 60): SimState {
  let next = state;
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    next = tick(next, Math.min(dt, seconds - t));
  }
  return next;
}

describe("initial state", () => {
  it("puts the station at a fixed position whatever the seed", () => {
    expect(createInitialState(1).station.position).toEqual(
      createInitialState(2).station.position,
    );
  });

  it("places the asteroid from the seed, so the same seed replays the same sector", () => {
    expect(createInitialState(42).asteroid.position).toEqual(
      createInitialState(42).asteroid.position,
    );
    expect(createInitialState(1).asteroid.position).not.toEqual(
      createInitialState(2).asteroid.position,
    );
  });

  it("starts one ship at the station with an empty station inventory", () => {
    const state = createInitialState(7);
    expect(state.ships).toHaveLength(1);
    expect(state.ships[0]?.position).toEqual(state.station.position);
    expect(state.station.inventory).toBe(0);
  });
});

describe("sizes", () => {
  it("draws the mining ship smaller than the first cut (14 by 10)", () => {
    expect(SHIP_SIZE.width).toBeLessThan(14);
    expect(SHIP_SIZE.height).toBeLessThan(10);
  });

  it("makes the asteroid only a couple of units bigger than the ship", () => {
    for (const [asteroid, ship] of [
      [ASTEROID_SIZE.width, SHIP_SIZE.width],
      [ASTEROID_SIZE.height, SHIP_SIZE.height],
    ] as const) {
      expect(asteroid - ship).toBeGreaterThanOrEqual(1);
      expect(asteroid - ship).toBeLessThanOrEqual(4);
    }
  });
});

describe("mining cycle", () => {
  it("flies the ship toward the asteroid with no input", () => {
    const start = createInitialState(7);
    const later = run(start, legSeconds(start) / 2);
    const ship = later.ships[0]!;

    expect(ship.state).toBe("outbound");
    expect(distance(ship.position, start.asteroid.position)).toBeLessThan(
      distance(start.station.position, start.asteroid.position),
    );
  });

  it("eases out of the station, cruises, and eases into the asteroid", () => {
    const start = createInitialState(7);
    const leg = legSeconds(start);
    const covered = (from: number, to: number) =>
      distance(run(start, from).ships[0]!.position, run(start, to).ships[0]!.position);

    const takeoff = covered(0, 0.5);
    const cruise = covered(leg / 2 - 0.25, leg / 2 + 0.25);
    const landing = covered(leg - 0.5, leg);
    expect(takeoff).toBeLessThan(cruise * 0.6);
    expect(landing).toBeLessThan(cruise * 0.6);
  });

  it("mines for twelve seconds, four times the first cut, then heads back", () => {
    expect(WORKING_SECONDS).toBe(12);
    const start = createInitialState(7);
    const nearlyDone = run(start, legSeconds(start) + 11.5);
    expect(nearlyDone.ships[0]?.state).toBe("working");
    expect(nearlyDone.ships[0]?.position).toEqual(start.asteroid.position);

    const leaving = run(nearlyDone, 1);
    expect(leaving.ships[0]?.state).toBe("homebound");
    expect(leaving.ships[0]?.cargo).toBe(CARGO_PER_TRIP);
  });

  it("fills the cargo hold gradually while mining", () => {
    const start = createInitialState(7);
    const halfway = run(start, legSeconds(start) + WORKING_SECONDS / 2 + 0.01);
    expect(halfway.ships[0]?.cargo).toBe(CARGO_PER_TRIP / 2);
  });

  it("takes time to unload, moving cargo into the station as it goes", () => {
    const start = createInitialState(7);
    const docked = 2 * legSeconds(start) + WORKING_SECONDS;

    const midUnload = run(start, docked + UNLOADING_SECONDS / 2 + 0.01);
    expect(midUnload.ships[0]?.state).toBe("unloading");
    expect(midUnload.ships[0]?.position).toEqual(start.station.position);
    expect(midUnload.ships[0]?.cargo).toBe(CARGO_PER_TRIP / 2);
    expect(midUnload.station.inventory).toBe(CARGO_PER_TRIP / 2);
  });

  it("banks the full load once unloaded and immediately sets off again", () => {
    const start = createInitialState(7);
    const next = run(start, cycleSeconds(start) + 0.1);

    expect(next.station.inventory).toBe(CARGO_PER_TRIP);
    expect(next.ships[0]?.state).toBe("outbound");
    expect(next.ships[0]?.cargo).toBe(0);
  });

  it("counts every completed cycle, however the time is sliced", () => {
    const start = createInitialState(7);
    const seconds = 3 * cycleSeconds(start) + 0.1;

    expect(run(start, seconds).station.inventory).toBe(3 * CARGO_PER_TRIP);
    // One big step, as after a backgrounded tab resumes.
    expect(tick(start, seconds).station.inventory).toBe(3 * CARGO_PER_TRIP);
  });

  it("gets through at least two full cycles within two minutes for any seed", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const state = run(createInitialState(seed), 120, 0.1);
      expect(state.station.inventory).toBeGreaterThanOrEqual(2 * CARGO_PER_TRIP);
    }
  });

  it("does not mutate the state it was given", () => {
    const start = createInitialState(7);
    const snapshot = JSON.parse(JSON.stringify(start)) as SimState;
    tick(start, cycleSeconds(start));
    expect(start).toEqual(snapshot);
  });
});
