import { describe, expect, it } from "vitest";
import { foundedStation, miningStart } from "./test-ships";
import {
  queueShipBuild,
  shipBuildQueue,
  shipBuildSeconds,
  shipBuildShortfall,
  startShipBuild,
  tick,
  type Material,
  type ShipDesign,
  type SimState,
  type StationModule,
} from "./index";

const miner: ShipDesign = {
  width: 4,
  height: 4,
  slots: [
    "Engine", "Engine", "Laser", "Laser",
    "Engine", "Engine", "Laser", "Laser",
    "Storage", "Storage", "Storage", "Storage",
    "Storage", "Storage", "Storage", "Storage",
  ],
};
// Costs far less than the miner.
const scout: ShipDesign = { width: 2, height: 1, slots: ["Engine", "Storage"] };

const BUILDER = 2;
const OTHER_BUILDER = 3;

// Seed 7 with two finished Builders and no ships, so nothing brings ore in
// unless a test puts it there.
function shipyard(inventory: Record<Material, number>): SimState {
  const state = miningStart(7);
  const builders: StationModule[] = [
    { type: "Builder", position: { x: 0, y: -40 }, size: { width: 30, height: 40 } },
    { type: "Builder", position: { x: 0, y: 40 }, size: { width: 30, height: 40 } },
  ];
  return {
    ...state,
    ships: [],
    stations: [{
      ...state.stations[0]!,
      storage: { ...state.stations[0]!.storage, capacity: 100000 },
      inventory,
      modules: [...state.stations[0]!.modules, ...builders],
    }],
  };
}

function withStock(state: SimState, inventory: Record<Material, number>): SimState {
  return { ...state, stations: state.stations.map((station, i) => i === 0 ? { ...station, inventory } : station) };
}

const rich = { Metal: 10000, Ice: 10000 };
const inventory = (state: SimState) => state.stations[0]!.inventory;

describe("queuing ships at a Builder", () => {
  it("pays for the first ship only; the rest wait in the queue for free", () => {
    const state = queueShipBuild(shipyard({ Metal: 1000, Ice: 1000 }), BUILDER, miner, 3);

    expect(inventory(state)).toEqual({ Metal: 760, Ice: 840 });
    const queue = shipBuildQueue(state, BUILDER);
    expect(queue).toHaveLength(3);
    expect(queue.map((job) => job.waiting ?? false)).toEqual([false, true, true]);
  });

  it("queues more than the station can afford without paying anything", () => {
    const state = queueShipBuild(shipyard({ Metal: 200, Ice: 100 }), BUILDER, miner, 2);

    expect(inventory(state)).toEqual({ Metal: 200, Ice: 100 });
    expect(shipBuildQueue(state, BUILDER).every((job) => job.waiting)).toBe(true);
    expect(shipBuildShortfall(state, BUILDER)).toEqual({ Metal: 40, Ice: 60 });
  });

  it("names only the materials that are short", () => {
    const state = queueShipBuild(shipyard({ Metal: 200, Ice: 1000 }), BUILDER, miner);

    expect(shipBuildShortfall(state, BUILDER)).toEqual({ Metal: 40 });
  });

  it("reports no shortfall while a ship is building or nothing is queued", () => {
    const empty = shipyard({ Metal: 1000, Ice: 1000 });
    expect(shipBuildShortfall(empty, BUILDER)).toBeNull();

    const building = queueShipBuild(empty, BUILDER, miner, 5);
    expect(shipBuildShortfall(building, BUILDER)).toBeNull();
  });

  it("waits on the next ship in order rather than skipping to a cheaper one", () => {
    let state = queueShipBuild(shipyard({ Metal: 200, Ice: 1000 }), BUILDER, miner);
    state = queueShipBuild(state, BUILDER, scout);
    state = tick(state, 60);

    expect(inventory(state)).toEqual({ Metal: 200, Ice: 1000 });
    expect(shipBuildQueue(state, BUILDER).map((job) => job.design)).toEqual([miner, scout]);
    expect(state.ships).toHaveLength(0);
  });

  it("starts the waiting ship by itself on a later tick once the materials are there", () => {
    let state = queueShipBuild(shipyard({ Metal: 200, Ice: 1000 }), BUILDER, miner);
    state = tick(state, 1);
    expect(shipBuildQueue(state, BUILDER)[0]!.waiting).toBe(true);

    state = tick(withStock(state, { Metal: 300, Ice: 1000 }), 1);

    expect(inventory(state)).toEqual({ Metal: 60, Ice: 840 });
    expect(shipBuildQueue(state, BUILDER)[0]!.waiting).toBeUndefined();
    expect(shipBuildShortfall(state, BUILDER)).toBeNull();
  });

  it("finishes a mix of designs one after another, in the order they were queued", () => {
    let state = queueShipBuild(shipyard(rich), BUILDER, miner);
    state = queueShipBuild(state, BUILDER, scout, 2);
    state = queueShipBuild(state, BUILDER, miner);
    const total = 2 * shipBuildSeconds(miner) + 2 * shipBuildSeconds(scout);

    const early = tick(state, shipBuildSeconds(miner) + shipBuildSeconds(scout) / 2);
    expect(early.ships.map((ship) => ship.design)).toEqual([miner]);

    const done = tick(state, total);
    expect(done.ships.map((ship) => ship.design)).toEqual([miner, scout, scout, miner]);
    expect(shipBuildQueue(done, BUILDER)).toEqual([]);
  });

  it("keeps each Builder's queue to itself", () => {
    let state = queueShipBuild(shipyard(rich), BUILDER, miner, 2);
    state = queueShipBuild(state, OTHER_BUILDER, scout);

    expect(shipBuildQueue(state, BUILDER)).toHaveLength(2);
    expect(shipBuildQueue(state, OTHER_BUILDER).map((job) => job.waiting)).toEqual([undefined]);
  });

  it("has no limit on how many ships wait", () => {
    const state = queueShipBuild(shipyard({ Metal: 0, Ice: 0 }), BUILDER, scout, 500);

    expect(shipBuildQueue(state, BUILDER)).toHaveLength(500);
  });

  it("queues nothing for a module that is not a Builder, or for no ships", () => {
    const state = shipyard(rich);

    expect(queueShipBuild(state, 0, miner)).toBe(state);
    expect(queueShipBuild(state, BUILDER, miner, 0)).toBe(state);
  });

  it("works through a queue at a non-Home station", () => {
    const base = shipyard({ Metal: 0, Ice: 0 });
    const origin = foundedStation(1, 2, 900, 900, { Metal: 300, Ice: 200 });
    origin.modules.push({ type: "Builder", position: { x: 940, y: 900 }, size: { width: 30, height: 40 } });
    const builder = origin.modules.length - 1;
    let state = queueShipBuild({ ...base, stations: [...base.stations, origin] }, builder, miner, 2, 1);
    expect(shipBuildShortfall(state, builder, 1)).toBeNull();
    expect(shipBuildQueue(state, builder, 1)).toHaveLength(2);

    state = tick(state, shipBuildSeconds(miner));
    expect(state.ships.map((ship) => ship.homeStationId)).toEqual([1]);
    expect(shipBuildShortfall(state, builder, 1)).toEqual({ Metal: 180, Ice: 120 });
  });
});

describe("starting a single ship", () => {
  it("is a queue of one that starts straight away", () => {
    const state = startShipBuild(shipyard({ Metal: 1000, Ice: 1000 }), BUILDER, miner);

    expect(shipBuildQueue(state, BUILDER)).toEqual([
      { stationId: 0, builder: BUILDER, design: miner, timer: shipBuildSeconds(miner) },
    ]);
  });
});
