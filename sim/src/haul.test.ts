import { describe, expect, it } from "vitest";
import { configureHaul, giveOrder, haulStations, resumeDefault, setDefaultBehaviour, setShipHome } from "./orders";
import { haulDestinations } from "./haul";
import { createInitialState, dockBerths, homeStation, type SimState } from "./state";
import { foundedStation } from "./test-ships";
import { cargoTransferSeconds } from "./ship";
import { placeStation } from "./station-placement";
import { tick } from "./tick";

// A founded station in sector 1 with stock to haul, so a route from Home has a
// second stop the way a built-out claim site used to be.
function twoStations(): SimState {
  const state = createInitialState(7);
  const placed = placeStation(state, 1, { x: 120, y: 40 });
  return {
    ...placed,
    hives: [],
    bugs: [],
    sectors: placed.sectors.map((sector, index) => ({ ...sector, name: index === 0 ? "Home" : index === 1 ? "Kessel" : sector.name })),
    stations: [
      { ...placed.stations[0]!, inventory: { Metal: 20, Ice: 40 } },
      foundedStation(1, 1, 120, 40, { Metal: 0, Ice: 0 }),
    ],
    ships: [{ ...placed.ships[0]!, state: "holding", position: { ...placed.stations[0]!.dock.position }, timer: 0, cargo: 0,
      cargoMaterial: null, target: null, order: null, leg: null, defaultBehaviour: "none" }],
  };
}

function run(state: SimState, seconds: number): SimState {
  let next = state;
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 30) next = tick(next, Math.min(1 / 30, seconds - elapsed));
  return next;
}

function until(state: SimState, done: (state: SimState) => boolean): SimState {
  let next = state;
  for (let elapsed = 0; elapsed < 240; elapsed += 1 / 30) {
    if (done(next)) return next;
    next = tick(next, 1 / 30);
  }
  throw new Error("condition never held");
}

