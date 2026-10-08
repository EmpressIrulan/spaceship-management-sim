import { describe, expect, it } from "vitest";
import { foundedStation, oneStorageStart, suppliersComingHome } from "./test-ships";
import {
  DOCK_SIZE,
  MATERIALS,
  availableModuleBuildSites,
  availableModuleBuilds,
  availableShipBuild,
  cargoTransferSeconds,
  createInitialState,
  dockBerths,
  giveOrder,
  queueModuleBuild,
  resumeDefault,
  setDefaultBehaviour,
  shipSize,
  startModuleBuild,
  startShipBuild,
  tick,
  type Ship,
  type SimState,
  type Station,
  type StationModule,
  type Vec,
} from "./index";
import { depart } from "./state";

const site = (state: SimState) => state.stations[0]!.constructionSite;
const siteTotal = (state: SimState) => site(state).inventory.Metal + site(state).inventory.Ice;
const near = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y) < 0.5;
const apart = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

// Ticks in small steps until `done` holds, so a test can stop at the moment a
// ship changes state.
function until(state: SimState, done: (state: SimState) => boolean, step = 0.1, limit = 20000): SimState {
  let now = state;
  for (let i = 0; i < limit; i += 1) {
    if (done(now)) return now;
    now = tick(now, step);
  }
  throw new Error("condition never reached");
}

// The longest distance ship 0 covers in one 0.1 s step before `done` holds. A
// ship that is moved without flying shows up as a jump far above its speed.
function longestJump(state: SimState, done: (state: SimState) => boolean): number {
  let now = state;
  let longest = 0;
  for (let i = 0; i < 20000 && !done(now); i += 1) {
    const next = tick(now, 0.1);
    const from = now.ships[0]!.position;
    longest = Math.max(longest, Math.hypot(next.ships[0]!.position.x - from.x, next.ships[0]!.position.y - from.y));
    now = next;
  }
  return longest;
}
const unloadingNow = (state: SimState) => state.ships[0]!.state === "unloading";

// The one ship mines a small hold, so a trip is ten units and a load takes 6 s.
function minerOn(behaviour: Ship["defaultBehaviour"], seed = 7): SimState {
  const base = oneStorageStart(seed);
  const dock = base.stations[0]!.dock.position;
  const ship = { ...base.ships[0]!, defaultBehaviour: behaviour };
  const state = { ...base, ships: [depart(ship, dock, base.asteroids)] };
  return behaviour === "supply" ? queueModuleBuild(state, "Storage", { x: 80, y: 0 }) : state;
}

describe("the construction site", () => {
  it("starts beside Home, empty, with no cap", () => {
    const state = createInitialState(7);
    const { position, size, inventory } = site(state);

    expect(inventory).toEqual({ Metal: 0, Ice: 0 });
    expect(site(state)).not.toHaveProperty("capacity");
    expect(Math.hypot(position.x - state.stations[0]!.dock.position.x, position.y - state.stations[0]!.dock.position.y)).toBeLessThan(120);
    expect(size.width).toBeGreaterThan(0);
  });

  it("stays clear of every module slot Home offers and of every asteroid", () => {
    const state = createInitialState(7);
    const { position, size } = site(state);
    for (const slot of availableModuleBuildSites(state, 0)) {
      const overlaps = Math.abs(slot.x - position.x) < (40 + size.width) / 2 && Math.abs(slot.y - position.y) < (70 + size.height) / 2;
      expect(overlaps, JSON.stringify(slot)).toBe(false);
    }
    expect(availableModuleBuildSites(state, 0)).toEqual([{ x: -40, y: 0 }, { x: 0, y: -40 }, { x: 0, y: 40 }, { x: 40, y: -40 }, { x: 40, y: 40 }, { x: 80, y: 0 }]);
    expect(state.asteroids.every((rock) => Math.hypot(rock.position.x - position.x, rock.position.y - position.y) > 40)).toBe(true);
  });
});

describe("seeds whose belt runs across Home", () => {
  it("still start a game, with every starting field full", () => {
    for (const seed of [28, 95, 316, 680, 1410, 1656]) {
      const state = createInitialState(seed);
      expect(state.asteroids.length, `seed ${seed}`).toBeGreaterThan(0);
    }
  });
});

