import { describe, expect, it } from "vitest";
import { tick } from "./tick";
import {
  HOME_SECTOR,
  JUMP_SECONDS,
  createInitialState,
  orderMine,
  type Asteroid,
  type SimState,
} from "./state";

function run(state: SimState, seconds: number, dt = 1 / 60): SimState {
  let next = state;
  for (let t = 0; t < seconds - 1e-9; t += dt) next = tick(next, Math.min(dt, seconds - t));
  return next;
}

// Runs until `done` holds, failing rather than looping forever.
function runUntil(state: SimState, done: (s: SimState) => boolean, limit = 600): SimState {
  let next = state;
  for (let t = 0; t < limit; t += 1 / 60) {
    if (done(next)) return next;
    next = tick(next, 1 / 60);
  }
  throw new Error(`condition not reached in ${limit} s`);
}

// Within a unit: a tick that ends a jump plays the rest of its time on the next leg.
function expectNear(a: { x: number; y: number }, b: { x: number; y: number }): void {
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1);
}

function farRock(state: SimState): Asteroid {
  return state.asteroids.find((a) => a.sectorId !== HOME_SECTOR)!;
}

function stored(state: SimState): number {
  return state.station.inventory.Metal + state.station.inventory.Ice;
}

describe("sectors", () => {
  it("has two named sectors, named the same for the same seed", () => {
    const a = createInitialState(11);
    const b = createInitialState(11);
    expect(a.sectors).toHaveLength(2);
    expect(a.sectors.map((s) => s.name)).toEqual(b.sectors.map((s) => s.name));
    expect(a.sectors[0]!.name).not.toBe(a.sectors[1]!.name);
    for (const sector of a.sectors) expect(sector.name).toMatch(/^[A-Z][a-z]+( [A-Z0-9-]+)?$/);
  });

  it("names sectors differently for different seeds", () => {
    const names = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => createInitialState(seed).sectors[1]!.name),
    );
    expect(names.size).toBeGreaterThan(4);
  });

  it("gives each sector a gate leading to the other", () => {
    const state = createInitialState(11);
    expect(state.sectors[0]!.gate.to).toBe(1);
    expect(state.sectors[1]!.gate.to).toBe(0);
  });

  it("puts rocks of both materials in both sectors and the station at home", () => {
    const state = createInitialState(11);
    expect(state.station.sectorId).toBe(HOME_SECTOR);
    for (const sector of state.sectors) {
      const rocks = state.asteroids.filter((a) => a.sectorId === sector.id);
      expect(new Set(rocks.map((a) => a.material))).toEqual(new Set(["Metal", "Ice"]));
    }
  });

  it("keeps rocks clear of each sector's gate", () => {
    const state = createInitialState(11);
    for (const rock of state.asteroids) {
      const gate = state.sectors[rock.sectorId]!.gate.position;
      expect(Math.hypot(rock.position.x - gate.x, rock.position.y - gate.y)).toBeGreaterThan(40);
    }
  });
});

describe("default mining", () => {
  it("never leaves the home sector, including after rocks respawn", () => {
    let state = createInitialState(11);
    for (let t = 0; t < 900; t += 5) {
      state = run(state, 5);
      expect(state.ships.every((ship) => ship.sectorId === HOME_SECTOR)).toBe(true);
      expect(state.ships.every((ship) => !ship.target || ship.target.sectorId === HOME_SECTOR)).toBe(true);
    }
    const farRocks = state.asteroids.filter((a) => a.sectorId !== HOME_SECTOR);
    expect(farRocks.length).toBeGreaterThan(0);
    expect(farRocks.every((a) => a.ore === 30)).toBe(true);
  });
});

