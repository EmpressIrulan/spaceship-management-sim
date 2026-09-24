import { describe, expect, it } from "vitest";
import { tick } from "./tick";
import {
  ASTEROID_COUNT,
  ASTEROID_MAX_DISTANCE,
  ASTEROID_MIN_DISTANCE,
  ASTEROID_ORE,
  ASTEROID_SIZE,
  CARGO_PER_TRIP,
  RESPAWN_SECONDS,
  SHIP_SIZE,
  UNLOADING_SECONDS,
  WORKING_SECONDS,
  createInitialState,
  type Asteroid,
  type SimState,
  type Vec,
} from "./state";
import { travelSeconds } from "./motion";

function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function ship(state: SimState) {
  return state.ships[0]!;
}

// The asteroid the ship is currently assigned to.
function target(state: SimState): Asteroid {
  const id = ship(state).target?.asteroidId;
  const asteroid = state.asteroids.find((a) => a.id === id);
  if (!asteroid) throw new Error(`ship has no live target (id ${id})`);
  return asteroid;
}

function nearestWithOre(state: SimState): Asteroid {
  const candidates = state.asteroids.filter((a) => a.ore > 0);
  candidates.sort(
    (a, b) =>
      distance(state.station.position, a.position) - distance(state.station.position, b.position),
  );
  return candidates[0]!;
}

