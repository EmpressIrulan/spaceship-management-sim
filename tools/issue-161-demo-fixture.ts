// Recording-only seed and hooks; never included in the shipped game.
import { createInitialState, type SimState } from "sim";
import type { UiState } from "../app/src/ui-state";

function fixture(scene: number): SimState {
  const state = createInitialState(7);
  const home = state.stations[0]!;
  const original = structuredClone(home);
  function station(id: number, name: string, x: number, y: number) {
    const copy = structuredClone(original);
    const dx = x - original.dock.position.x, dy = y - original.dock.position.y;
    copy.id = id; copy.name = name;
    for (const item of [copy.dock, copy.storage, copy.constructionSite, ...copy.modules]) {
      item.position = { x: item.position.x + dx, y: item.position.y + dy };
    }
    copy.construction = null; copy.buildQueue = []; copy.shipBuilds = [];
    return copy;
  }
  state.stations = [station(0, "Home", -1500, scene <= 2 ? 2000 : 0),
    station(1, "North Dock", 1500, scene <= 2 ? 2000 : 0)];
  state.nextStationId = 2;
  const ship = state.ships[0]!;
  // Uniform engine design makes the same ship's orange colour unambiguous.
  ship.design = { width: 3, height: 3, slots: Array(9).fill("Engine") };
  Object.assign(ship, { position: { x: scene <= 2 ? 0 : -1440, y: 0 },
    state: "holding", berth: null, leg: null, target: null, order: null, timer: 0 });
  state.ships = [ship];
  state.asteroids = [{ ...state.asteroids[0]!, position: { x: scene <= 2 ? 1000 : -1360, y: 0 }, rich: false, material: "Metal" }];
  state.bugs = [{ id: 0, hiveId: 0, sectorId: 0, position: { x: scene <= 2 ? 500 : -1400, y: 0 },
    hp: 6, maxHp: 6, state: "hovering", targetShipId: null, targetModule: null, leg: null, timer: 10 }];
  state.hives = []; state.fields = []; state.respawns = []; state.drops = [];
  return state;
}

export function installIssue161Demo(ui: UiState, setState: (state: SimState) => void,
  limits: { min: number; max: number }) {
  const api = {
    limits,
    get ui() { return ui; },
    setup(scene: number) {
      setState(fixture(scene));
      Object.assign(ui, { clock: { speed: 1, paused: true }, currentSector: 0, pointer: null,
        selectedShip: null, selectedShips: [], stationPanelId: null, mapOpen: false,
        camera: { center: { x: 0, y: 0 }, zoom: limits.min } });
    },
    camera(x: number, y: number, zoom: number) {
      if (zoom < limits.min || zoom > limits.max) throw new Error(`Unreachable zoom ${zoom}`);
      ui.camera = { center: { x, y }, zoom };
    },
  };
  Object.assign(window, { issue161Demo: api });
}
