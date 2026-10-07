import { describe, expect, it } from "vitest";
import {
  DOCK_CAPACITY,
  MODULE_COST,
  createInitialState,
  homeStation,
  stationById,
  type SimState,
} from "sim";
import { placeStation, renameSector, setSupplyStation, renameStation, removeStation } from "./station-placement";
import { availableModuleBuildSites, startModuleBuild } from "./station-building";
import { buildClaim } from "./test-claims";
import { giveOrder } from "./orders";
import { haulStationDetails, haulStations } from "./haul";
import { tick } from "./tick";

describe("generated station names", () => {
  it("uses a replayable one-word name and keeps Home named Home", () => {
    const initial = createInitialState(7);
    const first = placeStation(initial, 1, { x: 0, y: 0 });
    const replay = placeStation(createInitialState(7), 1, { x: 0, y: 0 });

    expect(initial.stations[0]!.name).toBe("Home");
    expect(first.stations[1]!.name).toMatch(/^\w+ Station$/);
    expect(replay.stations[1]!.name).toBe(first.stations[1]!.name);
  });
});

describe("station management", () => {
  it("renames any station, including Home, after trimming whitespace", () => {
    const placed = spot(createInitialState(7), 1);
    expect(renameStation(placed.state, placed.id, "  Kestrel  ").stations.find((s) => s.id === placed.id)?.name).toBe("Kestrel");
    expect(renameStation(placed.state, 0, "New Home").stations[0]?.name).toBe("New Home");
    expect(renameStation(placed.state, placed.id, " ")).toBe(placed.state);
  });

  it("removes any station and holds ships docked or building there beside its former Dock", () => {
    const placed = spot(createInitialState(7), 1);
    const station = placed.state.stations.find((s) => s.id === placed.id)!;
    const docked = placed.state.ships[0]!;
    const state = { ...placed.state, ships: [
      { ...docked, sectorId: station.sectorId, state: "docked" as const, position: { ...station.dock.position }, order: { kind: "supplyBuild" as const, stationId: station.id, point: station.dock.position, sectorId: station.sectorId } },
      { ...docked, id: docked.id + 1, state: "holding" as const, order: { kind: "supplyBuild" as const, stationId: station.id, point: station.dock.position, sectorId: station.sectorId } },
    ] };
    const removed = removeStation(state, station.id);
    expect(removed.stations.some((s) => s.id === station.id)).toBe(false);
    expect(removed.ships[0]).toMatchObject({ sectorId: station.sectorId, state: "holding", position: { x: station.dock.position.x + station.dock.size.width / 2 + 12, y: station.dock.position.y }, order: null, leg: null, berth: null });
    expect(removed.ships[1]).toMatchObject({ sectorId: station.sectorId, state: "holding", position: { x: station.dock.position.x + station.dock.size.width / 2 + 12, y: station.dock.position.y }, order: null });
    expect(removeStation(state, -1)).toBe(state);
  });

  it("can remove Home and redirects the selected supply site to a surviving station", () => {
    const placed = spot(createInitialState(7), 1);
    const selected = setSupplyStation(placed.state, placed.id);
    const removed = removeStation(selected, 0);
    expect(removed.stations.some((station) => station.id === 0)).toBe(false);
    expect(removed.supplyStation).toBe(placed.id);
  });
});

function until(state: SimState, done: (state: SimState) => boolean, limit = 600): SimState {
  let next = state;
  for (let elapsed = 0; elapsed < limit; elapsed += 1 / 30) {
    if (done(next)) return next;
    next = tick(next, 1 / 30);
  }
  throw new Error("condition never held");
}

// The first spot on a coarse grid that the sim accepts, so a test does not
// depend on where a seed happened to put its asteroids.
function spot(state: SimState, sectorId: number): { state: SimState; id: number } {
  for (let y = -300; y <= 300; y += 50) {
    for (let x = -300; x <= 300; x += 50) {
      const next = placeStation(state, sectorId, { x, y });
      if (next !== state) return { state: next, id: next.nextStationId - 1 };
    }
  }
  throw new Error("no free spot");
}

// Fully pays a station's founding site from its own stock, so a test does not
// wait on the mining loop to see the build start.
function fundSite(state: SimState, id: number): SimState {
  return {
    ...state,
    stations: state.stations.map((candidate) => candidate.id === id
      ? { ...candidate, constructionSite: { ...candidate.constructionSite, inventory: { ...MODULE_COST } } }
      : candidate),
  };
}