describe("ordering a ship to a rock in the other sector", () => {
  it("flies to the gate, jumps for 2 s, mines there and brings the ore home through the gate", () => {
    const start = createInitialState(11);
    const rock = farRock(start);
    const homeGate = start.sectors[HOME_SECTOR]!.gate.position;
    const farGate = start.sectors[rock.sectorId]!.gate.position;
    let state = orderMine(start, [0], rock.id);
    expect(state.ships[0]!.state).toBe("outbound");
    expect(state.ships[0]!.target?.asteroidId).toBe(rock.id);

    state = runUntil(state, (s) => s.ships[0]!.state === "jumpingOut");
    expect(state.ships[0]!.position).toEqual(homeGate);
    expect(state.ships[0]!.sectorId).toBe(HOME_SECTOR);
    const jumped = run(state, JUMP_SECONDS - 0.1);
    expect(jumped.ships[0]!.state).toBe("jumpingOut");

    state = runUntil(state, (s) => s.ships[0]!.sectorId === rock.sectorId);
    expect(state.ships[0]!.state).toBe("outbound");
    expectNear(state.ships[0]!.position, farGate);

    state = runUntil(state, (s) => s.ships[0]!.state === "working");
    state = runUntil(state, (s) => s.ships[0]!.state === "homebound");
    expect(state.ships[0]!.cargo).toBe(10);
    expect(state.ships[0]!.cargoMaterial).toBe(rock.material);
    expect(state.asteroids.find((a) => a.id === rock.id)!.ore).toBe(20);

    state = runUntil(state, (s) => s.ships[0]!.state === "jumpingHome");
    expect(state.ships[0]!.position).toEqual(farGate);
    state = runUntil(state, (s) => s.ships[0]!.sectorId === HOME_SECTOR);
    expectNear(state.ships[0]!.position, homeGate);
    expect(state.ships[0]!.state).toBe("homebound");

    const before = stored(state);
    state = runUntil(state, (s) => s.ships[0]!.state === "unloading");
    expect(state.ships[0]!.position).toEqual(state.station.dock.position);
    state = runUntil(state, (s) => s.ships[0]!.state === "outbound");
    expect(stored(state)).toBe(before + 10);

    // Back on its default: the next trip is to a home rock.
    expect(state.ships[0]!.target?.sectorId).toBe(HOME_SECTOR);
  });

  it("takes the order from wherever the ship is, mid-flight", () => {
    let state = run(createInitialState(11), 3);
    const at = state.ships[0]!.position;
    expect(state.ships[0]!.state).toBe("outbound");
    state = orderMine(state, [0], farRock(state).id);
    expect(state.ships[0]!.position).toEqual(at);
    const moved = run(state, 1);
    const gate = state.sectors[HOME_SECTOR]!.gate.position;
    const d = (p: { x: number; y: number }) => Math.hypot(p.x - gate.x, p.y - gate.y);
    expect(d(moved.ships[0]!.position)).toBeLessThan(d(at));
  });

  it("ignores an order to a rock that no longer exists", () => {
    const state = createInitialState(11);
    expect(orderMine(state, [0], 9999)).toBe(state);
  });
});

describe("an order with cargo aboard", () => {
  it("keeps the cargo and never mixes another material into the hold", () => {
    const start = createInitialState(11);
    const ice = start.asteroids.find((a) => a.sectorId === HOME_SECTOR && a.material === "Ice")!;
    const metal = start.asteroids.find((a) => a.sectorId === HOME_SECTOR && a.material === "Metal")!;
    const carrying: SimState = {
      ...start,
      ships: [{ ...start.ships[0]!, cargo: 4, cargoMaterial: "Ice" }],
    };
    let state = orderMine(carrying, [0], metal.id);
    state = runUntil(state, (s) => s.ships[0]!.state === "homebound");
    expect(state.ships[0]!.cargo).toBe(4);
    expect(state.ships[0]!.cargoMaterial).toBe("Ice");
    expect(state.asteroids.find((a) => a.id === metal.id)!.ore).toBe(30);

    state = orderMine(carrying, [0], ice.id);
    state = runUntil(state, (s) => s.ships[0]!.state === "homebound");
    expect(state.ships[0]!.cargo).toBe(10);
    expect(state.asteroids.find((a) => a.id === ice.id)!.ore).toBe(24);
  });
});