describe("Haul default", () => {
  it("lists founded stations by station name", () => {
    const state = twoStations();
    expect(haulStations(state)).toEqual([
      { id: "home", name: "Home" },
      { id: "station:1", name: "Station 1" },
    ]);
  });

  it("loads over time, flies through the gate, unloads over time, and repeats", () => {
    let state = twoStations();
    state = configureHaul(state, [0], { from: "home", to: "station:1", material: "Ice" });
    expect(state.ships[0]).toMatchObject({ defaultBehaviour: "haul", state: "berthing", cargo: 0, berth: 0 });

    const loading = until(state, (next) => next.ships[0]!.state === "haulLoading");
    const halfLoaded = run(loading, 3.01);
    expect(halfLoaded.ships[0]).toMatchObject({ state: "haulLoading", cargo: 5, cargoMaterial: "Ice" });
    expect(halfLoaded.ships[0]!.cargoByMaterial).toEqual({ Metal: 0, Ice: 5 });
    expect(halfLoaded.stations[0]!.inventory.Ice).toBe(35);

    const arrived = until(halfLoaded, (next) => next.ships[0]!.state === "haulUnloading");
    expect(arrived.ships[0]).toMatchObject({ sectorId: 1, cargo: 20 });
    const halfUnloaded = run(arrived, 3.01);
    expect(halfUnloaded.ships[0]!.cargo).toBe(15);
    expect(halfUnloaded.stations[1]!.inventory.Ice).toBe(5);

    const repeated = until(halfUnloaded, (next) => next.ships[0]!.state === "haulLoading");
    expect(repeated.ships[0]).toMatchObject({ sectorId: 0, cargo: 0 });
  });

  it("unloads each material in a mixed hold at the haul destination", () => {
    const base = twoStations();
    const ship = base.ships[0]!;
    const start = { ...base, ships: [{ ...ship, sectorId: 1, position: { ...base.stations[1]!.dock.position },
      state: "haulUnloading" as const, timer: cargoTransferSeconds(20), cargo: 20, cargoMaterial: "Ice" as const,
      transfer: { startingCargo: 20, amount: 20 },
      cargoByMaterial: { Metal: 6, Ice: 14 }, haulRoute: { from: "home" as const, to: "station:1" as const, material: "Ice" as const } }] };

    const done = tick(start, cargoTransferSeconds(20));
    expect(done.stations[1]!.inventory).toEqual({ Metal: 6, Ice: 14 });
    expect(done.ships[0]).toMatchObject({ cargo: 0, cargoByMaterial: { Metal: 0, Ice: 0 } });
  });

  it("shares the Dock's berths and waits for a pad before loading at Home", () => {
    const base = twoStations();
    const ship = base.ships[0]!;
    const crowded = tick({
      ...base,
      stations: [{ ...base.stations[0]!, inventory: { Metal: 0, Ice: 200 }, storage: { ...base.stations[0]!.storage, capacity: 1000 } }, base.stations[1]!],
      ships: [...[0, 1, 2, 3, 4, 5].map((id) => ({ ...ship, id, state: "homebound" as const, cargo: 20,
        cargoMaterial: "Metal" as const })), { ...ship, id: 6 }],
    }, 0);
    const ordered = configureHaul(crowded, [6], { from: "home", to: "station:1", material: "Ice" });

    expect(ordered.ships[6]).toMatchObject({ state: "berthing", berth: null, cargo: 0 });
    const waiting = until(ordered, (next) => next.ships[6]!.state === "waiting");
    const loading = until(waiting, (next) => next.ships[6]!.state === "haulLoading");
    expect(loading.ships[6]).toMatchObject({ cargo: 0, cargoMaterial: "Ice" });
    expect(dockBerths(loading.stations[0]!.dock.position)).toContainEqual(loading.ships[6]!.position);
  });

  it("does not let transfers at a founded station occupy Home's berths", () => {
    const base = twoStations();
    const ship = base.ships[0]!;
    const remote = [0, 1, 2, 3, 4, 5].map((id) => ({
      ...ship,
      id,
      state: "haulUnloading" as const,
      sectorId: 1,
      position: { ...base.stations[1]!.dock.position },
      timer: 12,
      cargo: 20,
      cargoMaterial: "Ice" as const,
      defaultBehaviour: "haul" as const,
      haulRoute: { from: "home" as const, to: "station:1" as const, material: "Ice" as const },
      berth: null,
      transfer: { startingCargo: 20, amount: 20 },
    }));
    const arriving = { ...ship, id: 6, state: "homebound" as const, position: { ...base.stations[0]!.dock.position },
      timer: 0, cargo: 20, cargoMaterial: "Metal" as const };
    const state = { ...base, stations: [{ ...base.stations[0]!, storage: { ...base.stations[0]!.storage, capacity: 1000 } }, base.stations[1]!],
      ships: [...remote, arriving] };

    const docked = tick(state, 0);
    expect(docked.ships[6]).toMatchObject({ state: "berthing", berth: 0 });
    expect(docked.ships[6]!.leg?.to).toEqual(dockBerths(base.stations[0]!.dock.position)[0]);
  });

  it("waits at From when the material is absent", () => {
    let state = twoStations();
    state = { ...state, stations: [{ ...state.stations[0]!, inventory: { ...state.stations[0]!.inventory, Ice: 0 } }, state.stations[1]!] };
    state = configureHaul(state, [0], { from: "home", to: "station:1", material: "Ice" });
    expect(run(state, 10).ships[0]).toMatchObject({ state: "haulWaitingSource", cargo: 0, position: state.stations[0]!.dock.position });

    const stocked = { ...state, stations: [{ ...state.stations[0]!, inventory: { ...state.stations[0]!.inventory, Ice: 20 } }, state.stations[1]!] };
    const approaching = tick(stocked, 1 / 30);
    expect(approaching.ships[0]).toMatchObject({ state: "berthing", berth: 0 });
    expect(until(approaching, (next) => next.ships[0]!.state === "haulLoading").ships[0]!.cargo).toBe(0);
  });

  it("does not load while To is full, and waits there if To fills en route", () => {
    const base = twoStations();
    const fullStore = foundedStation(1, 1, 120, 40, { Metal: 1000, Ice: 0 });
    let full = { ...base, stations: [base.stations[0]!, fullStore] };
    full = configureHaul(full, [0], { from: "home", to: "station:1", material: "Ice" });
    expect(run(full, 10).ships[0]).toMatchObject({ state: "haulWaitingFull", cargo: 0, position: base.stations[0]!.dock.position });

    let travelling = configureHaul(base, [0], { from: "home", to: "station:1", material: "Ice" });
    travelling = until(travelling, (next) => next.ships[0]!.state === "haulOutbound");
    travelling = { ...travelling, stations: [travelling.stations[0]!, foundedStation(1, 1, 120, 40, { Metal: 1000, Ice: 0 })] };
    const waiting = until(travelling, (next) => next.ships[0]!.state === "haulWaitingFull" && next.ships[0]!.sectorId === 1);
    expect(waiting.ships[0]).toMatchObject({ cargo: 20, cargoMaterial: "Ice", position: base.stations[1]!.dock.position });
  });

  it("a right-click order interrupts hauling and Resume sends the ship back to it", () => {
    let state = configureHaul(twoStations(), [0], { from: "home", to: "station:1", material: "Ice" });
    state = until(state, (next) => next.ships[0]!.state === "haulLoading");
    state = run(state, 2);
    const cargo = state.ships[0]!.cargo;
    const ordered = giveOrder(state, [0], { kind: "move", point: { x: 30, y: 20 }, sectorId: 0 });
    expect(ordered.ships[0]).toMatchObject({ order: { kind: "move" }, cargo, defaultBehaviour: "haul" });
    const resumed = resumeDefault(ordered, [0]);
    expect(resumed.ships[0]).toMatchObject({ order: null, defaultBehaviour: "haul", cargo });
    expect(["haulOutbound", "haulUnloading"]).toContain(resumed.ships[0]!.state);
  });

  it("returns carried Ice to From before starting a newly selected Metal route", () => {
    let state = configureHaul(twoStations(), [0], { from: "home", to: "station:1", material: "Ice" });
    state = until(state, (next) => next.ships[0]!.state === "haulOutbound");
    expect(state.ships[0]).toMatchObject({ cargo: 20, cargoMaterial: "Ice" });

    const changed = configureHaul(state, [0], { from: "home", to: "station:1", material: "Metal" });
    expect(changed.ships[0]).toMatchObject({ state: "haulReturning", cargo: 20, cargoMaterial: "Ice",
      haulRoute: { material: "Metal" } });

    const unloading = until(changed, (next) => next.ships[0]!.state === "haulUnloading");
    const unloaded = run(unloading, 12.01);
    expect(unloaded.stations[0]!.inventory).toEqual({ Metal: 20, Ice: 40 });
    expect(unloaded.stations[1]!.inventory).toEqual({ Metal: 0, Ice: 0 });
  });

  it("returns a loaded miner's material to Home before starting its Haul route", () => {
    const base = twoStations();
    const loaded = { ...base, ships: [{ ...base.ships[0]!, state: "homebound" as const,
      position: { x: 40, y: 20 }, cargo: 10, cargoMaterial: "Ice" as const, defaultBehaviour: "mine" as const }] };

    const hauling = setDefaultBehaviour(loaded, [0], "haul");
    expect(hauling.ships[0]).toMatchObject({ state: "haulReturning", cargo: 10, cargoMaterial: "Ice",
      haulRoute: { from: "home", to: "station:1", material: "Metal" } });

    const unloading = until(hauling, (next) => next.ships[0]!.state === "haulUnloading");
    const unloaded = until(unloading, (next) => next.ships[0]!.state !== "haulUnloading");
    expect(unloaded.stations[0]!.inventory).toEqual({ Metal: 20, Ice: 50 });
    expect(unloaded.stations[1]!.inventory).toEqual({ Metal: 0, Ice: 0 });
  });

  it("keeps a right-click order active when the Haul dropdowns change", () => {
    let state = configureHaul(twoStations(), [0], { from: "home", to: "station:1", material: "Ice" });
    state = giveOrder(state, [0], { kind: "move", point: { x: 30, y: 20 }, sectorId: 0 });
    const ordered = state.ships[0]!;

    const configured = configureHaul(state, [0], { from: "home", to: "station:1", material: "Metal" });
    expect(configured.ships[0]).toMatchObject({ state: ordered.state, order: ordered.order,
      leg: ordered.leg, defaultBehaviour: "haul", haulRoute: { material: "Metal" } });
  });

  it("defaults a one-station hauler to Home Storage -> Home construction site", () => {
    const state = createInitialState(7);
    expect(setDefaultBehaviour(state, [0], "haul").ships[0]).toMatchObject({
      defaultBehaviour: "haul",
      haulRoute: { from: "home", to: "site:0", material: "Metal" },
    });
  });
});