describe("building from the construction site", () => {
  const east = { x: 80, y: 0 };
  const withSite = (state: SimState, inventory: Station["inventory"]): SimState =>
    ({ ...state, stations: [{ ...state.stations[0]!, constructionSite: { ...site(state), inventory } }] });
  const withStorage = (state: SimState, inventory: Station["inventory"]): SimState =>
    ({ ...state, stations: [{ ...state.stations[0]!, inventory }] });

  it("greys out an option the site cannot pay and says what is missing", () => {
    const state = withSite(withStorage(createInitialState(7), { Metal: 500, Ice: 500 }), { Metal: 30, Ice: 10 });

    expect(availableModuleBuilds(state, 0).map(({ enabled, missing }) => ({ enabled, missing })))
      .toEqual([
        ...Array(3).fill({ enabled: false, missing: { Metal: 0, Ice: 15 } }),
        { enabled: false, missing: { Metal: 970, Ice: 990 } },
      ]);
  });

  it("does not pay from Storage, however full it is", () => {
    const state = withStorage(createInitialState(7), { Metal: 500, Ice: 500 });

    expect(startModuleBuild(state, 0, "Storage", east)).toBe(state);
  });

  it("pays from the site and leaves Storage exactly as it was", () => {
    const funded = withSite(withStorage(createInitialState(7), { Metal: 77, Ice: 33 }), { Metal: 40, Ice: 25 });

    const building = startModuleBuild(funded, 0, "Dock", east);

    expect(site(building).inventory).toEqual({ Metal: 15, Ice: 0 });
    expect(building.stations[0]!.inventory).toEqual({ Metal: 77, Ice: 33 });
    expect(tick(building, 15).stations[0]!.inventory).toEqual({ Metal: 77, Ice: 33 });
  });

  it("never moves ore from Storage into the site by itself", () => {
    const rich = withStorage(minerOn("mine"), { Metal: 90, Ice: 0 });
    const later = tick(rich, 600);

    expect(site(later).inventory).toEqual({ Metal: 0, Ice: 0 });
    expect(MATERIALS.reduce((sum, material) => sum + later.stations[0]!.inventory[material], 0)).toBeGreaterThan(90);
  });

  it("still pays for ships at a Builder from Storage", () => {
    const base = createInitialState(7);
    const builder: StationModule = { type: "Builder", position: { x: 0, y: -40 }, size: { width: 30, height: 40 } };
    const state = withStorage({ ...base, stations: [{ ...base.stations[0]!, modules: [...base.stations[0]!.modules, builder] }] }, { Metal: 1000, Ice: 1000 });
    const design = base.ships[0]!.design;

    expect(availableShipBuild(state, 2, design)).toBe(true);
    const building = startShipBuild(state, 2, design);

    expect(building.stations[0]!.inventory.Metal).toBeLessThan(1000);
    expect(site(building).inventory).toEqual({ Metal: 0, Ice: 0 });
  });
});

describe("Supply construction site", () => {
  it("mines and unloads into the site, trip after trip, never into Storage", () => {
    let state = minerOn("supply");
    const storage = state.stations[0]!.inventory;
    let unloadings = 0;
    for (let i = 0; i < 4000; i += 1) {
      const before = state.ships[0]!.state;
      state = tick(state, 0.1);
      if (before !== "unloading" && state.ships[0]!.state === "unloading") unloadings += 1;
    }

    expect(unloadings).toBeGreaterThanOrEqual(3);
    expect(longestJump(minerOn("supply"), (now) => now.time > 300)).toBeLessThan(6);
    expect(siteTotal(state)).toBeGreaterThan(0);
    expect(state.stations[0]!.construction ?? state.stations[0]!.modules[2]).toMatchObject({ type: "Storage" });
    expect(state.stations[0]!.inventory).toEqual(storage);
  });

  it("takes time to unload, a unit at a time, like unloading at the Dock", () => {
    const start = minerOn("supply");
    const arrived = until(start, (state) => state.ships[0]!.state === "unloading");
    const ship = arrived.ships[0]!;
    const before = siteTotal(arrived);
    const seconds = cargoTransferSeconds(ship.cargo);

    expect(near(ship.position, site(arrived).position)).toBe(true);
    expect(ship.berth).toBeNull();
    expect(seconds).toBeGreaterThan(0);

    const half = tick(arrived, seconds / 2);
    expect(half.ships[0]!.state).toBe("unloading");
    expect(siteTotal(half)).toBeGreaterThan(before);
    expect(siteTotal(half)).toBeLessThan(before + ship.cargo);
    expect(half.ships[0]!.cargo).toBeGreaterThan(0);

    const done = tick(arrived, seconds + 0.01);
    expect(siteTotal(done)).toBe(before + ship.cargo);
    expect(done.ships[0]).toMatchObject({ cargo: 0, state: "outbound" });
  });

  it("flies from the site to the next rock instead of jumping back to the Dock first", () => {
    const arrived = until(minerOn("supply"), (state) => state.ships[0]!.state === "unloading");
    const out = tick(arrived, cargoTransferSeconds(arrived.ships[0]!.cargo) + 0.01);

    expect(near(out.ships[0]!.leg?.from ?? out.ships[0]!.position, site(out).position)).toBe(true);
  });

  it("sends a ship that was on Mine for Station to the site once it is switched", () => {
    const hauling = until(minerOn("mine"), (state) => state.ships[0]!.state === "homebound" && state.ships[0]!.cargo > 0);
    const storage = hauling.stations[0]!.inventory;

    const switched = setDefaultBehaviour(queueModuleBuild(hauling, "Storage", { x: 80, y: 0 }), [0], "supply");
    expect(longestJump(switched, unloadingNow)).toBeLessThan(6);
    const arrived = until(switched, unloadingNow);

    expect(near(arrived.ships[0]!.position, site(arrived).position)).toBe(true);
    const unloaded = tick(arrived, cargoTransferSeconds(arrived.ships[0]!.cargo) + 0.01);
    expect(unloaded.stations[0]!.inventory).toEqual(storage);
    expect(siteTotal(unloaded)).toBe(10);
  });

  it("sends a ship flying to the site to the Dock once it is switched back", () => {
    const toSite = until(minerOn("supply"), (state) => state.ships[0]!.state === "homebound" && state.ships[0]!.cargo > 0);
    const switched = setDefaultBehaviour(toSite, [0], "mine");
    expect(longestJump(switched, unloadingNow)).toBeLessThan(6);
    const arrived = until(switched, unloadingNow);

    expect(near(arrived.ships[0]!.position, site(arrived).position)).toBe(false);
    expect(arrived.ships[0]!.berth).not.toBeNull();
    expect(siteTotal(tick(arrived, 30))).toBe(0);
    expect(tick(arrived, 30).stations[0]!.inventory.Metal + tick(arrived, 30).stations[0]!.inventory.Ice).toBe(40 + 10);
  });
});

