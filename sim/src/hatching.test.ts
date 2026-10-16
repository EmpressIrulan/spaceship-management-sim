import { describe, expect, it } from "vitest";
import { tick } from "./tick";
import { createInitialState } from "./state";
import { BUG_COSTS, BUG_DESIGNS, HIVE_SECTOR, WORKER_COST } from "./build-constants";
import type { Asteroid, Bug, Material, SimState } from "./model";

// A game whose hive holds exactly `stock`, with no rock and no respawn, so the
// stock is the only ore there is. The hive keeps `workerCount` of its starting
// workers.
function quietStart(stock: Record<Material, number>, workerCount = 3): SimState {
  const base = createInitialState(7);
  const hive = { ...base.hives![0]!, stock };
  const workers = (base.bugs ?? []).filter((bug) => bug.role === "worker").slice(0, workerCount);
  return { ...base, asteroids: [], respawns: [], hives: [hive], bugs: workers };
}

function fighters(state: SimState): Bug[] {
  return (state.bugs ?? []).filter((bug) => bug.role !== "worker");
}

function workers(state: SimState): Bug[] {
  return (state.bugs ?? []).filter((bug) => bug.role === "worker");
}

function stockOf(state: SimState): Record<Material, number> {
  return state.hives![0]!.stock!;
}

function rockAt(id: number, position: { x: number; y: number }, material: Material, ore = 100): Asteroid {
  return { id, sectorId: HIVE_SECTOR, rich: false, fieldId: 0, position, size: { width: 20, height: 20 }, ore, material };
}

describe("bug cost", () => {
  it("prices each bug size above the one before, in both Metal and Ice", () => {
    expect(BUG_COSTS).toHaveLength(BUG_DESIGNS.length);
    for (let i = 1; i < BUG_COSTS.length; i++) {
      expect(BUG_COSTS[i]!.Metal).toBeGreaterThan(BUG_COSTS[i - 1]!.Metal);
      expect(BUG_COSTS[i]!.Ice).toBeGreaterThan(BUG_COSTS[i - 1]!.Ice);
    }
  });

  it("takes the price of a small bug from the stock and hatches one small bug", () => {
    const small = BUG_COSTS[0]!;
    const state = tick(quietStart({ Metal: small.Metal, Ice: small.Ice }), 1);
    expect(fighters(state)).toHaveLength(1);
    expect(fighters(state)[0]!.design).toEqual(BUG_DESIGNS[0]);
    expect(stockOf(state)).toEqual({ Metal: 0, Ice: 0 });
  });

  it("an empty stock hatches no fighter", () => {
    const state = tick(quietStart({ Metal: 0, Ice: 0 }), 600);
    expect(fighters(state)).toHaveLength(0);
    expect(stockOf(state)).toEqual({ Metal: 0, Ice: 0 });
  });

  it("needs both Metal and Ice, so Metal alone hatches nothing", () => {
    const state = tick(quietStart({ Metal: 1000, Ice: 0 }), 600);
    expect(fighters(state)).toHaveLength(0);
    expect(stockOf(state).Metal).toBe(1000);
  });
});

describe("more stock, more and bigger bugs", () => {
  it.each(BUG_DESIGNS.map((design, tier) => [tier, design.slots.length]))(
    "a stock that exactly pays for tier %i hatches one bug of that size",
    (tier) => {
      const state = tick(quietStart(BUG_COSTS[tier]!), 1);
      expect(fighters(state)).toHaveLength(1);
      expect(fighters(state)[0]!.design).toEqual(BUG_DESIGNS[tier]);
      expect(stockOf(state)).toEqual({ Metal: 0, Ice: 0 });
    },
  );

  it("hatches as many bugs as the stock pays for, biggest first", () => {
    const large = BUG_COSTS[BUG_COSTS.length - 1]!;
    const state = tick(quietStart({ Metal: large.Metal * 3, Ice: large.Ice * 3 }), 1);
    expect(fighters(state)).toHaveLength(3);
    for (const bug of fighters(state)) expect(bug.design).toEqual(BUG_DESIGNS[BUG_DESIGNS.length - 1]);
    expect(stockOf(state)).toEqual({ Metal: 0, Ice: 0 });
  });

  it("stops at the first bug the stock cannot pay for and keeps the rest", () => {
    const small = BUG_COSTS[0]!;
    // Two small bugs' worth of Metal, but one Ice short of a second small bug.
    const state = tick(quietStart({ Metal: small.Metal * 2, Ice: small.Ice * 2 - 1 }), 1);
    expect(fighters(state)).toHaveLength(1);
    expect(stockOf(state)).toEqual({ Metal: small.Metal, Ice: small.Ice - 1 });
  });
});

describe("worker top-up", () => {
  it("hatches a worker from the stock when the hive is below three", () => {
    const state = tick(quietStart({ Metal: WORKER_COST.Metal, Ice: WORKER_COST.Ice }, 2), 1);
    expect(workers(state)).toHaveLength(3);
    const newest = workers(state).at(-1)!;
    expect(newest.design?.slots).not.toContain("Gun");
    expect(newest.hiveId).toBe(state.hives![0]!.id);
    expect(stockOf(state)).toEqual({ Metal: 0, Ice: 0 });
  });

  it("pays for workers before fighters, so a lost worker comes back first", () => {
    const state = tick(quietStart({ Metal: WORKER_COST.Metal, Ice: WORKER_COST.Ice }, 2), 1);
    expect(workers(state)).toHaveLength(3);
    expect(fighters(state)).toHaveLength(0);
  });

  it("tops up to three and no further", () => {
    const state = tick(quietStart({ Metal: WORKER_COST.Metal * 3, Ice: WORKER_COST.Ice * 3 }, 0), 1);
    expect(workers(state)).toHaveLength(3);
    expect(fighters(state)).toHaveLength(0);
    expect(stockOf(state)).toEqual({ Metal: 0, Ice: 0 });
  });

  it("leaves a lost worker unreplaced when the stock cannot pay for one", () => {
    const state = tick(quietStart({ Metal: 0, Ice: 0 }, 2), 600);
    expect(workers(state)).toHaveLength(2);
  });
});

describe("killing workers slows the hive", () => {
  it("a hive whose workers are gone gets no ore, so it hatches nothing", () => {
    // The workers always take the nearest rock, so a small Metal rock by the
    // hive runs dry early and leaves the Ice rock to take over.
    const base = createInitialState(7);
    const hive = base.hives![0]!.position;
    const rocks = [rockAt(900, { x: hive.x + 60, y: hive.y }, "Metal", 8), rockAt(901, { x: hive.x, y: hive.y + 120 }, "Ice")];
    const working = { ...base, asteroids: rocks, respawns: [] };
    const killed = { ...working, bugs: (working.bugs ?? []).filter((bug) => bug.role !== "worker") };

    const withWorkers = tick(working, 600);
    const withoutWorkers = tick(killed, 600);

    expect(fighters(withWorkers).length).toBeGreaterThan(0);
    expect(fighters(withoutWorkers)).toHaveLength(0);
    expect(workers(withoutWorkers)).toHaveLength(0);
    expect(stockOf(withoutWorkers)).toEqual({ Metal: 0, Ice: 0 });
  });
});