function legSeconds(state: SimState): number {
  return travelSeconds(distance(state.station.position, target(state).position));
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

  it("starts one ship at the station with an empty station inventory", () => {
    const state = createInitialState(7);
    expect(state.ships).toHaveLength(1);
    expect(ship(state).position).toEqual(state.station.position);
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

    expect(ship(later).state).toBe("outbound");
    expect(distance(ship(later).position, target(start).position)).toBeLessThan(
      distance(start.station.position, target(start).position),
    );
  });

  it("eases out of the station, cruises, and eases into the asteroid", () => {
    const start = createInitialState(7);
    const leg = legSeconds(start);
    const covered = (from: number, to: number) =>
      distance(ship(run(start, from)).position, ship(run(start, to)).position);

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
    expect(ship(nearlyDone).state).toBe("working");
    expect(ship(nearlyDone).position).toEqual(target(start).position);

    const leaving = run(nearlyDone, 1);
    expect(ship(leaving).state).toBe("homebound");
    expect(ship(leaving).cargo).toBe(CARGO_PER_TRIP);
  });

  it("fills the cargo hold gradually while mining", () => {
    const start = createInitialState(7);
    const halfway = run(start, legSeconds(start) + WORKING_SECONDS / 2 + 0.01);
    expect(ship(halfway).cargo).toBe(CARGO_PER_TRIP / 2);
  });

  it("takes time to unload, moving cargo into the station as it goes", () => {
    const start = createInitialState(7);
    const docked = 2 * legSeconds(start) + WORKING_SECONDS;

    const midUnload = run(start, docked + UNLOADING_SECONDS / 2 + 0.01);
    expect(ship(midUnload).state).toBe("unloading");
    expect(ship(midUnload).position).toEqual(start.station.position);
    expect(ship(midUnload).cargo).toBe(CARGO_PER_TRIP / 2);
    expect(midUnload.station.inventory).toBe(CARGO_PER_TRIP / 2);
  });

  it("banks the full load once unloaded and immediately sets off again", () => {
    const start = createInitialState(7);
    const next = run(start, cycleSeconds(start) + 0.1);

    expect(next.station.inventory).toBe(CARGO_PER_TRIP);
    expect(ship(next).state).toBe("outbound");
    expect(ship(next).cargo).toBe(0);
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

  it("treats a negative or missing time step as no time passing", () => {
    const start = createInitialState(7);
    for (const dt of [-5, Number.NaN]) {
      const next = tick(start, dt);
      expect(next.ships).toEqual(start.ships);
      expect(next.asteroids).toEqual(start.asteroids);
    }
  });

  it("does not mutate the state it was given", () => {
    const start = createInitialState(7);
    const snapshot = JSON.parse(JSON.stringify(start)) as SimState;
    tick(start, 10 * cycleSeconds(start));
    expect(start).toEqual(snapshot);
  });
});

describe("asteroid field", () => {
  // Seconds from load until the first asteroid's third load is mined out.
  function emptiedAt(start: SimState): number {
    return 2 * cycleSeconds(start) + legSeconds(start) + WORKING_SECONDS;
  }

  it("starts with 4 asteroids of 30 ore each, 200 to 400 units from the station", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const state = createInitialState(seed);
      expect(state.asteroids).toHaveLength(ASTEROID_COUNT);
      expect(ASTEROID_COUNT).toBe(4);
      for (const asteroid of state.asteroids) {
        expect(asteroid.ore).toBe(30);
        const d = distance(state.station.position, asteroid.position);
        expect(d).toBeGreaterThanOrEqual(ASTEROID_MIN_DISTANCE);
        expect(d).toBeLessThanOrEqual(ASTEROID_MAX_DISTANCE);
      }
    }
  });

  it("sends the ship to the nearest asteroid on load", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const state = createInitialState(seed);
      expect(target(state).id).toBe(nearestWithOre(state).id);
    }
  });

  it("drains the asteroid one unit at a time in step with the cargo", () => {
    const start = createInitialState(7);
    const id = target(start).id;
    const oreOf = (state: SimState) => state.asteroids.find((a) => a.id === id)!.ore;

    for (let s = 0; s <= WORKING_SECONDS; s += 0.5) {
      const state = run(start, legSeconds(start) + s + 0.01);
      if (ship(state).state !== "working") continue;
      expect(oreOf(state)).toBe(ASTEROID_ORE - ship(state).cargo);
    }
    expect(oreOf(run(start, cycleSeconds(start) + 0.1))).toBe(20);
  });

  it("removes the asteroid when its third load is mined, then mines the next nearest", () => {
    const start = createInitialState(7);
    const first = target(start);
    const emptied = emptiedAt(start);

    const lastUnit = run(start, emptied - 0.01);
    expect(lastUnit.asteroids.find((a) => a.id === first.id)?.ore).toBe(1);

    const gone = run(start, emptied + 0.01);
    expect(gone.asteroids.map((a) => a.id)).not.toContain(first.id);
    expect(gone.asteroids).toHaveLength(ASTEROID_COUNT - 1);
    expect(ship(gone).state).toBe("homebound");
    expect(ship(gone).cargo).toBe(CARGO_PER_TRIP);

    const nextTrip = run(start, 3 * cycleSeconds(start) + 0.1);
    expect(ship(nextTrip).state).toBe("outbound");
    expect(target(nextTrip).id).not.toBe(first.id);
    expect(target(nextTrip).id).toBe(nearestWithOre(nextTrip).id);
    expect(nextTrip.station.inventory).toBe(3 * CARGO_PER_TRIP);
  });

  it("brings a fresh asteroid back somewhere else 30 seconds after one runs out", () => {
    expect(RESPAWN_SECONDS).toBe(30);
    const start = createInitialState(7);
    const first = target(start);
    const emptied = emptiedAt(start);

    const before = run(start, emptied + RESPAWN_SECONDS - 0.1);
    expect(before.asteroids).toHaveLength(ASTEROID_COUNT - 1);

    const after = run(start, emptied + RESPAWN_SECONDS + 0.1);
    expect(after.asteroids).toHaveLength(ASTEROID_COUNT);
    const known = new Set(start.asteroids.map((a) => a.id));
    const fresh = after.asteroids.filter((a) => !known.has(a.id));
    expect(fresh).toHaveLength(1);
    expect(fresh[0]!.ore).toBe(ASTEROID_ORE);
    expect(fresh[0]!.position).not.toEqual(first.position);
    const d = distance(start.station.position, fresh[0]!.position);
    expect(d).toBeGreaterThanOrEqual(ASTEROID_MIN_DISTANCE);
    expect(d).toBeLessThanOrEqual(ASTEROID_MAX_DISTANCE);
  });

  it("waits at the station when nothing has ore, and leaves as soon as an asteroid appears", () => {
    const start = createInitialState(7);
    const unloading = run(start, 2 * legSeconds(start) + WORKING_SECONDS + 0.01);
    expect(ship(unloading).state).toBe("unloading");
    const barren: SimState = {
      ...unloading,
      asteroids: [],
      respawns: [{ timer: UNLOADING_SECONDS + 10, lastPosition: target(start).position }],
    };

    const waiting = run(barren, UNLOADING_SECONDS + 9.9);
    expect(ship(waiting).state).toBe("idle");
    expect(ship(waiting).position).toEqual(start.station.position);
    expect(ship(waiting).cargo).toBe(0);
    expect(waiting.station.inventory).toBe(CARGO_PER_TRIP);

    const leaving = run(waiting, 0.2);
    expect(leaving.asteroids).toHaveLength(1);
    expect(ship(leaving).state).toBe("outbound");
    expect(target(leaving).id).toBe(leaving.asteroids[0]!.id);
  });

  it("replays the same asteroids and respawn spots for the same seed", () => {
    const positions = (state: SimState) => state.asteroids.map((a) => a.position);
    const a = run(createInitialState(42), 600, 0.1);
    const b = run(createInitialState(42), 600, 0.1);

    // Ids count up from 0, so this means at least two respawns have happened.
    expect(Math.max(...a.asteroids.map((x) => x.id))).toBeGreaterThanOrEqual(ASTEROID_COUNT + 1);
    expect(positions(a)).toEqual(positions(b));
    expect(positions(createInitialState(1))).not.toEqual(positions(createInitialState(2)));
  });

  it("reaches the same field whether time comes in small steps or one big one", () => {
    const start = createInitialState(7);
    const small = run(start, 600);
    const big = tick(start, 600);
    const summary = (state: SimState) =>
      state.asteroids.map((a) => ({ id: a.id, ore: a.ore, position: a.position }));

    expect(summary(big)).toEqual(summary(small));
    expect(big.station.inventory).toBe(small.station.inventory);
  });
});