function siteInventory(state: SimState, id: number): SimState["stations"][number]["constructionSite"]["inventory"] {
  return stationById(state, id)!.constructionSite.inventory;
}

describe("criterion 1: Build station places a construction site", () => {
  it("a spot in any sector takes a site, and several go in one sector", () => {
    let state = createInitialState(7);
    expect(state.stations.map((station) => station.sectorId)).toEqual([0]);
    state = spot(state, 0).state;
    state = spot(state, 1).state;
    state = spot(state, 1).state;
    state = spot(state, 3).state;
    const placed = state.stations.map((station) => station.sectorId);
    expect(placed).toEqual([0, 0, 1, 1, 3]);
    for (const station of state.stations.slice(1)) {
      expect(station.modules).toEqual([]);
      expect(station.constructionSite.inventory).toEqual({ Metal: 0, Ice: 0 });
      expect(station.buildQueue.map((queued) => queued.type)).toEqual(["Dock", "Storage"]);
      expect(station.construction).toBeNull();
    }
    // Home stays Home: a founded station from the start with its Dock and Storage.
    const home = homeStation(state);
    expect(home.id).toBe(0);
    expect(home.founding).toBe(false);
    expect(home.buildQueue).toEqual([]);
  });

  it("each station gets its own id", () => {
    let state = createInitialState(7);
    state = spot(state, 1).state;
    state = spot(state, 1).state;
    expect(state.stations.map((station) => station.id)).toEqual([0, 1, 2]);
    expect(stationById(state, 2)!.sectorId).toBe(1);
  });

  it("a site cannot sit on a rock or another site", () => {
    let state = createInitialState(7);
    const rock = state.asteroids[0]!;
    expect(placeStation(state, rock.sectorId, rock.position)).toBe(state);
    const placed = spot(state, 1);
    const site = stationById(placed.state, placed.id)!.constructionSite.position;
    expect(placeStation(placed.state, 1, site)).toBe(placed.state);
  });
});

