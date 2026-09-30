import { describe, expect, it } from "vitest";
import { miningStart } from "./test-ships";
import {
  PIXEL_SIZE,
  SHIP_MODULES,
  STARTING_SHIP,
  canMine,
  availableShipBuild,
  shipBuildCost,
  shipBuildSeconds,
  shipSize,
  shipStats,
  setMineMaterial,
  startShipBuild,
  validDesign,
  tick,
  type Ship,
  type ShipDesign,
  type SimState,
  type StationModule,
} from "./index";

function design(width: number, height: number, slots: ShipDesign["slots"]): ShipDesign {
  return { width, height, slots };
}

// The starting ship at pixel scale: each old module square is a 2x2 block.
const E = "Engine";
const L = "Laser";
const S = "Storage";
const miner = design(4, 4, [
  E, E, L, L,
  E, E, L, L,
  S, S, S, S,
  S, S, S, S,
]);
const noLaser = design(2, 1, ["Engine", "Storage"]);
const noEngine = design(2, 1, ["Laser", "Storage"]);
const solid = (width: number, height: number, module: ShipDesign["slots"][number] = "Hull") =>
  design(width, height, Array(width * height).fill(module));

// Seed 7 with two finished Builders and plenty of ore.
function shipyard(inventory = { Metal: 400, Ice: 400 }): SimState {
  const state = miningStart(7);
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
  it("is a 4x4 pixel ship holding an engine, a laser and two storage blocks", () => {
    const state = miningStart(7);
    expect(state.ships).toHaveLength(1);
    expect(STARTING_SHIP).toEqual(miner);
    expect(state.ships[0]!.design).toEqual(miner);
  });

  it("moves at today's speed, holds 20 and mines a full hold in 24 s", () => {
    expect(shipStats(miner)).toMatchObject({ speed: 25, hold: 20, miningSeconds: 24 });
  });

  it("is about as big as it was before pixels: 9 units across", () => {
    expect(shipSize(miner)).toEqual({ width: 9, height: 9 });
  });
});

describe("ship stats", () => {
  it("offers Hull next to the three working modules", () => {
    expect(SHIP_MODULES).toEqual(["Engine", "Laser", "Storage", "Hull"]);
  });

  it("takes speed from the share of painted pixels that are engines, hull included", () => {
    const withHull = design(4, 4, [E, E, L, L, E, E, L, L, S, S, S, S, "Hull", "Hull", "Hull", "Hull"]);
    expect(shipStats(withHull).speed).toBe(25);
    const doubled = design(4, 4, [E, E, L, L, E, E, E, E, S, S, S, S, S, S, S, S]);
    expect(shipStats(doubled).speed).toBe(37.5);
    expect(shipStats(noEngine).speed).toBe(0);
  });

  it("does not count empty pixels inside the bounding box", () => {
    const holed = design(3, 1, ["Engine", null, "Laser"]);
    expect(shipStats(holed).speed).toBe(50);
  });

  it("holds 2.5 per Storage pixel, rounded down, and mines faster with more laser pixels", () => {
    const twoLasers = design(4, 4, [L, L, L, L, L, L, L, L, S, S, S, S, S, S, S, S]);
    expect(shipStats(twoLasers)).toMatchObject({ hold: 20, miningSeconds: 12 });
    expect(shipStats(design(3, 1, ["Storage", "Storage", "Storage"])).hold).toBe(7);
    expect(shipStats(noLaser).miningSeconds).toBeNull();
  });

  it("gives Hull no ability of its own", () => {
    expect(shipStats(solid(4, 4))).toMatchObject({ speed: 0, hold: 0, miningSeconds: null });
    expect(canMine(solid(4, 4))).toBe(false);
  });

  it("draws a pixel as a quarter of the old module square", () => {
    expect(PIXEL_SIZE * PIXEL_SIZE * 4).toBeCloseTo(4.5 * 4.5);
    const big = shipSize(solid(40, 20));
    expect(big).toEqual({ width: 40 * PIXEL_SIZE, height: 20 * PIXEL_SIZE });
  });
});

describe("design size", () => {
  it("has no cap: a Star Destroyer of 400 x 200 pixels is valid", () => {
    expect(validDesign(solid(400, 200))).toBe(true);
  });

  it("needs at least one painted pixel and a matching slot count", () => {
    expect(validDesign(design(2, 2, [null, null, null, null]))).toBe(false);
    expect(validDesign(design(2, 2, ["Hull", "Hull"]))).toBe(false);
    expect(validDesign(design(0, 0, []))).toBe(false);
    expect(validDesign(design(1, 1, ["Hull"]))).toBe(true);
  });
});

