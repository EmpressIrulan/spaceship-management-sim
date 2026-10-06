import { travelSeconds } from "./motion";
import { createInitialState, depart, dockBerths, homeStation, MATERIALS, CONSTRUCTION_SITE_SIZE, DOCK_CAPACITY, STORAGE_CAPACITY, type Ship, type SimState } from "./state";
import { DOCK_SIZE, MODULE_SPACING, STORAGE_SIZE } from "./build-constants";
import type { Material, Station } from "./model";
import type { ShipDesign } from "./ship";

// The starting ship's size and speed with half the Storage swapped for Hull,
// so a trip carries 10 and mines for 12 s. Tests of the mining cycle use it to
// keep their numbers in single loads.
export const ONE_STORAGE: ShipDesign = {
  width: 4,
  height: 4,
  slots: [
    "Engine", "Engine", "Laser", "Laser",
    "Engine", "Engine", "Laser", "Laser",
    "Storage", "Storage", "Hull", "Hull",
    "Storage", "Storage", "Hull", "Hull",
  ],
};

// The game starts its ship with nothing ticked so it sits idle. Tests of the
// mining cycle need one that mines whatever is nearest.
export function miningStart(seed: number): SimState {
  const state = createInitialState(seed);
  const dock = homeStation(state).dock.position;
  return { ...state, ships: state.ships.map((ship) => depart({ ...ship, mineMaterials: [...MATERIALS] }, dock, state.asteroids)) };
}

export function oneStorageStart(seed: number): SimState {
  const state = miningStart(seed);
  return { ...state, ships: state.ships.map((ship) => ({ ...ship, design: ONE_STORAGE })) };
}

// `count` supply ships on their way home, each with `cargo` units of Metal in
// the hold and nothing queued at the site, so a test can watch them park beside
// the Dock and set off again. Tick the state by 0 to park them.
export function suppliersComingHome(count: number, cargo = 7): SimState {
  const state = createInitialState(7);
  const dock = homeStation(state).dock.position;
  return {
    ...state,
    ships: Array.from({ length: count }, (_, id): Ship => ({
      ...state.ships[0]!,
      id,
      defaultBehaviour: "supply",
      state: "homebound",
      timer: 0,
      position: { ...dock },
      leg: null,
      target: null,
      berth: null,
      transfer: null,
      cargo,
      cargoByMaterial: { Metal: cargo, Ice: 0 },
      cargoMaterial: "Metal",
    })),
    nextShipId: count,
  };
}

// Seconds a lone ship takes to fly from the Dock's middle to the first pad,
// which is where the first ship home unloads.
export function padHopSeconds(state: SimState): number {
  const dock = homeStation(state).dock.position;
  const pad = dockBerths(dock)[0]!;
  return travelSeconds(Math.hypot(pad.x - dock.x, pad.y - dock.y));
}

// A founded station that stands on its own Dock and Storage in `sectorId`,
// for tests of hauling and naming that need a second stop without playing the
// whole founding loop. `x` is the middle of the module pair, like a site's.
export function foundedStation(id: number, sectorId: number, x: number, y: number, inventory: Record<Material, number> = { Metal: 0, Ice: 0 }): Station {
  const dock = { x: x - MODULE_SPACING / 2, y };
  return {
    id,
    name: id === 0 ? "Home" : `Station ${id}`,
    founding: false,
    sectorId,
    dock: { position: dock, size: DOCK_SIZE, capacity: DOCK_CAPACITY },
    storage: { position: { x: x + MODULE_SPACING / 2, y }, size: STORAGE_SIZE, capacity: STORAGE_CAPACITY },
    inventory: { ...inventory },
    constructionSite: { position: { x, y }, size: CONSTRUCTION_SITE_SIZE, inventory: { Metal: 0, Ice: 0 } },
    storageLimits: { Metal: null, Ice: null },
    deliveries: [],
    modules: [
      { type: "Dock", position: dock, size: DOCK_SIZE },
      { type: "Storage", position: { x: x + MODULE_SPACING / 2, y }, size: STORAGE_SIZE },
    ],
    construction: null,
    buildQueue: [],
    shipBuilds: [],
  };
}
