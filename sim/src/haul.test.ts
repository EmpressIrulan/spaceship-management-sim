import { describe, expect, it } from "vitest";
import { claimSiteBuilt } from "./claim";
import { configureHaul, giveOrder, haulStations, resumeDefault, setDefaultBehaviour } from "./orders";
import { createInitialState, STORAGE_CAPACITY, type SimState } from "./state";
import { unloadingSeconds } from "./ship";
import { tick } from "./tick";

function twoStations(): SimState {
  const state = createInitialState(7);
  return {
    ...state,
    sectors: state.sectors.map((sector, index) => ({ ...sector, name: index === 0 ? "Home" : index === 1 ? "Kessel" : sector.name })),
    claimSites: [{ id: 4, sectorId: 1, position: { x: 120, y: 40 }, stage: 2, delivered: { Metal: 0, Ice: 0 }, timer: null }],
    station: { ...state.station, inventory: { Metal: 20, Ice: 40 } },
    ships: [{ ...state.ships[0]!, state: "holding", position: { ...state.station.dock.position }, timer: 0, cargo: 0,
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
  it("lists finished stations by sector name", () => {
    const state = twoStations();
    expect(claimSiteBuilt(state.claimSites[0]!)).toBe(true);
    expect(haulStations(state)).toEqual([
      { id: "home", name: "Home" },
      { id: "claim:4", name: "Kessel" },
    ]);
  });

  it("loads over time, flies through the gate, unloads over time, and repeats", () => {
    let state = twoStations();
    state = configureHaul(state, [0], { from: "home", to: "claim:4", material: "Ice" });
    expect(state.ships[0]).toMatchObject({ defaultBehaviour: "haul", state: "haulLoading", cargo: 0 });

    const halfLoaded = run(state, 3.01);
    expect(halfLoaded.ships[0]).toMatchObject({ state: "haulLoading", cargo: 5, cargoMaterial: "Ice" });
    expect(halfLoaded.ships[0]!.cargoByMaterial).toEqual({ Metal: 0, Ice: 5 });
    expect(halfLoaded.station.inventory.Ice).toBe(35);

    const arrived = until(halfLoaded, (next) => next.ships[0]!.state === "haulUnloading");
    expect(arrived.ships[0]).toMatchObject({ sectorId: 1, cargo: 20 });
    const halfUnloaded = run(arrived, 3.01);
    expect(halfUnloaded.ships[0]!.cargo).toBe(15);
    expect(halfUnloaded.claimSites[0]!.delivered.Ice).toBe(5);

    const repeated = until(halfUnloaded, (next) => next.ships[0]!.state === "haulLoading");
    expect(repeated.ships[0]).toMatchObject({ sectorId: 0, cargo: 0 });
  });

  it("unloads each material in a mixed hold at the haul destination", () => {
    const base = twoStations();
    const ship = base.ships[0]!;
    const start = { ...base, ships: [{ ...ship, sectorId: 1, position: { ...base.claimSites[0]!.position },
      state: "haulUnloading" as const, timer: unloadingSeconds(ship.design), cargo: 20, cargoMaterial: "Ice" as const,
      cargoByMaterial: { Metal: 6, Ice: 14 }, haulRoute: { from: "home" as const, to: "claim:4" as const, material: "Ice" as const } }] };

    const done = tick(start, unloadingSeconds(ship.design));
    expect(done.claimSites[0]!.delivered).toEqual({ Metal: 6, Ice: 14 });
    expect(done.ships[0]).toMatchObject({ cargo: 0, cargoByMaterial: { Metal: 0, Ice: 0 } });
  });

  it("waits at From when the material is absent", () => {
    let state = twoStations();
    state = { ...state, station: { ...state.station, inventory: { ...state.station.inventory, Ice: 0 } } };
    state = configureHaul(state, [0], { from: "home", to: "claim:4", material: "Ice" });
    expect(run(state, 10).ships[0]).toMatchObject({ state: "haulWaitingSource", cargo: 0, position: state.station.dock.position });

    const stocked = { ...state, station: { ...state.station, inventory: { ...state.station.inventory, Ice: 20 } } };
    expect(tick(stocked, 1 / 30).ships[0]!.state).toBe("haulLoading");
  });

  it("does not load while To is full, and waits there if To fills en route", () => {
    const base = twoStations();
    const fullSite = { ...base.claimSites[0]!, delivered: { Metal: STORAGE_CAPACITY, Ice: 0 } };
    let full = { ...base, claimSites: [fullSite] };
    full = configureHaul(full, [0], { from: "home", to: "claim:4", material: "Ice" });
    expect(run(full, 10).ships[0]).toMatchObject({ state: "haulWaitingFull", cargo: 0, position: base.station.dock.position });

    let travelling = configureHaul(base, [0], { from: "home", to: "claim:4", material: "Ice" });
    travelling = until(travelling, (next) => next.ships[0]!.state === "haulOutbound");
    travelling = { ...travelling, claimSites: [{ ...travelling.claimSites[0]!, delivered: { Metal: STORAGE_CAPACITY, Ice: 0 } }] };
    const waiting = until(travelling, (next) => next.ships[0]!.state === "haulWaitingFull" && next.ships[0]!.sectorId === 1);
    expect(waiting.ships[0]).toMatchObject({ cargo: 20, cargoMaterial: "Ice", position: base.claimSites[0]!.position });
  });

  it("a right-click order interrupts hauling and Resume sends the ship back to it", () => {
    let state = configureHaul(twoStations(), [0], { from: "home", to: "claim:4", material: "Ice" });
    state = run(state, 2);
    const cargo = state.ships[0]!.cargo;
    const ordered = giveOrder(state, [0], { kind: "move", point: { x: 30, y: 20 }, sectorId: 0 });
    expect(ordered.ships[0]).toMatchObject({ order: { kind: "move" }, cargo, defaultBehaviour: "haul" });
    const resumed = resumeDefault(ordered, [0]);
    expect(resumed.ships[0]).toMatchObject({ order: null, defaultBehaviour: "haul", cargo });
    expect(["haulOutbound", "haulUnloading"]).toContain(resumed.ships[0]!.state);
  });

  it("returns carried Ice to From before starting a newly selected Metal route", () => {
    let state = configureHaul(twoStations(), [0], { from: "home", to: "claim:4", material: "Ice" });
    state = until(state, (next) => next.ships[0]!.state === "haulOutbound");
    expect(state.ships[0]).toMatchObject({ cargo: 20, cargoMaterial: "Ice" });

    const changed = configureHaul(state, [0], { from: "home", to: "claim:4", material: "Metal" });
    expect(changed.ships[0]).toMatchObject({ state: "haulReturning", cargo: 20, cargoMaterial: "Ice",
      haulRoute: { material: "Metal" } });

    const unloading = until(changed, (next) => next.ships[0]!.state === "haulUnloading");
    const unloaded = run(unloading, 12.01);
    expect(unloaded.station.inventory).toEqual({ Metal: 20, Ice: 40 });
    expect(unloaded.claimSites[0]!.delivered).toEqual({ Metal: 0, Ice: 0 });
  });

  it("returns a loaded miner's material to Home before starting its Haul route", () => {
    const base = twoStations();
    const loaded = { ...base, ships: [{ ...base.ships[0]!, state: "homebound" as const,
      position: { x: 40, y: 20 }, cargo: 10, cargoMaterial: "Ice" as const, defaultBehaviour: "mine" as const }] };

    const hauling = setDefaultBehaviour(loaded, [0], "haul");
    expect(hauling.ships[0]).toMatchObject({ state: "haulReturning", cargo: 10, cargoMaterial: "Ice",
      haulRoute: { from: "home", to: "claim:4", material: "Metal" } });

    const unloading = until(hauling, (next) => next.ships[0]!.state === "haulUnloading");
    const unloaded = run(unloading, 12.01);
    expect(unloaded.station.inventory).toEqual({ Metal: 20, Ice: 50 });
    expect(unloaded.claimSites[0]!.delivered).toEqual({ Metal: 0, Ice: 0 });
  });

  it("keeps a right-click order active when the Haul dropdowns change", () => {
    let state = configureHaul(twoStations(), [0], { from: "home", to: "claim:4", material: "Ice" });
    state = giveOrder(state, [0], { kind: "move", point: { x: 30, y: 20 }, sectorId: 0 });
    const ordered = state.ships[0]!;

    const configured = configureHaul(state, [0], { from: "home", to: "claim:4", material: "Metal" });
    expect(configured.ships[0]).toMatchObject({ state: ordered.state, order: ordered.order,
      leg: ordered.leg, defaultBehaviour: "haul", haulRoute: { material: "Metal" } });
  });

  it("cannot select Haul with only one station", () => {
    const state = createInitialState(7);
    expect(setDefaultBehaviour(state, [0], "haul")).toBe(state);
  });
});
