// Imported only by the recorder's build-time plugin, never by the product.
import { createInitialState, tick, type SimState, type ModuleType, type Vec } from "sim";
import { moduleSize } from "../sim/src/station-module-geometry";
import type { UiState } from "../app/src/ui-state";

export function installIssue134Demo(ui: UiState, getState: () => SimState, setState: (state: SimState) => void): void {
  function setup(scene: number): void {
    const state = createInitialState(7);
    state.asteroids = [];
    state.fields = [];
    state.respawns = [];
    const ship = structuredClone(state.ships[0]!);
    state.ships = [];
    state.bugs = [];
    state.hives = [{ id: 0, sectorId: 1, position: { x: 100, y: -80 }, hp: 200, maxHp: 200, alive: true, spawnTimer: 10000 }];
    const station = state.stations[0]!;
    station.name = "Hive outpost";
    station.sectorId = 1;
    station.founding = false;
    station.modules = [];
    station.buildQueue = [];
    station.construction = null;
    station.shipBuilds = [];
    station.inventory = { Metal: 200, Ice: 100 };
    station.constructionSite = { ...station.constructionSite, position: { x: -65, y: -70 }, inventory: { Metal: 0, Ice: 0 } };
    const add = (type: ModuleType, x: number, y: number, hp = 40) => station.modules.push({ type, position: { x, y }, size: moduleSize(type), hp, maxHp: 40 });
    add("Dock", 0, 0);
    if (scene === 4) {
      add("Storage", 0, -40);
      add("Builder", 40, 0, 5);
      add("Storage", 80, 0);
      add("Builder", 120, 0);
    } else {
      add("Storage", 40, 0, scene === 5 ? 5 : 40);
      if (scene !== 6 && scene !== 5) add("Builder", 80, 0, scene === 3 ? 5 : 40);
      if (scene === 1) add("Builder", 0, -40);
      if (scene === 5) add("Storage", 0, -40);
    }
    station.dock = { ...station.dock, position: { x: 0, y: 0 } };
    station.storage = { ...station.storage, position: { x: scene === 4 ? 0 : 40, y: scene === 4 ? -40 : 0 }, capacity: scene === 5 ? 2000 : 1000 };
    if (scene === 1) {
      Object.assign(ship, { sectorId: 1, position: { x: -40, y: 40 }, state: "holding", target: null, leg: null, timer: 0, order: null, hp: 40, maxHp: 40 });
      state.ships = [ship];
    }
    if (scene === 6) {
      station.inventory = { Metal: 6, Ice: 100 };
      station.constructionSite.inventory = { Metal: 25, Ice: 25 };
      state.hives[0]!.position = { x: 40, y: -80 };
    }
    setState(state);
    Object.assign(ui, { clock: { speed: 1, paused: true }, currentSector: 1, camera: { center: { x: 25, y: -10 }, zoom: 3 }, pointer: null, selectedShip: null, selectedShips: [], renderedSites: "", renderedPanel: "", stickyQueuedBuild: null, controlsHovered: false, buildMenuOpen: false, selectedBuildSite: null });
  }
  function release(scene: number): void {
    const state = structuredClone(getState());
    const positions: Vec[] = scene === 1
      ? [{ x: 0, y: 28 }, { x: 40, y: 28 }, { x: 80, y: 28 }, { x: 0, y: -68 }, { x: -68, y: 40 }]
      : scene === 6 ? [{ x: -35, y: -40 }]
      : Array.from({ length: 5 }, (_, id) => ({ x: scene === 4 || scene === 5 ? 40 : 80, y: 22 + id * 2 }));
    state.bugs = positions.map((position, id) => ({ id, hiveId: 0, sectorId: 1, position, hp: 6, maxHp: 6, state: "hovering", targetShipId: null, targetModule: null, leg: null, timer: scene === 6 ? 10000 : 0 }));
    state.nextBugId = positions.length;
    setState(state);
  }
  Object.assign(window, { issue134Demo: {
    setup, release,
    step: (seconds: number) => setState(tick(getState(), seconds)),
    removeBugs: () => setState({ ...getState(), bugs: [] }),
    supply: (amount: number) => {
      const state = structuredClone(getState());
      state.stations[0]!.constructionSite.inventory = { Metal: amount, Ice: amount };
      setState(state);
    },
  } });
}