describe("criterion 2: ships supply the site and a Dock builds", () => {
  it("pays for later modules from that station's site, not Home's", () => {
    let state = spot(createInitialState(7), 1).state;
    const id = state.nextStationId - 1;
    state = fundSite(state, id);
    state = { ...state, stations: state.stations.map((station) => station.id === id
      ? { ...station, constructionSite: { ...station.constructionSite, inventory: { Metal: 50, Ice: 50 } } }
      : station) };
    const station = stationById(state, id)!;
    const built = startModuleBuild(state, id, "Storage", availableModuleBuildSites(state, id)[0]!);

    expect(stationById(built, id)!.constructionSite.inventory).toEqual({ Metal: 25, Ice: 25 });
    expect(homeStation(built).constructionSite.inventory).toEqual(homeStation(state).constructionSite.inventory);
    expect(stationById(built, id)!.construction?.type).toBe("Storage");
  });

  it("a fully supplied site starts and finishes the Dock build from the queue", () => {
    let state = spot(createInitialState(7), 1).state;
    const id = state.nextStationId - 1;
    state = fundSite(state, id);
    const started = tick(state, 1 / 30);
    expect(stationById(started, id)!.construction).toMatchObject({ type: "Dock" });
    expect(siteInventory(started, id)).toEqual({ Metal: 0, Ice: 0 });
    const built = until(started, (next) => stationById(next, id)!.modules.length > 0, 30);
    const station = stationById(built, id)!;
    expect(station.modules.map((module) => module.type)).toEqual(["Dock"]);
    expect(station.dock.capacity).toBe(DOCK_CAPACITY);
    expect(siteInventory(built, id)).toEqual({ Metal: 0, Ice: 0 });
    expect(station.buildQueue.map((queued) => queued.type)).toEqual(["Storage"]);
  });

  it("+ controls appear round the fresh Dock, the way they do at Home", () => {
    let state = spot(createInitialState(7), 1).state;
    const id = state.nextStationId - 1;
    const funded = tick(fundSite(state, id), 1 / 30);
    const built = until(funded, (next) => stationById(next, id)!.modules.length > 0, 30);
    expect(availableModuleBuildSites(built, id).length).toBeGreaterThan(0);
    expect(availableModuleBuildSites(built, 0).length).toBeGreaterThan(0);
  });

  it("right-click orders a loaded ship across the gate to deliver to the site", () => {
    let state = spot(createInitialState(7), 1).state;
    const id = state.nextStationId - 1;
    const station = stationById(state, id)!;
    const target = { kind: "supplyBuild" as const, stationId: id };
    const ship = { ...state.ships[0]!, sectorId: 0, position: { x: 0, y: 0 }, state: "idle" as const, timer: 0,
      cargo: 10, cargoByMaterial: { Metal: 10, Ice: 0 }, cargoMaterial: "Metal" as const,
      order: null, leg: null, berth: null, target: null, defaultBehaviour: "mine" as const };
    state = { ...state, ships: [ship] };
    const ordered = giveOrder(state, [ship.id], target);
    const flying = until(ordered, (next) => next.ships[0]!.state === "moving", 20);
    expect(flying.ships[0]!.order).toMatchObject({ kind: "supplyBuild", stationId: id });
    const delivered = until(flying, (next) => siteInventory(next, id).Metal > 0, 400);
    expect(siteInventory(delivered, id).Metal).toBeGreaterThan(0);
  });

  it("the supply default mines for the selected site and delivers only to it", () => {
    let state = spot(createInitialState(7), 1).state;
    const first = state.nextStationId - 1;
    state = spot(state, 1).state;
    const second = state.nextStationId - 1;
    state = setSupplyStation(state, second);
    expect(state.supplyStation).toBe(second);
    state = { ...state, ships: state.ships.map((ship) => ({
      ...ship,
      sectorId: 1,
      position: { ...stationById(state, second)!.constructionSite.position },
      state: "idle" as const,
      timer: 0,
      leg: null,
      berth: null,
      target: null,
      order: null,
      cargo: 0,
      defaultBehaviour: "supply" as const,
      mineMaterials: ["Metal", "Ice"],
    })) };
    const delivered = until(state, (next) => siteInventory(next, second).Metal > 0);
    expect(siteInventory(delivered, first)).toEqual({ Metal: 0, Ice: 0 });
  });

  it("the supply default carries deliveries through a gate to a selected site", () => {
    let state = spot(createInitialState(7), 1).state;
    const id = state.nextStationId - 1;
    state = setSupplyStation(state, id);
    state = { ...state, ships: state.ships.map((ship) => ({
      ...ship, defaultBehaviour: "supply" as const, mineMaterials: ["Metal", "Ice"] as const,
    })) };

    const delivered = until(state, (next) => siteInventory(next, id).Metal > 0 || siteInventory(next, id).Ice > 0, 5000);
    expect(siteInventory(delivered, id).Metal + siteInventory(delivered, id).Ice).toBeGreaterThan(0);
  });

  it("does not list the surviving station as Home after station 0 is removed", () => {
    let state = spot(createInitialState(7), 0).state;
    const id = state.nextStationId - 1;
    const station = stationById(state, id)!;
    state = { ...state, stations: state.stations.map((candidate) => candidate.id === id ? { ...station, founding: false,
      modules: [{ type: "Dock", position: station.dock.position, size: station.dock.size }],
      dock: { ...station.dock, capacity: 100 }, storage: { ...station.storage, capacity: 100 } } : candidate) };
    state = removeStation(state, 0);

    expect(haulStations(state).map((entry) => entry.id)).toEqual([`station:${id}`]);
  });

  it("builds the surviving site's Dock after Home is removed", () => {
    let state = spot(createInitialState(7), 0).state;
    const id = state.nextStationId - 1;
    state = fundSite(state, id);
    state = removeStation(state, 0);

    const built = tick(state, 300);

    expect(stationById(built, id)!.modules.map((module) => module.type)).toContain("Dock");
  });

  it("continues the surviving site's Storage build after its Dock", () => {
    let state = spot(createInitialState(7), 0).state;
    const id = state.nextStationId - 1;
    state = { ...state, stations: state.stations.map((station) => station.id === id ? {
      ...station, constructionSite: { ...station.constructionSite, inventory: { Metal: 50, Ice: 50 } },
    } : station) };
    state = removeStation(state, 0);

    const built = tick(state, 300);

    expect(stationById(built, id)!.modules.map((module) => module.type)).toEqual(["Dock", "Storage"]);
    expect(stationById(built, id)!.founding).toBe(false);
  });

  it("delivers construction cargo to a surviving station by id after Home is removed", () => {
    let state = spot(createInitialState(7), 0).state;
    const id = state.nextStationId - 1;
    const site = stationById(state, id)!;
    const ship = { ...state.ships[0]!, homeStationId: id, sectorId: site.sectorId, position: { x: 0, y: 0 },
      state: "idle" as const, timer: 0, cargo: 10, cargoByMaterial: { Metal: 10, Ice: 0 }, cargoMaterial: "Metal" as const,
      order: null, leg: null, berth: null, target: null };
    state = { ...state, ships: [ship] };
    state = giveOrder(state, [ship.id], { kind: "supplyBuild", stationId: id });
    state = removeStation(state, 0);

    const delivered = until(state, (next) => siteInventory(next, id).Metal > 0, 400);
    expect(siteInventory(delivered, id).Metal).toBeGreaterThan(0);
  });

  it("a waiting supply ship parks idle with no site selected", () => {
    let state = createInitialState(7);
    state = spot(state, 1).state;
    const id = state.nextStationId - 1;
    state = { ...state, supplyStation: id, ships: state.ships.map((ship) => ({
      ...ship, defaultBehaviour: "supply" as const, state: "holding" as const,
      position: homeStation(state).dock.position, timer: 0, leg: null, berth: null,
    })) };
    const later = tick(state, 2);
    expect(siteInventory(later, id).Metal).toBe(0);
  });

  it("founding runs from mining to a built-out station on its own stock", () => {
    let state = spot(createInitialState(7), 0).state;
    const id = state.nextStationId - 1;
    state = setSupplyStation(state, id);
    // The fleet supplies the selected site, and mines whatever the sector gives.
    state = { ...state, ships: state.ships.map((ship) => ({
      ...ship, defaultBehaviour: "supply" as const, mineMaterials: ["Metal", "Ice"] as const,
    })) };
    // Almost an hour of play: trips, builds and the Dock still to come after.
    for (let elapsed = 0; elapsed < 3600; elapsed += 1) state = tick(state, 1);
    const docked = until(state, (next) => stationById(next, id)!.modules.some((module) => module.type === "Dock"), 600);
    expect(docked.stations.find((candidate) => candidate.id === id)!.inventory).toEqual({ Metal: 0, Ice: 0 });
    // The build keeps riding the founded Dock: Storage next, then named stops.
    const finished = until(docked, (next) => !stationById(next, id)!.founding, 2400);
    const founded = stationById(finished, id)!;
    expect(founded.modules.map((module) => module.type)).toEqual(["Dock", "Storage"]);
    expect(founded.dock.capacity).toBe(DOCK_CAPACITY);
    // A founded Home is not claimed until a Claim stands in its sector.
    expect(renameSector(finished, 0, "Foundry")).toBe(finished);
    const renamed = renameSector(buildClaim(finished, 0), 0, "Foundry");
    expect(renameSector(renamed, 0, "Foundry").sectors[0]!.name).toBe("Foundry");
    expect(haulStations(renamed).map((entry) => entry.id)).toContain(`station:${id}`);
  });
});