describe("Haul to construction sites (criteria 1-2)", () => {
  it("lists each station's Storage and its construction site as To destinations", () => {
    expect(haulDestinations(twoStations())).toEqual([
      { id: "home", name: "Home" },
      { id: "site:0", name: "Home construction site" },
      { id: "station:1", name: "Station 1" },
      { id: "site:1", name: "Station 1 construction site" },
    ]);
  });

  it("offers only Home Storage and Home construction site with one station", () => {
    expect(haulDestinations(createInitialState(7))).toEqual([
      { id: "home", name: "Home" },
      { id: "site:0", name: "Home construction site" },
    ]);
  });

  it("accepts a Haul order from Home Storage to Home construction site with one station", () => {
    const state = configureHaul(createInitialState(7), [0], { from: "home", to: "site:0", material: "Metal" });
    expect(state.ships[0]).toMatchObject({ defaultBehaviour: "haul", haulRoute: { from: "home", to: "site:0", material: "Metal" } });
  });

  it("a hauler on a site route starts delivering without an order queued", () => {
    const initial = createInitialState(7);
    const stocked = { ...initial, stations: [{ ...initial.stations[0]!, inventory: { Metal: 20, Ice: 20 } }] };
    const state = configureHaul(stocked, [0], { from: "home", to: "site:0", material: "Metal" });
    const later = run(state, 10);
    expect(later.ships[0]!.cargo + later.stations[0]!.constructionSite.inventory.Metal).toBeGreaterThan(0);
  });

  it("keeps To a different stop and From a Storage", () => {
    const state = twoStations();
    expect(configureHaul(state, [0], { from: "site:1" as never, to: "home", material: "Metal" })).toBe(state);
    expect(configureHaul(state, [0], { from: "home", to: "home", material: "Metal" })).toBe(state);
  });
});

