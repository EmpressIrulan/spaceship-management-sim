import { describe, expect, it } from "vitest";
import { tick } from "./tick";
import {
  CARGO_PER_TRIP,
  SHIP_SIZE,
  WORKING_SECONDS,
  createInitialState,
  type Asteroid,
  type Ship,
  type SimState,
  type Vec,
} from "./state";
import { formation, giveOrder, resumeDefault, setDefaultBehaviour } from "./orders";

function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function run(state: SimState, seconds: number, dt = 1 / 30): SimState {
  let next = state;
  for (let t = 0; t < seconds - 1e-9; t += dt) next = tick(next, Math.min(dt, seconds - t));
  return next;
}

// Runs until `done` holds, failing rather than looping forever.
function runUntil(state: SimState, done: (s: SimState) => boolean, limit = 300): SimState {
  let next = state;
  for (let t = 0; t < limit; t += 1 / 30) {
    if (done(next)) return next;
    next = tick(next, 1 / 30);
  }
  throw new Error("condition never held");
}

function stored(state: SimState): number {
  return state.station.inventory.Metal + state.station.inventory.Ice;
}

// Three copies of the starting ship, the way the game will have several once
// ships can be built.
function fleet(count = 3): SimState {
  const start = createInitialState(7);
  return { ...start, ships: Array.from({ length: count }, () => start.ships[0]!) };
}

function rockOtherThanTarget(state: SimState, ship: Ship): Asteroid {
  return state.asteroids.find((a) => a.id !== ship.target?.asteroidId)!;
}

describe("new ships", () => {
  it("start with no order and a default of Mine for Station", () => {
    const ship = createInitialState(7).ships[0]!;
    expect(ship.order).toBeNull();
    expect(ship.defaultBehaviour).toBe("mine");
  });
});

describe("formation", () => {
  it("gives every ship its own spot around the point", () => {
    const point = { x: 100, y: -50 };
    const spots = formation(point, 7);
    expect(spots).toHaveLength(7);
    for (let i = 0; i < spots.length; i += 1) {
      expect(distance(spots[i]!, point)).toBeLessThan(6 * SHIP_SIZE.width);
      for (let j = i + 1; j < spots.length; j += 1) {
        expect(distance(spots[i]!, spots[j]!)).toBeGreaterThanOrEqual(SHIP_SIZE.width);
      }
    }
  });
});

