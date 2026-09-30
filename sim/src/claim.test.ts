import { describe, expect, it } from "vitest";
import {
  CLAIM_BUILD_SECONDS,
  CLAIM_MODULE_COST,
  claimSiteNeeds,
  removeClaimSite,
  renameSector,
  sectorClaimed,
  startClaimSite,
} from "./claim";
import { giveOrder } from "./orders";
import { unloadingSeconds } from "./ship";
import { createInitialState, type Ship, type SimState, type Vec } from "./state";
import { tick } from "./tick";

function until(state: SimState, done: (state: SimState) => boolean, limit = 240): SimState {
  let next = state;
  for (let elapsed = 0; elapsed < limit; elapsed += 1 / 30) {
    if (done(next)) return next;
    next = tick(next, 1 / 30);
  }
  throw new Error("condition never held");
}

// The first spot on a coarse grid that the sim accepts, so a test does not
// depend on where a seed happened to put its asteroids.
function place(state: SimState, sectorId: number, skip = 0): { state: SimState; position: Vec } {
  let seen = 0;
  for (let y = -300; y <= 300; y += 50) {
    for (let x = -300; x <= 300; x += 50) {
      const next = startClaimSite(state, sectorId, { x, y });
      if (next !== state && seen++ >= skip) return { state: next, position: { x, y } };
    }
  }
  throw new Error("no free spot");
}

function loaded(state: SimState, cargo: number, material: "Metal" | "Ice", changes: Partial<Ship> = {}): SimState {
  const ship = state.ships[0]!;
  return {
    ...state,
    ships: [{ ...ship, state: "holding", position: { ...state.station.dock.position }, timer: 0, cargo,
      cargoMaterial: material, target: null, leg: null, order: null, defaultBehaviour: "none", ...changes }],
  };
}

function deliver(state: SimState, siteId: number, material: "Metal" | "Ice", amount: number): SimState {
  const start = loaded(state, amount, material);
  const ordered = giveOrder(start, [0], { kind: "supplySite", siteId });
  return until(ordered, (next) => next.ships[0]!.order === null && next.ships[0]!.cargo === 0);
}