describe("building a ship", () => {
  it("costs 5 Metal and 5 Ice per pixel and takes 1 s per pixel", () => {
    expect(shipBuildCost(solid(4, 4))).toEqual({ Metal: 80, Ice: 80 });
    expect(shipBuildCost(solid(1, 1))).toEqual({ Metal: 5, Ice: 5 });
    expect(shipBuildSeconds(solid(1, 1))).toBe(1);
    expect(shipBuildSeconds(miner)).toBe(16);
    expect(shipBuildSeconds(solid(400, 200))).toBe(80000);
  });

  it("counts painted pixels only, not the empty ones in the bounding box", () => {
    const l = design(3, 2, ["Hull", null, null, "Hull", "Hull", "Hull"]);
    expect(shipBuildCost(l)).toEqual({ Metal: 20, Ice: 20 });
    expect(shipBuildSeconds(l)).toBe(4);
  });

  it("takes the ore straight away and marks that Builder busy", () => {
    const state = startShipBuild(shipyard(), FIRST_BUILDER, miner);

    expect(state.station.inventory).toEqual({ Metal: 320, Ice: 320 });
    expect(state.station.shipBuilds).toEqual([
      { builder: FIRST_BUILDER, design: miner, timer: shipBuildSeconds(miner) },
    ]);
    expect(availableShipBuild(state, FIRST_BUILDER, miner)).toBe(false);
    expect(availableShipBuild(state, SECOND_BUILDER, miner)).toBe(true);
    expect(startShipBuild(state, FIRST_BUILDER, miner)).toBe(state);
  });

  it("refuses when Storage can't pay, or the module is not a Builder", () => {
    const poor = shipyard({ Metal: 79, Ice: 400 });
    expect(availableShipBuild(poor, FIRST_BUILDER, miner)).toBe(false);
    expect(startShipBuild(poor, FIRST_BUILDER, miner)).toBe(poor);
    expect(availableShipBuild(shipyard(), 0, miner)).toBe(false);
  });

  it("builds on two Builders at the same time", () => {
    let state = startShipBuild(shipyard(), FIRST_BUILDER, miner);
    state = startShipBuild(state, SECOND_BUILDER, miner);
    expect(state.station.shipBuilds).toHaveLength(2);

    const done = tick(state, shipBuildSeconds(miner));
    expect(done.station.shipBuilds).toEqual([]);
    expect(done.ships).toHaveLength(3);
  });

  it("launches the new ship from the Dock with nothing ticked, and it mines once a material is", () => {
    const state = startShipBuild(shipyard(), FIRST_BUILDER, miner);
    const done = tick(state, shipBuildSeconds(miner));
    const built = done.ships.at(-1)!;

    expect(built.design).toEqual(miner);
    expect(built.id).not.toBe(done.ships[0]!.id);
    expect(built.state).toBe("idle");
    expect(built.position).toEqual(done.station.dock.position);

    const ticked = tick(setMineMaterial(done, [built.id], "Metal", true), 1 / 30);
    expect(ticked.ships.at(-1)!.state).toBe("outbound");
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
    const state = miningStart(7);
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
        target: { asteroidId: 0, sectorId: 0, site: { x: 100, y: 0 } },
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
    const state = miningStart(7);
    const idle: Ship = { ...state.ships[0]!, design: layout, state: "idle", timer: 0, target: null };
    return tick({ ...state, ships: [idle] }, 0);
  }

  it("fills the starting ship's hold of 20 in 24 s of mining", () => {
    let state = miningShip(miner);
    state = tick(state, state.ships[0]!.timer);
    expect(state.ships[0]!.state).toBe("working");
    expect(state.ships[0]!.timer).toBeCloseTo(24);

    state = tick(state, 24);
    expect(state.ships[0]).toMatchObject({ state: "homebound", cargo: 20 });
  });

  it("flies out faster with a bigger share of engine pixels", () => {
    const one = miningShip(miner).ships[0]!.timer;
    const two = miningShip(design(4, 4, [E, E, L, L, E, E, E, E, S, S, S, S, S, S, S, S])).ships[0]!.timer;
    expect(two).toBeLessThan(one);
  });
});
