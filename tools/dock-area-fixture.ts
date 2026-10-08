// Used only by record-dock-area.mjs's instrumented demo bundle. The shipping
// entry point does not import fixtures or expose a state mutation API.
import { createInitialState, tick, giveOrder, DOCK_SIZE, STARTING_SHIP, shipStats, type SimState, type ShipDesign } from "sim";
import type { UiState } from "../app/src/ui-state";
import { worldToScreen } from "../app/src/camera";

export function installDockAreaFixture(ui: UiState, get: () => SimState, set: (state: SimState) => void): void {
  function setup(width: number, height: number, count: number, docks = 1, oversized = false): void {
    let state = createInitialState(7);
    const station = state.stations[0]!;
    station.storage.capacity = 10000;
    station.dock.capacity = 96 * docks;
    for (let i = 1; i < docks; i++) station.modules.push({ type: "Dock", position: { x: -40 * i, y: 0 }, size: DOCK_SIZE });
    const design: ShipDesign = width === 4 && height === 4 ? STARTING_SHIP : { width, height, slots: Array.from({ length: width * height }, (_, i) => i < width * height / 4 ? "Engine" : "Storage") };
    const cargo = shipStats(design).hold;
    state.ships = Array.from({ length: count }, (_, id) => ({
      ...state.ships[0]!, id, design, state: "homebound", position: { ...station.dock.position },
      cargo, cargoMaterial: "Metal", cargoByMaterial: { Metal: cargo, Ice: 0 }, timer: 0,
      leg: null, target: null, mineMaterials: ["Metal"],
    }));
    state.nextShipId = count;
    state = tick(state, 0);
    for (let i = 0; i < 2000 && !state.ships.every((ship) => ship.state === "waiting" || ship.state === "unloading"); i++) state = tick(state, 0.01);
    if (!state.ships.every((ship) => ship.state === "waiting" || ship.state === "unloading")) throw new Error("Fleet did not settle");
    if (oversized) {
      state.stations.push({ ...station, id: 1, name: "Old home", sectorId: 1, modules: station.modules.map((module) => ({ ...module })), buildQueue: [], shipBuilds: [] });
      state.nextStationId = 2;
      state.ships = [{ ...state.ships[0]!, id: 2, homeStationId: 1, state: "holding", position: { x: -60, y: 0 }, timer: 0, berth: null, leg: null, cargo: 0, cargoByMaterial: { Metal: 0, Ice: 0 }, transfer: null }];
    }
    set(state);
    ui.clock.paused = true;
    ui.camera = { center: { x: docks === 2 ? -20 : oversized ? -25 : -15, y: oversized ? 0 : 30 }, zoom: oversized ? 6 : 8 };
    ui.selectedShips = oversized ? [2] : [];
    ui.selectedShip = oversized ? 2 : null;
    ui.renderedPanel = "";
    ui.routeRefusalMessage = null;
    ui.pointer = null;
  }
  const api = {
    setup,
    snapshot: () => ({ ships: get().ships, dock: get().stations[0]!.dock, modules: get().stations[0]!.modules, paused: ui.clock.paused }),
    screen: (x: number, y: number) => worldToScreen(ui.camera, ui.viewport, { x, y }),
    leave: () => {
      set(giveOrder(get(), [0], { kind: "move", point: { x: 50, y: 40 } }));
      ui.clock.paused = false;
    },
    pause: () => { ui.clock.paused = true; },
  };
  Object.assign(window, { dockAreaDemo: api });
}
