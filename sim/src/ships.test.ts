import { describe, expect, it } from "vitest";
import {
  STARTING_SHIP,
  availableShipBuild,
  createInitialState,
  shipBuildCost,
  shipBuildSeconds,
  shipSize,
  shipStats,
  startShipBuild,
  tick,
  type Ship,
  type ShipDesign,
  type SimState,
  type StationModule,
} from "./index";

function design(width: number, height: number, slots: ShipDesign["slots"]): ShipDesign {
  return { width, height, slots };
}

const miner2x2 = design(2, 2, ["Engine", "Laser", "Storage", "Storage"]);
const noLaser = design(2, 1, ["Engine", "Storage"]);
const noEngine = design(2, 1, ["Laser", "Storage"]);

// Seed 7 with two finished Builders and plenty of ore.
function shipyard(inventory = { Metal: 400, Ice: 400 }): SimState {
  const state = createInitialState(7);
  const builders: StationModule[] = [
    { type: "Builder", position: { x: 0, y: -40 }, size: { width: 30, height: 40 } },
    { type: "Builder", position: { x: 0, y: 40 }, size: { width: 30, height: 40 } },
  ];
  return {
    ...state,
    station: {
      ...state.station,
      storage: { ...state.station.storage, capacity: 1000 },
      inventory,
      modules: [...state.station.modules, ...builders],
    },
  };
}

const FIRST_BUILDER = 2;
const SECOND_BUILDER = 3;

describe("the starting ship", () => {
  it("is a 2x2 hull holding an engine, a laser and two storage", () => {
    const state = createInitialState(7);
    expect(state.ships).toHaveLength(1);
    expect(STARTING_SHIP).toEqual(miner2x2);
    expect(state.ships[0]!.design).toEqual(miner2x2);
  });

  it("moves at today's speed, holds 20 and mines a full hold in 24 s", () => {
    expect(shipStats(miner2x2)).toMatchObject({ speed: 25, hold: 20, miningSeconds: 24 });
  });
});

describe("ship stats", () => {
  it("takes speed from engines per square", () => {
    expect(shipStats(design(3, 3, ["Engine", "Laser", "Storage", null, null, null, null, null, null])).speed)
      .toBeCloseTo(25 * 4 / 9);
    expect(shipStats(design(2, 2, ["Engine", "Engine", "Laser", "Storage"])).speed).toBe(50);
    expect(shipStats(noEngine).speed).toBe(0);
  });

  it("holds 10 per Storage and mines faster with more lasers", () => {
    const twoLasers = design(2, 2, ["Laser", "Laser", "Storage", "Storage"]);
    expect(shipStats(twoLasers)).toMatchObject({ hold: 20, miningSeconds: 12 });
    expect(shipStats(noLaser).miningSeconds).toBeNull();
  });

  it("draws one block per slot, so a 3x3 is bigger than a 2x2", () => {
    const big = shipSize(design(3, 3, Array(9).fill(null)));
    const small = shipSize(miner2x2);
    expect(big.width).toBeGreaterThan(small.width);
    expect(big.height).toBeGreaterThan(small.height);
  });
});

