import { describe, expect, it } from "vitest";
import {
  BUILD_SECONDS,
  availableModuleBuildSites,
  cancelQueuedModuleBuild,
  createInitialState,
  giveOrder,
  queueModuleBuild,
  queuedDependents,
  setDefaultBehaviour,
  tick,
  type SimState,
  type Vec,
} from "./index";
import { suppliersComingHome } from "./test-ships";

const east = { x: 80, y: 0 };
const farEast = { x: 120, y: 0 };
const west = { x: -40, y: 0 };
const farWest = { x: -80, y: 0 };

function withSite(state: SimState, Metal: number, Ice: number): SimState {
  return {
    ...state,
    stations: [{
      ...state.stations[0]!,
      constructionSite: { ...state.stations[0]!.constructionSite, inventory: { Metal, Ice } },
    }],
  };
}

// A module standing two slots west of the Dock, so the three slots between the
// two are anchored from either end and a ghost in one can hang off the other.
function withBuilder(state: SimState, position: Vec): SimState {
  return {
    ...state,
    stations: [{
      ...state.stations[0]!,
      modules: [...state.stations[0]!.modules, { type: "Builder" as const, position, size: { width: 30, height: 40 } }],
    }],
  };
}

describe("the station build queue", () => {
  it("leaves an unfunded module as a ghost at the chosen site", () => {
    const state = queueModuleBuild(createInitialState(7), "Storage", east);

    expect(state.stations[0]!.construction).toBeNull();
    expect(state.stations[0]!.buildQueue).toEqual([
      { type: "Storage", position: east, size: { width: 30, height: 40 } },
    ]);
  });

  it("starts the front module immediately when an empty queue can pay", () => {
    const state = queueModuleBuild(withSite(createInitialState(7), 25, 25), "Storage", east);

    expect(state.stations[0]!.buildQueue).toEqual([]);
    expect(state.stations[0]!.construction).toMatchObject({ type: "Storage", position: east, timer: BUILD_SECONDS });
    expect(state.stations[0]!.constructionSite.inventory).toEqual({ Metal: 0, Ice: 0 });
  });

  it("builds in click order and never skips the front ghost", () => {
    let state = queueModuleBuild(createInitialState(7), "Dock", east);
    state = queueModuleBuild(state, "Storage", west);
    state = tick(withSite(state, 25, 25), 0);

    expect(state.stations[0]!.construction).toMatchObject({ type: "Dock", position: east });
    expect(state.stations[0]!.buildQueue).toMatchObject([{ type: "Storage", position: west }]);

    state = tick(state, BUILD_SECONDS);
    expect(state.stations[0]!.modules.at(-1)).toMatchObject({ type: "Dock", position: east });
    expect(state.stations[0]!.construction).toBeNull();
    expect(state.stations[0]!.buildQueue).toMatchObject([{ type: "Storage", position: west }]);
  });

  it("offers module sites around ghosts so a row can be queued at once", () => {
    const state = queueModuleBuild(createInitialState(7), "Storage", east);

    expect(availableModuleBuildSites(state, 0)).toContainEqual({ x: 120, y: 0 });
  });

  it("cancels a ghost and anything connected only through it, preserving the rest", () => {
    let state = queueModuleBuild(createInitialState(7), "Storage", east);
    state = queueModuleBuild(state, "Builder", { x: 120, y: 0 });
    state = queueModuleBuild(state, "Dock", west);

    state = cancelQueuedModuleBuild(state, east);

    expect(state.stations[0]!.buildQueue).toMatchObject([{ type: "Dock", position: west }]);
  });

  it("names every ghost that reaches the station only through the cancelled one", () => {
    let state = queueModuleBuild(createInitialState(7), "Storage", east);
    state = queueModuleBuild(state, "Builder", farEast);
    state = queueModuleBuild(state, "Dock", west);
    state = queueModuleBuild(state, "Storage", farWest);

    expect(queuedDependents(state.stations[0]!, 0)).toMatchObject([{ type: "Builder", position: farEast }]);
    expect(queuedDependents(state.stations[0]!, 1)).toEqual([]);
    expect(queuedDependents(state.stations[0]!, 2)).toMatchObject([{ type: "Storage", position: farWest }]);
    expect(queuedDependents(state.stations[0]!, 3)).toEqual([]);
  });

  it("keeps a ghost that still reaches the station through a built module", () => {
    let state = queueModuleBuild(createInitialState(7), "Storage", east);
    state = queueModuleBuild(state, "Builder", farEast);
    state = queueModuleBuild(state, "Dock", west);
    state = queueModuleBuild(state, "Storage", farWest);

    const cancelled = cancelQueuedModuleBuild(state, east);

    expect(cancelled.stations[0]!.buildQueue).toMatchObject([
      { type: "Dock", position: west },
      { type: "Storage", position: farWest },
    ]);
  });

  it("cancels a ghost nothing depends on on its own", () => {
    let state = queueModuleBuild(createInitialState(7), "Storage", east);
    state = queueModuleBuild(state, "Dock", west);

    expect(queuedDependents(state.stations[0]!, 1)).toEqual([]);
    expect(cancelQueuedModuleBuild(state, west).stations[0]!.buildQueue).toMatchObject([
      { type: "Storage", position: east },
    ]);
  });

  it("takes a ghost that would build ahead of the ghost connecting it", () => {
    // A ghost in the gap reaches the station through the ghost behind it, which
    // is built after it, so leaving it queued would finish a module unattached.
    // Seed 17 because seed 7 has an asteroid in the gap.
    let state = queueModuleBuild(withSite(withBuilder(createInitialState(17), { x: -160, y: 0 }), 0, 0), "Builder", west);
    state = queueModuleBuild(state, "Builder", { x: -80, y: 0 });
    state = queueModuleBuild(state, "Builder", { x: -120, y: 0 });

    const cancelled = cancelQueuedModuleBuild(state, west);

    expect(cancelled.stations[0]!.buildQueue.map((queued) => queued.position)).toEqual([{ x: -120, y: 0 }]);

    let built = tick(withSite(cancelled, 200, 200), BUILD_SECONDS);
    built = tick(built, BUILD_SECONDS);
    expect(built.stations[0]!.modules.map((module) => module.position)).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: -160, y: 0 },
      { x: -120, y: 0 },
    ]);
  });

  it("keeps a supply ship and its cargo waiting at Home until something is queued", () => {
    const base = createInitialState(7);
    const loaded = {
      ...base,
      ships: [{ ...base.ships[0]!, state: "holding" as const, position: { ...base.stations[0]!.dock.position }, cargo: 7,
        cargoByMaterial: { Metal: 7, Ice: 0 }, cargoMaterial: "Metal" as const, target: null, leg: null, timer: 0 }],
    };
    const waiting = setDefaultBehaviour(loaded, [0], "supply");

    // Out to the parking spot it waits on, where it sits with its cargo.
    const flying = tick(waiting, 10);
    const parked = tick(flying, flying.ships[0]!.timer);
    expect(parked.ships[0]).toMatchObject({ state: "holding", cargo: 7 });

    const resumed = tick(queueModuleBuild(parked, "Storage", east), 0);
    expect(resumed.ships[0]).toMatchObject({ state: "homebound", cargo: 7 });
  });

  it("brings a supplier home with its cargo when the last ghost is cancelled", () => {
    const base = createInitialState(7);
    const queued = queueModuleBuild(base, "Storage", east);
    const unloading: SimState = {
      ...queued,
      ships: [{ ...queued.ships[0]!, defaultBehaviour: "supply", state: "unloading",
        position: { ...queued.stations[0]!.constructionSite.position }, cargo: 7, cargoByMaterial: { Metal: 7, Ice: 0 },
        cargoMaterial: "Metal", transfer: { startingCargo: 7, amount: 7, destination: "constructionSite" }, timer: 4,
        target: null, leg: null, berth: null }],
    };

    const cancelled = cancelQueuedModuleBuild(unloading, east);
    const returning = tick(cancelled, 0);
    expect(returning.ships[0]).toMatchObject({ state: "homebound", cargo: 7 });

    // Home, and then out to the parking spot it waits on.
    const flying = tick(returning, returning.ships[0]!.timer);
    const waiting = tick(flying, flying.ships[0]!.timer);
    expect(waiting.ships[0]).toMatchObject({ state: "holding", cargo: 7 });
    expect(waiting.stations[0]!.constructionSite.inventory).toEqual({ Metal: 0, Ice: 0 });
  });

  it("sends three parked suppliers to the site as soon as a module is queued", () => {
    let parked = tick(suppliersComingHome(3), 0);
    for (let i = 0; i < 400 && !parked.ships.every((ship) => ship.state === "holding"); i += 1) {
      parked = tick(parked, 0.5);
    }
    expect(parked.ships.map((ship) => ship.state)).toEqual(Array(3).fill("holding"));
    const site = parked.stations[0]!.constructionSite.inventory;
    // The site cannot pay for this one, so it stays a ghost and the suppliers
    // are wanted again.
    const queued = queueModuleBuild(parked, "Storage", east);

    const leaving = tick(queued, 0);
    // Each leaves from the spot it parked on, so three ships leave three spots.
    const left = leaving.ships.map((ship) => `${ship.leg?.from?.x},${ship.leg?.from?.y}`);
    expect(leaving.ships).toMatchObject(Array(3).fill({ state: "homebound", cargo: 7 }));
    expect(left).toEqual(parked.ships.map((ship) => `${ship.position.x},${ship.position.y}`));
    expect(new Set(left).size).toBe(3);

    let delivered = leaving;
    for (let i = 0; i < 2000 && delivered.stations[0]!.constructionSite.inventory.Metal < site.Metal + 21; i += 1) {
      delivered = tick(delivered, 0.5);
    }
    expect(delivered.stations[0]!.constructionSite.inventory.Metal).toBe(site.Metal + 21);
    expect(delivered.ships.map((ship) => ship.cargo)).toEqual([0, 0, 0]);
  });

  it("leaves a supply ship at its Move destination while a build is queued", () => {
    const base = createInitialState(7);
    const supply = setDefaultBehaviour(base, [0], "supply");
    const queued = queueModuleBuild(supply, "Storage", east);
    const moved = giveOrder(queued, [0], { kind: "move", point: { x: 300, y: 300 }, sectorId: 0 });
    const arrived = tick(moved, 10000);

    expect(arrived.ships[0]).toMatchObject({ state: "holding", position: { x: 300, y: 300 }, order: { kind: "move" } });
  });
});
