import { describe, expect, it } from "vitest";
import { tick } from "./tick";
import {
  CARGO_PER_TRIP,
  MINING_GAP,
  SHIP_SIZE,
  UNLOADING_SECONDS,
  WORKING_SECONDS,
  createInitialState,
  laserBeam,
  type Asteroid,
  type SimState,
  type Size,
  type Vec,
} from "./state";
import { travelSeconds } from "./motion";

function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function ship(state: SimState) {
  return state.ships[0]!;
}

function site(state: SimState): Vec {
  return ship(state).target!.site;
}

function targetOf(state: SimState): Asteroid {
  const id = ship(state).target!.asteroidId;
  return state.asteroids.find((a) => a.id === id)!;
}

function legSeconds(state: SimState): number {
  return travelSeconds(distance(state.station.position, site(state)));
}

function cycleSeconds(state: SimState): number {
  return 2 * legSeconds(state) + WORKING_SECONDS + UNLOADING_SECONDS;
}

function overlaps(a: Vec, aSize: Size, b: Vec, bSize: Size): boolean {
  return (
    Math.abs(a.x - b.x) < (aSize.width + bSize.width) / 2 &&
    Math.abs(a.y - b.y) < (aSize.height + bSize.height) / 2
  );
}

// 1 on the rectangle's outline, below 1 inside it.
function edgeness(point: Vec, center: Vec, size: Size): number {
  return Math.max(
    Math.abs(point.x - center.x) / (size.width / 2),
    Math.abs(point.y - center.y) / (size.height / 2),
  );
}

describe("where the ship mines from", () => {
  it("stops about three ship lengths off the asteroid's edge", () => {
    expect(MINING_GAP).toBe(3 * SHIP_SIZE.width);
    for (let seed = 0; seed < 50; seed += 1) {
      const state = createInitialState(seed);
      const asteroid = targetOf(state);
      const arrived = { ...ship(state), state: "working" as const, position: site(state) };
      const beam = laserBeam({ ...state, ships: [arrived] }, arrived);
      expect(beam).not.toBeNull();
      expect(edgeness(beam!.to, asteroid.position, asteroid.size)).toBeCloseTo(1, 9);
      expect(distance(site(state), beam!.to)).toBeCloseTo(MINING_GAP, 9);
    }
  });

  it("stops on the side facing the station, on the straight line out", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const state = createInitialState(seed);
      const station = state.station.position;
      const asteroid = targetOf(state).position;
      const s = site(state);
      expect(distance(station, s)).toBeLessThan(distance(station, asteroid));
      // On the segment from station to asteroid.
      expect(distance(station, s) + distance(s, asteroid)).toBeCloseTo(
        distance(station, asteroid),
        9,
      );
    }
  });

  it("never overlaps the asteroid it mines, flying out, mining or flying home", () => {
    for (let seed = 0; seed < 20; seed += 1) {
      let state = createInitialState(seed);
      const asteroid = targetOf(state);
      const end = cycleSeconds(state);
      for (let t = 0; t < end; t += 1 / 30) {
        state = tick(state, 1 / 30);
        const s = ship(state);
        expect(overlaps(s.position, SHIP_SIZE, asteroid.position, asteroid.size)).toBe(false);
      }
    }
  });

  it("gives the same stopping point for the same seed on every load", () => {
    expect(site(createInitialState(42))).toEqual(site(createInitialState(42)));
    expect(site(createInitialState(1))).not.toEqual(site(createInitialState(2)));
  });
});

describe("the laser", () => {
  it("is off while flying out and on the moment the ship stops", () => {
    const start = createInitialState(7);
    const leg = legSeconds(start);

    const almost = tick(start, leg - 0.01);
    expect(ship(almost).state).toBe("outbound");
    expect(laserBeam(almost, ship(almost))).toBeNull();

    const stopped = tick(start, leg + 0.001);
    expect(ship(stopped).state).toBe("working");
    expect(laserBeam(stopped, ship(stopped))).not.toBeNull();
  });

  it("runs from the ship to the asteroid's edge the whole time the ship mines", () => {
    const start = createInitialState(7);
    const asteroid = targetOf(start);
    const leg = legSeconds(start);
    for (let s = 0.01; s < WORKING_SECONDS; s += 0.5) {
      const state = tick(start, leg + s);
      expect(ship(state).state).toBe("working");
      const beam = laserBeam(state, ship(state));
      expect(beam).not.toBeNull();
      expect(beam!.from).toEqual(ship(state).position);
      expect(edgeness(beam!.to, asteroid.position, asteroid.size)).toBeCloseTo(1, 9);
      expect(distance(beam!.to, start.station.position)).toBeLessThan(
        distance(asteroid.position, start.station.position),
      );
    }
  });

  it("is on exactly when the ship is mining, never flying, unloading or waiting", () => {
    // Three trips, so the last one empties the asteroid and the ship flies
    // home after its rock is gone.
    let state = createInitialState(7);
    const end = 3 * cycleSeconds(state) + 5;
    const seen = new Set<string>();
    for (let t = 0; t < end; t += 0.1) {
      state = tick(state, 0.1);
      const s = ship(state);
      seen.add(s.state);
      expect(laserBeam(state, s) !== null).toBe(s.state === "working");
    }
    expect([...seen].sort()).toEqual(["homebound", "outbound", "unloading", "working"]);
  });

  it("is off for a ship waiting at the station with nothing to mine", () => {
    const state = createInitialState(7);
    const idle = { ...ship(state), state: "idle" as const, target: null };
    expect(laserBeam({ ...state, ships: [idle] }, idle)).toBeNull();
  });
});

describe("cargo while mining from a distance", () => {
  it("still counts up one unit at a time over the 12 s", () => {
    let state = createInitialState(7);
    state = tick(state, legSeconds(state) + 0.001);
    expect(ship(state).state).toBe("working");
    let last = ship(state).cargo;
    const counts = [last];
    for (let t = 0; t < WORKING_SECONDS - 0.01; t += 1 / 60) {
      state = tick(state, 1 / 60);
      if (ship(state).state !== "working") break;
      expect(ship(state).cargo - last).toBeLessThanOrEqual(1);
      if (ship(state).cargo !== last) counts.push(ship(state).cargo);
      last = ship(state).cargo;
    }
    expect(counts).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(ship(tick(state, 0.1)).cargo).toBe(CARGO_PER_TRIP);
  });
});
