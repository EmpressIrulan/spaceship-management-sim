// Recording-only station layouts for the issue 128 demo. Production code does
// not import this fixture or expose its state setter.
import {
  BUILDER_SIZE,
  DOCK_SIZE,
  STORAGE_SIZE,
  type ModuleType,
  type SimState,
  type StationModule,
  type Vec,
} from "sim";
import type { UiState } from "../app/src/ui-state";

type ModuleSeed = { type: ModuleType; position: Vec };

export function installIssue128Demo(
  ui: UiState,
  getState: () => SimState,
  setState: (state: SimState) => void,
): void {
  const original = structuredClone(getState());

  function setup(modules: ModuleSeed[]): void {
    const state = structuredClone(original);
    const station = state.stations[0]!;
    const size = (type: ModuleType) => type === "Dock" ? DOCK_SIZE : type === "Storage" ? STORAGE_SIZE : BUILDER_SIZE;
    station.modules = modules.map(({ type, position }): StationModule => ({
      type,
      position: { ...position },
      size: { ...size(type) },
    }));
    station.construction = null;
    station.buildQueue = [];
    station.founding = false;
    station.constructionSite = {
      ...station.constructionSite,
      position: { x: 75, y: -60 },
      inventory: { Metal: 500, Ice: 500 },
    };
    const dock = station.modules.find((module) => module.type === "Dock");
    const storage = station.modules.find((module) => module.type === "Storage");
    if (dock) station.dock = { ...station.dock, position: { ...dock.position } };
    if (storage) station.storage = { ...station.storage, position: { ...storage.position } };
    state.asteroids = [];
    state.respawns = [];
    state.ships = [];
    setState(state);
    ui.clock = { speed: 4, paused: true };
    ui.currentSector = station.sectorId;
    ui.camera = { center: { x: 40, y: 0 }, zoom: 2 };
    ui.pointer = null;
    ui.renderedSites = "";
    ui.buildMenuOpen = false;
    ui.selectedBuildSite = null;
    ui.controlsHovered = false;
  }

  Object.assign(window, {
    issue128Demo: {
      setup,
      snapshot: () => {
        const station = getState().stations[0]!;
        return {
          modules: station.modules,
          construction: station.construction,
          buildQueue: station.buildQueue,
          site: station.constructionSite,
          controls: [...document.querySelectorAll<HTMLButtonElement>("#build-controls button[data-x]")]
            .map((button) => ({ x: Number(button.dataset.x), y: Number(button.dataset.y) })),
        };
      },
      unpause: () => { ui.clock = { speed: 4, paused: false }; },
    },
  });
}