describe("right-clicking a ship onto the site", () => {
  const loaded = () => until(minerOn("mine"), (state) => state.ships[0]!.state === "homebound" && state.ships[0]!.cargo > 0);

  it("delivers the cargo once, then returns to the default", () => {
    const hauling = loaded();
    const cargo = hauling.ships[0]!.cargo;
    const storage = hauling.stations[0]!.inventory;

    const ordered = giveOrder(hauling, [0], { kind: "supplyBuild", stationId: 0 });
    expect(ordered.ships[0]!.order).not.toBeNull();
    expect(longestJump(ordered, unloadingNow)).toBeLessThan(6);

    const arrived = until(ordered, (state) => state.ships[0]!.state === "unloading");
    expect(near(arrived.ships[0]!.position, site(arrived).position)).toBe(true);
    expect(siteTotal(arrived)).toBe(0);

    const done = tick(arrived, cargoTransferSeconds(cargo) + 0.01);
    expect(siteTotal(done)).toBe(cargo);
    expect(done.stations[0]!.inventory).toEqual(storage);
    expect(done.ships[0]).toMatchObject({ order: null, cargo: 0, state: "outbound", defaultBehaviour: "mine" });
  });

  it("goes back to Storage on the next trip, because the order was only once", () => {
    const hauling = loaded();
    const ordered = giveOrder(hauling, [0], { kind: "supplyBuild", stationId: 0 });
    const later = tick(ordered, 300);

    expect(siteTotal(later)).toBe(hauling.ships[0]!.cargo);
    expect(later.stations[0]!.inventory.Metal + later.stations[0]!.inventory.Ice).toBeGreaterThan(40);
  });

  it("does nothing for a ship with no cargo", () => {
    const empty = minerOn("mine");

    expect(giveOrder(empty, [0], { kind: "supplyBuild", stationId: 0 })).toEqual(empty);
  });
});

describe("unloading a ship into the site at the end of a trip", () => {
  // A ship at the site with a hold of 6 Metal and 14 Ice, Ice being the active material.
  function mixedHold(patch: Partial<Ship> = {}): SimState {
    const base = createInitialState(7);
    const ship: Ship = { ...base.ships[0]!, state: "unloading", position: { ...site(base).position }, cargo: 20, cargoMaterial: "Ice",
      cargoByMaterial: { Metal: 6, Ice: 14 }, transfer: { startingCargo: 20, amount: 20, destination: "constructionSite" },
      timer: cargoTransferSeconds(20), target: null, leg: null, berth: null, ...patch };
    const state = { ...base, ships: [ship] };
    return ship.defaultBehaviour === "supply" ? queueModuleBuild(state, "Storage", { x: 80, y: 0 }) : state;
  }

  it("credits each material in a mixed hold, not everything to the active one", () => {
    const done = tick(mixedHold({ defaultBehaviour: "supply" }), cargoTransferSeconds(20) + 0.01);

    expect(site(done).inventory).toEqual({ Metal: 6, Ice: 14 });
    expect(done.ships[0]).toMatchObject({ cargo: 0, cargoMaterial: null, cargoByMaterial: { Metal: 0, Ice: 0 } });
  });

  it("keeps the site and the hold in step while the unloading is under way", () => {
    const half = tick(mixedHold({ defaultBehaviour: "supply" }), cargoTransferSeconds(20) / 2);
    const ship = half.ships[0]!;

    expect(site(half).inventory.Metal + ship.cargoByMaterial!.Metal).toBe(6);
    expect(site(half).inventory.Ice + ship.cargoByMaterial!.Ice).toBe(14);
    expect(siteTotal(half)).toBe(20 - ship.cargo);
    expect(site(half).inventory.Metal).toBeGreaterThan(0);
  });

  it("resumes the Haul route after a one-time delivery, not mining", () => {
    const base = mixedHold({ defaultBehaviour: "haul", order: { kind: "supplyBuild", stationId: 0, point: { x: 75, y: -60 }, sectorId: 0 },
      haulRoute: { from: "home", to: "station:4", material: "Ice" } });
    const state: SimState = { ...base,
      stations: [...base.stations, foundedStation(4, 1, 120, 40)] };

    const done = tick(state, cargoTransferSeconds(20) + 0.01);

    expect(done.ships[0]).toMatchObject({ order: null, defaultBehaviour: "haul", cargo: 0, state: "haulReturning" });
    expect(done.ships[0]!.target).toBeNull();
  });
});