describe("claim station sites", () => {
  it("places sites in any sector, several to a sector", () => {
    let state = createInitialState(7);
    for (const sectorId of [0, 1, 2, 3]) state = place(state, sectorId).state;
    state = place(state, 1, 1).state;
    state = place(state, 1, 3).state;
    expect(state.claimSites.map((site) => site.sectorId)).toEqual([0, 1, 2, 3, 1, 1]);
    expect(new Set(state.claimSites.map((site) => site.id)).size).toBe(6);
    expect(claimSiteNeeds(state.claimSites[0]!)).toMatchObject({ building: "Dock", next: "Storage", seconds: null });
  });

  it("refuses a spot on top of another site, an asteroid, or a station module", () => {
    const start = createInitialState(7);
    const { state, position } = place(start, 1);
    expect(startClaimSite(state, 1, { x: position.x + 30, y: position.y })).toBe(state);
    expect(startClaimSite(start, 1, { ...start.asteroids.find((rock) => rock.sectorId === 1)!.position })).toBe(start);
    expect(startClaimSite(start, 0, { ...start.station.dock.position })).toBe(start);
    expect(startClaimSite(start, 9, { x: 0, y: 0 })).toBe(start);
  });

  it("takes the cargo of a ship ordered to it and leaves the station's stock alone", () => {
    const { state: withSite } = place(createInitialState(7), 0);
    const start = loaded(withSite, 10, "Metal");
    const ordered = giveOrder(start, [0], { kind: "supplySite", siteId: 0 });
    expect(ordered.ships[0]).toMatchObject({ state: "moving", cargo: 10 });
    const done = until(ordered, (next) => next.ships[0]!.order === null);
    expect(done.claimSites[0]!.delivered).toEqual({ Metal: 10, Ice: 0 });
    expect(done.ships[0]!.cargo).toBe(0);
    expect(done.station.inventory).toEqual(start.station.inventory);
  });

  it("unloads over the same time as at the Dock, one unit at a time", () => {
    const { state: withSite } = place(createInitialState(7), 0);
    const start = loaded(withSite, 20, "Metal");
    const arrived = until(giveOrder(start, [0], { kind: "supplySite", siteId: 0 }), (next) => next.ships[0]!.state === "unloading");
    const seconds = unloadingSeconds(arrived.ships[0]!.design);
    expect(arrived.claimSites[0]!.delivered.Metal).toBe(0);
    expect(arrived.ships[0]!.cargo).toBe(20);
    const half = tick(arrived, seconds / 2);
    expect(half.ships[0]!.state).toBe("unloading");
    expect(half.claimSites[0]!.delivered.Metal).toBeGreaterThan(0);
    expect(half.claimSites[0]!.delivered.Metal).toBeLessThan(20);
    expect(half.claimSites[0]!.delivered.Metal + half.ships[0]!.cargo).toBe(20);
    const done = tick(arrived, seconds + 0.01);
    expect(done.ships[0]).toMatchObject({ cargo: 0, order: null });
    expect(done.claimSites[0]!.delivered.Metal).toBe(20);
  });

  it("does not use up a Dock berth while unloading at a site", () => {
    const { state: withSite } = place(createInitialState(7), 0);
    const start = loaded(withSite, 20, "Metal");
    const arrived = until(giveOrder(start, [0], { kind: "supplySite", siteId: 0 }), (next) => next.ships[0]!.state === "unloading");
    const waiting = { ...arrived, ships: [...arrived.ships, { ...arrived.ships[0]!, id: 9, state: "waiting" as const, order: null, timer: 0 }] };
    const dockBusy = { ...waiting, station: { ...waiting.station, dock: { ...waiting.station.dock, capacity: 1 } } };
    expect(tick(dockBusy, 0.01).ships[1]!.state).toBe("unloading");
  });

  it("takes cargo from a ship in another sector by way of the gate", () => {
    const { state: withSite } = place(createInitialState(7), 1);
    const start = loaded(withSite, 10, "Ice");
    const done = until(giveOrder(start, [0], { kind: "supplySite", siteId: 0 }), (next) => next.claimSites[0]!.delivered.Ice === 10);
    expect(done.ships[0]!.sectorId).toBe(1);
  });

  it("keeps what the site cannot take and carries it home", () => {
    const { state: withSite } = place(createInitialState(7), 0);
    const cost = CLAIM_MODULE_COST.Metal;
    const full = deliver(withSite, 0, "Metal", cost - 5);
    const start = loaded(full, 10, "Metal", { defaultBehaviour: "mine" });
    const done = until(giveOrder(start, [0], { kind: "supplySite", siteId: 0 }), (next) => next.claimSites[0]!.delivered.Metal === cost);
    expect(done.ships[0]!.cargo).toBe(5);
    const home = until(done, (next) => next.ships[0]!.cargo === 0 && next.station.inventory.Metal > withSite.station.inventory.Metal);
    expect(home.station.inventory.Metal).toBe(withSite.station.inventory.Metal + 5);
  });

  it("ignores a ship with nothing aboard", () => {
    const { state: withSite } = place(createInitialState(7), 0);
    const start = loaded(withSite, 0, "Metal", { cargoMaterial: null });
    expect(giveOrder(start, [0], { kind: "supplySite", siteId: 0 }).ships).toEqual(start.ships);
  });

  it("builds the Dock, then the Storage, once each is fully supplied", () => {
    let state = place(createInitialState(7), 0).state;
    state = deliver(state, 0, "Metal", CLAIM_MODULE_COST.Metal);
    expect(claimSiteNeeds(state.claimSites[0]!)).toMatchObject({ building: "Dock", seconds: null });
    state = deliver(state, 0, "Ice", CLAIM_MODULE_COST.Ice);
    expect(claimSiteNeeds(state.claimSites[0]!).seconds).toBeGreaterThan(0);
    state = until(state, (next) => claimSiteNeeds(next.claimSites[0]!).building === "Storage");
    expect(state.claimSites[0]).toMatchObject({ stage: 1, delivered: { Metal: 0, Ice: 0 } });
    expect(claimSiteNeeds(state.claimSites[0]!).next).toBeNull();
    state = deliver(state, 0, "Metal", CLAIM_MODULE_COST.Metal);
    state = deliver(state, 0, "Ice", CLAIM_MODULE_COST.Ice);
    state = until(state, (next) => next.claimSites[0]!.stage === 2);
    expect(claimSiteNeeds(state.claimSites[0]!)).toMatchObject({ building: null, next: null });
  });

  it("takes CLAIM_BUILD_SECONDS to build a module", () => {
    let state = place(createInitialState(7), 0).state;
    state = deliver(deliver(state, 0, "Metal", 25), 0, "Ice", 25);
    const started = state.claimSites[0]!.timer!;
    expect(started).toBeGreaterThan(CLAIM_BUILD_SECONDS - 5);
    expect(tick(state, CLAIM_BUILD_SECONDS - 1).claimSites[0]!.stage).toBe(0);
    expect(tick(state, CLAIM_BUILD_SECONDS + 1).claimSites[0]!.stage).toBe(1);
  });

  it("offers removal only after the Dock and the first Storage are built", () => {
    const start = place(createInitialState(7), 0).state;
    expect(removeClaimSite(start, 0)).toBe(start);
    const built = { ...start, claimSites: [{ ...start.claimSites[0]!, stage: 2 }] };
    expect(removeClaimSite(built, 0).claimSites).toEqual([]);
    expect(removeClaimSite(built, 5)).toBe(built);
  });

  it("renames only a sector that has a finished claim station", () => {
    const start = place(createInitialState(7), 2).state;
    const before = start.sectors.map((sector) => sector.name);
    expect(sectorClaimed(start, 2)).toBe(false);
    expect(renameSector(start, 2, "Haven")).toBe(start);
    const built = { ...start, claimSites: [{ ...start.claimSites[0]!, stage: 2 }] };
    expect(sectorClaimed(built, 2)).toBe(true);
    const renamed = renameSector(built, 2, "  Haven ");
    expect(renamed.sectors.map((sector) => sector.name)).toEqual(before.map((name, id) => (id === 2 ? "Haven" : name)));
    expect(renameSector(built, 2, "   ")).toBe(built);
    expect(renameSector(built, 1, "Haven")).toBe(built);
  });

  it("keeps new asteroids off a site", () => {
    const { state, position } = place(createInitialState(7), 1);
    const rocks = state.asteroids.filter((rock) => rock.sectorId === 1);
    const emptied = { ...state, asteroids: state.asteroids.filter((rock) => rock.id !== rocks[0]!.id),
      respawns: [{ sectorId: 1, fieldId: rocks[0]!.fieldId, timer: 0.1, lastPosition: rocks[0]!.position }] };
    const after = tick(emptied, 1);
    const fresh = after.asteroids.find((rock) => rock.sectorId === 1 && !rocks.some((old) => old.id === rock.id))!;
    expect(Math.abs(fresh.position.x - position.x) > 45 || Math.abs(fresh.position.y - position.y) > 30).toBe(true);
  });
});