describe("criterion 8: claim sites retire, renaming and haul names survive", () => {
  it("rename keeps #70's shape: it needs a Claim in the sector, not just a founded station", () => {
    let state = spot(createInitialState(7), 1).state;
    const id = state.nextStationId - 1;
    const sectorName = state.sectors[1]!.name;
    expect(renameSector(state, 1, "Nova")).toBe(state);
    const founded = until(fundSite(state, id), (next) => stationById(next, id)!.modules.length > 0, 30);
    expect(renameSector(founded, 1, "Nova")).toBe(founded);
    const claimed = buildClaim(founded, id);
    expect(renameSector(claimed, 1, "  Nova ")).not.toBe(claimed);
    expect(renameSector(claimed, 1, "Nova").sectors[1]!.name).toBe("Nova");
    expect(renameSector(claimed, 1, "   ")).toBe(claimed);
    expect(renameSector(claimed, 1, sectorName)).toBe(claimed);
  });

  it("haul routes list founded stations by their station names", () => {
    let state = spot(createInitialState(7), 1).state;
    const id = state.nextStationId - 1;
    // The ghost site appears as a station once it owns a Dock.
    expect(haulStations(state).map((entry) => entry.id)).toEqual(["home"]);
    const founded = until(fundSite(state, id), (next) => stationById(next, id)!.modules.length > 0, 30);
    const renamed = buildClaim(founded, id);
    const stations = haulStations(renamed);
    expect(stations.map((entry) => entry.id)).toEqual(["home", `station:${id}`]);
    expect(stations[1]!.name).toBe(renamed.stations.find((station) => station.id === id)!.name);
    const details = haulStationDetails(renamed, `station:${id}`)!;
    expect(details.sectorId).toBe(1);
    expect(details.position).toEqual(stationById(renamed, id)!.dock.position);
    expect(details.inventory).toEqual(renamed.stations.find((candidate) => candidate.id === id)!.inventory);
    expect(haulStationDetails(renamed, `station:${id + 5}`)).toBeNull();
  });
});