describe("Haul to construction sites (delivery loop)", () => {
  it("loads at From, unloads into the site over time, and repeats", () => {
    const base = createInitialState(7);
    const stocked = { ...base, stations: [{ ...base.stations[0]!, inventory: { Metal: 100, Ice: 20 } }] };
    let state = configureHaul(stocked, [0], { from: "home", to: "site:0", material: "Metal" });
    const loading = until(state, (next) => next.ships[0]!.state === "haulLoading");
    const unloading = until(loading, (next) => next.ships[0]!.state === "haulUnloading");
    // Unloading into the site takes the same timed transfer as at the Dock (#48).
    // The sampler lands partway into the first countdown tick.
    expect(unloading.ships[0]!.timer).toBeCloseTo(cargoTransferSeconds(20), 0);
    const mid = run(unloading, 3.01);
    expect(mid.ships[0]).toMatchObject({ cargo: 15, cargoMaterial: "Metal" });
    expect(mid.stations[0]!.constructionSite.inventory.Metal).toBe(5);

    const repeated = until(mid, (next) => next.ships[0]!.state === "haulLoading");
    expect(repeated.ships[0]).toMatchObject({ cargo: 0 });
    expect(repeated.stations[0]!.inventory).toEqual({ Metal: 80, Ice: 20 });
    expect(repeated.stations[0]!.constructionSite.inventory).toEqual({ Metal: 20, Ice: 0 });
  });

  it("never waits for room, since the site has no cap", () => {
    const base = createInitialState(7);
    const stacked = { ...base, stations: [{ ...base.stations[0]!, inventory: { Metal: 20, Ice: 20 },
      constructionSite: { ...base.stations[0]!.constructionSite, inventory: { Metal: 100000, Ice: 0 } } }] };
    let state = configureHaul(stacked, [0], { from: "home", to: "site:0", material: "Metal" });
    const unloading = until(state, (next) => next.ships[0]!.state === "haulUnloading");
    const done = run(unloading, 12.01);
    expect(done.ships[0]!.cargo).toBe(0);
    expect(done.stations[0]!.constructionSite.inventory.Metal).toBe(100020);
    expect(run(state, 30).ships[0]!.state).not.toBe("haulWaitingFull");
  });

  it("unloads into another station's site through the gate, not its Storage", () => {
    const base = twoStations();
    let state = configureHaul(base, [0], { from: "home", to: "site:1", material: "Ice" });
    const unloading = until(state, (next) => next.ships[0]!.state === "haulUnloading");
    expect(unloading.ships[0]).toMatchObject({ sectorId: 1, position: base.stations[1]!.constructionSite.position });
    const done = run(unloading, 12.01);
    expect(done.stations[1]!.constructionSite.inventory).toEqual({ Metal: 0, Ice: 20 });
    expect(done.stations[1]!.inventory).toEqual({ Metal: 0, Ice: 0 });
  });

  it("a right-click order interrupts a site run and Resume sends the ship back to it", () => {
    const initial = createInitialState(7);
    const stocked = { ...initial, stations: [{ ...initial.stations[0]!, inventory: { Metal: 20, Ice: 20 } }] };
    let state = configureHaul(stocked, [0], { from: "home", to: "site:0", material: "Metal" });
    state = until(state, (next) => next.ships[0]!.state === "haulUnloading");
    const cargo = state.ships[0]!.cargo;
    const ordered = giveOrder(state, [0], { kind: "move", point: { x: 30, y: 20 }, sectorId: 0 });
    const resumed = resumeDefault(ordered, [0]);
    expect(resumed.ships[0]).toMatchObject({ order: null, defaultBehaviour: "haul", cargo });
    expect(["haulOutbound", "haulUnloading"]).toContain(resumed.ships[0]!.state);
  });
});

describe("Haul across stations", () => {
  it("a ship based at a station hauls to the primary's construction site", () => {
    let state = setShipHome(twoStations(), [0], 1);
    state = { ...state, stations: [state.stations[0]!, { ...state.stations[1]!, inventory: { Metal: 0, Ice: 20 } }] };
    state = configureHaul(state, [0], { from: "station:1", to: "site:0", material: "Ice" });

    const unloading = until(state, (next) => next.ships[0]!.state === "haulUnloading" && next.ships[0]!.cargo > 0);
    const mid = run(unloading, 3.01);
    // The ore arrives in the site the route names, station 0's, not in the
    // hauler's own station's site, and never leaves the ship uncredited.
    expect(mid.ships[0]!.cargo).toBe(15);
    expect(mid.stations[0]!.constructionSite.inventory.Ice).toBe(5);
    expect(mid.stations[1]!.constructionSite.inventory.Ice).toBe(0);

    const delivered = until(mid, (next) => next.stations[0]!.constructionSite.inventory.Ice >= 20);
    expect(delivered.ships[0]!.cargo).toBe(0);
    expect(delivered.stations[1]!.constructionSite.inventory.Ice).toBe(0);
  });
});