describe("supply ships with nothing queued", () => {
  it("parks three of them in a spaced row beside the Dock, clear of its pads", () => {
    const flying = tick(suppliersComingHome(3), 0);
    const parked = until(flying, (now) => now.ships.every((ship) => ship.state === "holding"));
    const dock = parked.stations[0]!.dock.position;
    const pads = dockBerths(dock);
    const width = shipSize(parked.ships[0]!.design).width;
    const waiting = parked.ships.filter((ship) => ship.state === "holding");

    expect(waiting).toHaveLength(3);
    for (const ship of waiting) {
      // Still holding its cargo, and on no pad of its own.
      expect(ship).toMatchObject({ berth: null, cargo: 7 });
      // Beside the Dock rather than on it: clear of the hull, and close enough
      // to read as part of the same berth.
      expect(apart(ship.position, dock)).toBeGreaterThan(DOCK_SIZE.width / 2 + width);
      expect(apart(ship.position, dock)).toBeLessThan(150);
      for (const pad of pads) expect(apart(ship.position, pad)).toBeGreaterThan(width);
    }
    // A row, not a pile: every ship sits where it can be picked out on its own.
    for (let i = 0; i < waiting.length; i += 1) {
      for (let j = i + 1; j < waiting.length; j += 1) expect(apart(waiting[i]!.position, waiting[j]!.position)).toBeGreaterThan(width);
    }
  });

  it("parks them in the row when they are switched to Supply at the Dock", () => {
    const base = createInitialState(7);
    const dock = base.stations[0]!.dock.position;
    const idle: Ship[] = Array.from({ length: 3 }, (_, id) => ({
      ...base.ships[0]!,
      id,
      state: "idle",
      position: { ...dock },
      leg: null,
      target: null,
      berth: null,
      transfer: null,
      timer: 0,
      cargo: 0,
      cargoByMaterial: { Metal: 0, Ice: 0 },
      cargoMaterial: null,
    }));

    const switched = setDefaultBehaviour({ ...base, ships: idle, nextShipId: 3 }, [0, 1, 2], "supply");
    const parked = until(tick(switched, 0), (now) => now.ships.every((ship) => ship.state === "holding"));
    const held = parked.ships.filter((ship) => ship.state === "holding");

    expect(held).toHaveLength(3);
    expect(new Set(held.map((ship) => `${ship.position.x},${ship.position.y}`)).size).toBe(3);
    for (const ship of held) expect(apart(ship.position, dock)).toBeGreaterThan(DOCK_SIZE.width / 2);
  });

  it("parks them in the row when an order is cleared at the Dock", () => {
    const base = createInitialState(7);
    const dock = base.stations[0]!.dock.position;
    const ordered: Ship[] = Array.from({ length: 3 }, (_, id) => ({
      ...base.ships[0]!,
      id,
      defaultBehaviour: "supply",
      state: "holding",
      position: { ...dock },
      order: { kind: "move", point: { ...dock }, sectorId: 0 },
      leg: null,
      target: null,
      berth: null,
      transfer: null,
      timer: 0,
      cargo: 0,
      cargoByMaterial: { Metal: 0, Ice: 0 },
      cargoMaterial: null,
    }));

    const cleared = resumeDefault({ ...base, ships: ordered, nextShipId: 3 }, [0, 1, 2]);
    const parked = until(tick(cleared, 0), (now) => now.ships.every((ship) => ship.state === "holding"));

    expect(parked.ships.map((ship) => ship.order)).toEqual([null, null, null]);
    expect(new Set(parked.ships.map((ship) => `${ship.position.x},${ship.position.y}`)).size).toBe(3);
  });
});