describe("move order", () => {
  it("flies the ships to the point, spread out, and holds them there", () => {
    const point = { x: -150, y: 120 };
    const ordered = giveOrder(run(fleet(), 3), [0, 1, 2], { kind: "move", point });
    expect(ordered.ships.every((ship) => ship.state === "moving")).toBe(true);
    expect(ordered.ships[0]!.order).toEqual({ kind: "move", point });

    const arrived = run(ordered, 40);
    const positions = arrived.ships.map((ship) => ship.position);
    for (const ship of arrived.ships) {
      expect(ship.state).toBe("holding");
      expect(distance(ship.position, point)).toBeLessThan(6 * SHIP_SIZE.width);
    }
    expect(distance(positions[0]!, positions[1]!)).toBeGreaterThanOrEqual(SHIP_SIZE.width);
    expect(distance(positions[1]!, positions[2]!)).toBeGreaterThanOrEqual(SHIP_SIZE.width);

    const later = run(arrived, 60);
    expect(later.ships.map((ship) => ship.position)).toEqual(positions);
    expect(later.ships.every((ship) => ship.state === "holding")).toBe(true);
  });

  it("only moves the ships it was given", () => {
    const start = fleet();
    const ordered = giveOrder(start, [1], { kind: "move", point: { x: 50, y: 50 } });
    expect(ordered.ships[0]).toEqual(start.ships[0]);
    expect(ordered.ships[1]!.state).toBe("moving");
  });

  it("starts the flight from wherever the ship is", () => {
    const flying = run(fleet(1), 5);
    const from = flying.ships[0]!.position;
    const ordered = giveOrder(flying, [0], { kind: "move", point: { x: 300, y: 300 } });
    const next = tick(ordered, 1 / 60);
    expect(distance(next.ships[0]!.position, from)).toBeLessThan(1);
  });

  it("keeps cargo aboard when it interrupts mining", () => {
    const mining = runUntil(fleet(1), (s) => s.ships[0]!.cargo >= 4);
    const cargo = mining.ships[0]!.cargo;
    const held = run(giveOrder(mining, [0], { kind: "move", point: { x: 0, y: -200 } }), 40);
    expect(held.ships[0]).toMatchObject({ state: "holding", cargo, cargoMaterial: mining.ships[0]!.cargoMaterial });
  });

  it("goes back to mining when resumed, taking the cargo home first", () => {
    const mining = runUntil(fleet(1), (s) => s.ships[0]!.cargo >= 4);
    const held = run(giveOrder(mining, [0], { kind: "move", point: { x: 0, y: -200 } }), 40);
    const before = stored(held);

    const resumed = resumeDefault(held, [0]);
    expect(resumed.ships[0]!.order).toBeNull();
    expect(resumed.ships[0]!.state).toBe("homebound");

    const unloaded = runUntil(resumed, (s) => stored(s) === before + held.ships[0]!.cargo);
    const back = runUntil(unloaded, (s) => s.ships[0]!.state === "working");
    expect(back.ships[0]!.order).toBeNull();
  });

  it("heads straight for a rock when resumed with an empty hold", () => {
    const start = fleet(1);
    const held = run(giveOrder(start, [0], { kind: "move", point: { x: 0, y: -200 } }), 40);
    expect(held.ships[0]!.cargo).toBe(0);
    expect(resumeDefault(held, [0]).ships[0]!.state).toBe("outbound");
  });
});

describe("mine order", () => {
  it("mines one load from the chosen rock, brings it home, then goes back to the default", () => {
    const start = run(fleet(1), 2);
    const rock = rockOtherThanTarget(start, start.ships[0]!);
    const ordered = giveOrder(start, [0], { kind: "mine", asteroidId: rock.id });
    expect(ordered.ships[0]).toMatchObject({ state: "outbound", target: { asteroidId: rock.id } });

    const working = runUntil(ordered, (s) => s.ships[0]!.state === "working");
    expect(working.ships[0]!.target!.asteroidId).toBe(rock.id);
    expect(working.ships[0]!.order).toMatchObject({ kind: "mine", asteroidId: rock.id });

    const before = working.station.inventory[rock.material];
    const unloaded = runUntil(working, (s) => s.ships[0]!.state !== "working" && s.ships[0]!.state !== "homebound" && s.ships[0]!.state !== "unloading");
    expect(unloaded.station.inventory[rock.material]).toBe(before + CARGO_PER_TRIP);
    expect(unloaded.ships[0]!.order).toBeNull();
    expect(unloaded.ships[0]!.state).toBe("outbound");
  });

  it("sends several ships to different spots around the same rock", () => {
    const start = fleet(3);
    const rock = rockOtherThanTarget(start, start.ships[0]!);
    const working = runUntil(
      giveOrder(start, [0, 1, 2], { kind: "mine", asteroidId: rock.id }),
      (s) => s.ships.every((ship) => ship.state === "working"),
    );
    const [a, b, c] = working.ships.map((ship) => ship.position);
    expect(distance(a!, b!)).toBeGreaterThanOrEqual(SHIP_SIZE.width);
    expect(distance(b!, c!)).toBeGreaterThanOrEqual(SHIP_SIZE.width);
    expect(distance(a!, c!)).toBeGreaterThanOrEqual(SHIP_SIZE.width);
  });

  it("tops up a part-filled hold of the same material", () => {
    const mining = runUntil(fleet(1), (s) => s.ships[0]!.cargo >= 4);
    const ship = mining.ships[0]!;
    const same = mining.asteroids.find((a) => a.material === ship.cargoMaterial && a.id !== ship.target!.asteroidId)
      ?? mining.asteroids.find((a) => a.id === ship.target!.asteroidId)!;
    const working = runUntil(
      giveOrder(mining, [0], { kind: "mine", asteroidId: same.id }),
      (s) => s.ships[0]!.state === "working",
    );
    expect(working.ships[0]!.cargo).toBe(ship.cargo);
    // Only the rest of the hold is left to fill, so the stay is shorter.
    expect(working.ships[0]!.timer).toBeLessThan(WORKING_SECONDS);
    const full = runUntil(working, (s) => s.ships[0]!.state === "homebound");
    expect(full.ships[0]!.cargo).toBe(CARGO_PER_TRIP);
  });

  it("unloads a different material at home before flying to the rock", () => {
    const mining = runUntil(fleet(1), (s) => s.ships[0]!.cargo >= 4);
    const ship = mining.ships[0]!;
    const other = mining.asteroids.find((a) => a.material !== ship.cargoMaterial)!;
    const ordered = giveOrder(mining, [0], { kind: "mine", asteroidId: other.id });
    expect(ordered.ships[0]).toMatchObject({ state: "homebound", order: { kind: "mine", asteroidId: other.id } });

    const before = stored(ordered);
    const outbound = runUntil(ordered, (s) => s.ships[0]!.state === "outbound");
    expect(stored(outbound)).toBe(before + ship.cargo);
    expect(outbound.ships[0]!.target!.asteroidId).toBe(other.id);
  });

  it("ignores a rock that is already gone", () => {
    const start = fleet(1);
    expect(giveOrder(start, [0], { kind: "mine", asteroidId: 999 })).toEqual(start);
  });
});