describe("building a ship", () => {
  it("costs 20 Metal and 20 Ice per square and 3 s x squares^1.68", () => {
    expect(shipBuildCost(design(2, 2, Array(4).fill(null)))).toEqual({ Metal: 80, Ice: 80 });
    expect(shipBuildCost(design(3, 3, Array(9).fill(null)))).toEqual({ Metal: 180, Ice: 180 });
    expect(shipBuildSeconds(design(1, 1, [null]))).toBeCloseTo(3);
    expect(Math.round(shipBuildSeconds(miner2x2))).toBe(31);
    expect(Math.round(shipBuildSeconds(design(3, 3, Array(9).fill(null))))).toBe(120);
  });

  it("takes the ore straight away and marks that Builder busy", () => {
    const state = startShipBuild(shipyard(), FIRST_BUILDER, miner2x2);

    expect(state.station.inventory).toEqual({ Metal: 320, Ice: 320 });
    expect(state.station.shipBuilds).toEqual([
      { builder: FIRST_BUILDER, design: miner2x2, timer: shipBuildSeconds(miner2x2) },
    ]);
    expect(availableShipBuild(state, FIRST_BUILDER, miner2x2)).toBe(false);
    expect(availableShipBuild(state, SECOND_BUILDER, miner2x2)).toBe(true);
    expect(startShipBuild(state, FIRST_BUILDER, miner2x2)).toBe(state);
  });

  it("refuses when Storage can't pay, or the module is not a Builder", () => {
    const poor = shipyard({ Metal: 79, Ice: 400 });
    expect(availableShipBuild(poor, FIRST_BUILDER, miner2x2)).toBe(false);
    expect(startShipBuild(poor, FIRST_BUILDER, miner2x2)).toBe(poor);
    expect(availableShipBuild(shipyard(), 0, miner2x2)).toBe(false);
  });

  it("builds on two Builders at the same time", () => {
    let state = startShipBuild(shipyard(), FIRST_BUILDER, miner2x2);
    state = startShipBuild(state, SECOND_BUILDER, miner2x2);
    expect(state.station.shipBuilds).toHaveLength(2);

    const done = tick(state, shipBuildSeconds(miner2x2));
    expect(done.station.shipBuilds).toEqual([]);
    expect(done.ships).toHaveLength(3);
  });

  it("launches the new ship from the Dock and it starts mining on its own", () => {
    const state = startShipBuild(shipyard(), FIRST_BUILDER, miner2x2);
    const done = tick(state, shipBuildSeconds(miner2x2));
    const built = done.ships.at(-1)!;

    expect(built.design).toEqual(miner2x2);
    expect(built.id).not.toBe(done.ships[0]!.id);
    expect(built.state).toBe("outbound");
    expect(built.position).toEqual(done.station.dock.position);
  });

  it.each([["no laser", noLaser], ["no engine", noEngine]])(
    "leaves a ship with %s sitting at the Dock",
    (_, layout) => {
      const state = startShipBuild(shipyard(), FIRST_BUILDER, layout);
      const later = tick(tick(state, shipBuildSeconds(layout)), 60);
      const built = later.ships.at(-1)!;

      expect(built.state).toBe("idle");
      expect(built.position).toEqual(later.station.dock.position);
    },
  );
});

describe("several ships", () => {
  function fleet(count: number): SimState {
    const state = createInitialState(7);
    const idle: Ship = { ...state.ships[0]!, state: "idle", timer: 0, target: null };
    return {
      ...state,
      ships: Array.from({ length: count }, (_, id) => ({ ...idle, id })),
      nextShipId: count,
    };
  }

  it("sends ships to different rocks while there are rocks to go round", () => {
    const departed = tick(fleet(3), 0);
    const targets = departed.ships.map((ship) => ship.target?.asteroidId);
    expect(new Set(targets).size).toBe(3);
  });

  it("unloads at most 6 ships at the Dock and the rest wait their turn", () => {
    const state = fleet(7);
    const home: SimState = {
      ...state,
      station: { ...state.station, storage: { ...state.station.storage, capacity: 1000 } },
      ships: state.ships.map((ship) => ({
        ...ship,
        state: "homebound",
        timer: 0,
        cargo: 20,
        cargoMaterial: "Metal",
        target: { asteroidId: 0, site: { x: 100, y: 0 } },
      })),
    };

    const arrived = tick(home, 0);
    expect(arrived.ships.filter((ship) => ship.state === "unloading")).toHaveLength(6);
    const waiting = arrived.ships.filter((ship) => ship.state === "waiting");
    expect(waiting).toHaveLength(1);

    const berthFree = tick(arrived, arrived.ships[0]!.timer);
    expect(berthFree.ships.find((ship) => ship.id === waiting[0]!.id)!.state).toBe("unloading");
  });
});

describe("the ship's own stats drive its cycle", () => {
  function miningShip(layout: ShipDesign): SimState {
    const state = createInitialState(7);
    const idle: Ship = { ...state.ships[0]!, design: layout, state: "idle", timer: 0, target: null };
    return tick({ ...state, ships: [idle] }, 0);
  }

  it("fills the starting ship's hold of 20 in 24 s of mining", () => {
    let state = miningShip(miner2x2);
    state = tick(state, state.ships[0]!.timer);
    expect(state.ships[0]!.state).toBe("working");
    expect(state.ships[0]!.timer).toBeCloseTo(24);

    state = tick(state, 24);
    expect(state.ships[0]).toMatchObject({ state: "homebound", cargo: 20 });
  });

  it("flies out faster with more engines per square", () => {
    const one = miningShip(miner2x2).ships[0]!.timer;
    const two = miningShip(design(2, 2, ["Engine", "Engine", "Laser", "Storage"])).ships[0]!.timer;
    expect(two).toBeLessThan(one);
  });
});
