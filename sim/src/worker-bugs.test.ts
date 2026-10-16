import { describe, expect, it } from "vitest";
import { tick } from "./tick";
import { createInitialState } from "./state";
import { BUG_HP, GUN_DAMAGE, HIVE_SECTOR, WORKER_HOLD } from "./build-constants";
import type { Asteroid, Bug, Ship, SimState } from "./model";

const ROCK_ID = 900;
const ROCK_ORE = 100;

// A fresh game with one rock in the hive's sector and no others, so the test
// knows exactly which ore the workers can take.
function workerStart(asteroids: Asteroid[] = [rockAt({ x: 300, y: 200 }, ROCK_ORE)]): SimState {
  return { ...createInitialState(1), asteroids, respawns: [] };
}

function rockAt(position: { x: number; y: number }, ore: number): Asteroid {
  return { id: ROCK_ID, sectorId: HIVE_SECTOR, rich: false, fieldId: 0, position, size: { width: 20, height: 20 }, ore, material: "Ice" };
}

function workers(state: SimState): Bug[] {
  return (state.bugs ?? []).filter((bug) => bug.role === "worker");
}

function stockOf(state: SimState): number {
  const stock = state.hives?.[0]?.stock ?? { Metal: 0, Ice: 0 };
  return stock.Metal + stock.Ice;
}

describe("worker bugs", () => {
  it("a new hive starts with three unarmed workers at the hive", () => {
    const state = createInitialState(1);
    const hive = state.hives![0]!;
    const found = workers(state);
    expect(found).toHaveLength(3);
    for (const worker of found) {
      expect(worker.sectorId).toBe(hive.sectorId);
      expect(worker.hiveId).toBe(hive.id);
      expect(worker.design?.slots.includes("Gun")).toBe(false);
    }
  });

  it("workers mine the rock, fill their hold and fly it home into the hive stock", () => {
    let state = workerStart();
    for (let i = 0; i < 600 && stockOf(state) === 0; i++) state = tick(state, 1);

    expect(stockOf(state)).toBeGreaterThan(0);
    const stock = state.hives![0]!.stock!;
    expect(stock.Ice % WORKER_HOLD).toBe(0);
    expect(stock.Metal).toBe(0);
  });

  it("ore leaves the rock only as cargo, so the rock, the hold and the stock add up", () => {
    let state = workerStart();
    for (let i = 0; i < 600 && stockOf(state) === 0; i++) state = tick(state, 1);
    expect(stockOf(state)).toBeGreaterThan(0);

    const rock = state.asteroids.find((asteroid) => asteroid.id === ROCK_ID);
    const carried = workers(state).reduce((sum, worker) => sum + (worker.cargo ?? 0), 0);
    expect(ROCK_ORE - (rock?.ore ?? 0)).toBe(stockOf(state) + carried);
  });

  it("a worker shot by a gun turns and flees to the hive", () => {
    // Out on a leg toward a rock far from the hive, so the flight home is long.
    const base = createInitialState(1);
    const hive = base.hives![0]!;
    const far = { x: hive.position.x + 300, y: hive.position.y };
    const state = workerStart([rockAt(far, ROCK_ORE)]);
    const worker = workers(state)[0]!;
    const out = { x: hive.position.x + 150, y: hive.position.y };
    const walking: Bug = { ...worker, position: out, state: "seeking", asteroidId: ROCK_ID, leg: { from: out, to: far }, timer: 10 };
    const gunShip: Ship = {
      ...state.ships[0]!,
      sectorId: HIVE_SECTOR,
      position: { x: out.x + 20, y: out.y },
      design: { width: 1, height: 1, slots: ["Gun"] },
      state: "idle",
      order: null,
      target: null,
      defaultBehaviour: "none",
      leg: null,
      berth: null,
      transfer: null,
    };
    const shot = { ...state, bugs: (state.bugs ?? []).map((bug) => bug.id === worker.id ? walking : bug), ships: [gunShip] };

    const after = tick(shot, 1);
    const hit = workers(after).find((bug) => bug.id === worker.id)!;
    expect(hit.hp).toBe(BUG_HP - GUN_DAMAGE);
    expect(hit.state).toBe("fleeing");
    expect(hit.leg?.to.x).toBeCloseTo(hive.position.x);
    expect(hit.leg?.to.y).toBeCloseTo(hive.position.y);
  });

  it("a worker killed by gun fire is removed and leaves bug juice where it died", () => {
    const state = workerStart();
    const worker = workers(state)[0]!;
    const weakened = { ...state, bugs: (state.bugs ?? []).map((bug) => bug.id === worker.id ? { ...bug, hp: GUN_DAMAGE } : bug) };
    const gunShip: Ship = {
      ...state.ships[0]!,
      sectorId: HIVE_SECTOR,
      position: { x: worker.position.x + 20, y: worker.position.y },
      design: { width: 1, height: 1, slots: ["Gun"] },
      state: "idle",
      order: null,
      target: null,
      defaultBehaviour: "none",
      leg: null,
      berth: null,
      transfer: null,
    };

    const after = tick({ ...weakened, ships: [gunShip], asteroids: [] }, 1);
    expect(workers(after).some((bug) => bug.id === worker.id)).toBe(false);
    expect(after.drops?.some((drop) => drop.kind === "bugJuice")).toBe(true);
  });

  it("workers never hunt ships, even with a ship in their sector", () => {
    let state = workerStart();
    expect(workers(state)).toHaveLength(3);
    const ship = { ...state.ships[0]!, sectorId: HIVE_SECTOR, position: { x: 310, y: 200 } };
    state = { ...state, ships: [ship] };
    for (let i = 0; i < 120; i++) {
      state = tick(state, 1);
      for (const worker of workers(state)) expect(["hunting", "invading", "gathering"]).not.toContain(worker.state);
    }
  });

  it("with no rock in their sector, workers wait without stalling the tick", () => {
    const state = tick(workerStart([]), 60);
    expect(workers(state)).toHaveLength(3);
    expect(stockOf(state)).toBe(0);
  });
});