describe("home order", () => {
  it("brings the ships home to unload, then back to the default", () => {
    const mining = runUntil(fleet(1), (s) => s.ships[0]!.cargo >= 4);
    const cargo = mining.ships[0]!.cargo;
    const ordered = giveOrder(mining, [0], { kind: "home" });
    expect(ordered.ships[0]).toMatchObject({ state: "homebound", order: { kind: "home" }, cargo });

    const before = stored(ordered);
    const done = runUntil(ordered, (s) => s.ships[0]!.state === "outbound");
    expect(stored(done)).toBe(before + cargo);
    expect(done.ships[0]!.order).toBeNull();
  });
});

describe("default behaviour", () => {
  it("None holds a ship at the Dock after its order", () => {
    const none = setDefaultBehaviour(runUntil(fleet(1), (s) => s.ships[0]!.cargo >= 4), [0], "none");
    const ordered = giveOrder(none, [0], { kind: "home" });
    const done = runUntil(ordered, (s) => s.ships[0]!.order === null);
    expect(done.ships[0]!.state).toBe("holding");
    expect(done.ships[0]!.position).toEqual(done.station.dock.position);
    expect(run(done, 60).ships[0]!.state).toBe("holding");
  });

  it("None lets a ship finish its current trip and then hold", () => {
    const none = setDefaultBehaviour(run(fleet(1), 2), [0], "none");
    expect(none.ships[0]!.state).toBe("outbound");
    const done = runUntil(none, (s) => s.ships[0]!.state === "holding");
    expect(stored(done)).toBe(stored(none) + CARGO_PER_TRIP);
  });

  it("None keeps a resumed ship where it is", () => {
    const none = setDefaultBehaviour(fleet(1), [0], "none");
    const held = run(giveOrder(none, [0], { kind: "move", point: { x: 0, y: -200 } }), 40);
    const resumed = resumeDefault(held, [0]);
    expect(resumed.ships[0]).toMatchObject({ state: "holding", order: null, position: held.ships[0]!.position });
  });

  it("switching a holding ship back to Mine for Station sets it mining", () => {
    const none = setDefaultBehaviour(fleet(1), [0], "none");
    const done = runUntil(giveOrder(none, [0], { kind: "home" }), (s) => s.ships[0]!.state === "holding");
    const mine = setDefaultBehaviour(done, [0], "mine");
    expect(mine.ships[0]!.state).toBe("outbound");
  });
});
