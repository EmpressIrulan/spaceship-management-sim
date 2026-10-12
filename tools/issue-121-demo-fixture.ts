// Imported only by the recorder's build-time plugin, never by the product.
import { createInitialState, startModuleBuild, type SimState } from "sim";
import type { UiState } from "../app/src/ui-state";

export function installIssue121Demo(ui: UiState, setState: (state: SimState) => void): void {
  function setup(scene: number): void {
    const state = createInitialState(121);
    state.asteroids = [];
    state.fields = [];
    state.respawns = [];
    state.hives = [];
    state.bugs = [];
    state.time = scene === 4 ? 1200 : scene === 5 ? 1200 : 7200;
    const home = state.stations[0]!;
    home.builtAt = 0;
    home.deliveries = [
      { at: state.time - 4000, material: "Metal", amount: 100 },
      { at: state.time - 3000, material: "Metal", amount: 744 },
      { at: state.time - 900, material: "Ice", amount: 90 },
      { at: state.time - 3700, material: "Ice", amount: 100 },
    ];
    if (scene === 4) home.deliveries = [{ at: 300, material: "Metal", amount: 124 }];
    if (scene === 5) {
      const outpost = structuredClone(home);
      const move = (position: { x: number; y: number }) => ({ x: position.x + 300, y: position.y });
      outpost.id = 1;
      outpost.name = "New outpost";
      outpost.builtAt = state.time - 600;
      outpost.dock.position = move(home.dock.position);
      outpost.storage.position = move(home.storage.position);
      outpost.constructionSite.position = move(home.constructionSite.position);
      outpost.modules = home.modules.map(module => ({ ...module, position: move(module.position) }));
      outpost.deliveries = [{ at: state.time - 300, material: "Metal", amount: 124 }];
      state.stations.push(outpost);
    }
    if ([2, 3, 6, 7, 8].includes(scene)) {
      const ship = state.ships[0]!;
      state.ships = [{ ...ship, state: "homebound", homeStationId: 0, sectorId: home.sectorId,
        position: { ...home.dock.position }, timer: 0, leg: null, target: null, berth: null,
        cargo: 12, cargoMaterial: "Metal", cargoByMaterial: { Metal: 12, Ice: 0 },
        defaultBehaviour: "none", order: null, transfer: null }];
    } else state.ships = [];
    if (scene === 7) {
      home.inventory.Metal = 200;
      home.constructionSite.inventory = { Metal: 25, Ice: 25 };
      state.stations = [startModuleBuild(state, home.id, "Storage", { x: 40, y: 0 }).stations[0]!];
    }
    Object.assign(ui, { clock: { speed: 1, paused: false }, currentSector: home.sectorId,
      camera: { center: { x: scene === 5 ? 320 : 0, y: 0 }, zoom: 2 }, pointer: null, selectedShip: null,
      selectedShips: [], mapOpen: false });
    setState(state);
  }
  Object.assign(window, { issue121Demo: { setup } });
}
