// Imported only by the recorder's build-time plugin, never by the product.
import { createInitialState, tick, type SimState } from "sim";
import type { UiState } from "../app/src/ui-state";
import { moduleSize } from "../sim/src/station-module-geometry";

export function installIssue135Demo(ui: UiState, getState: () => SimState, setState: (state: SimState) => void): void {
  function setup(scene: number): void {
    const state = createInitialState(7);
    state.asteroids = [];
    state.fields = [];
    state.respawns = [];
    state.ships = [];
    state.stations = [state.stations[0]!];
    const station = state.stations[0]!;
    station.sectorId = 3;
    state.sectors[1]!.gate = { ...state.sectors[1]!.gate, to: 2, position: { x: 200, y: 0 } };
    state.sectors[2]!.gate = { ...state.sectors[2]!.gate, to: 1, position: { x: -200, y: 0 } };
    state.sectors[0]!.gate.to = 0;
    state.hives = [{ id: 0, sectorId: 1, position: { x: 150, y: 0 }, hp: 200, maxHp: 200, alive: true, spawnTimer: 1 }];
    state.bugs = Array.from({ length: 9 }, (_, id) => ({ id, hiveId: 0, sectorId: 1, position: { x: 150 + Math.cos(id * Math.PI * 2 / 9) * 25, y: Math.sin(id * Math.PI * 2 / 9) * 25 }, hp: 6, maxHp: 6, state: "hovering", targetShipId: null, targetModule: null, leg: null, timer: 10000 }));
    state.nextBugId = 9;
    state.nextHiveId = 1;
    if (scene === 4) {
      // Resident bugs without a hive cannot immediately launch another invasion.
      state.bugs.push(...Array.from({ length: 2 }, (_, index) => ({ ...state.bugs![index]!, id: 9 + index, sectorId: 2, position: { x: -100, y: 40 + index * 25 } })));
      state.nextBugId = 11;
    }
    if (scene === 5) {
      station.sectorId = 2;
      station.name = "Arrival outpost";
      station.modules = [
        { type: "Dock", position: { x: 10, y: 0 }, size: moduleSize("Dock"), hp: 40, maxHp: 40 },
        { type: "Builder", position: { x: -30, y: 0 }, size: moduleSize("Builder"), hp: 40, maxHp: 40 },
      ];
      station.dock.position = { x: 10, y: 0 };
      station.constructionSite.position = { x: 20, y: 60 };
      station.construction = null;
      station.buildQueue = [];
      station.shipBuilds = [];
    }
    if (scene === 5) {
      // Found through real ticks, then isolate the colony from a second source
      // invasion so this scene measures the new hive's own ten offspring.
      const colony = tick(state, 12.4375);
      colony.hives = colony.hives!.filter(hive => hive.sectorId === 2);
      colony.bugs = colony.bugs!.filter(bug => bug.sectorId === 2);
      setState(colony);
    } else setState(state);
    Object.assign(ui, { clock: { speed: 1, paused: true }, currentSector: scene === 5 ? 2 : 1, camera: { center: { x: 0, y: 0 }, zoom: 2 }, pointer: null, selectedShip: null, selectedShips: [], mapOpen: false });
  }
  const frameSeconds = { normal: 1 / 30, fast: 4 / 30, combat: 2 / 30 };
  Object.assign(window, { issue135Demo: {
    setup,
    stepFrame: (speed: keyof typeof frameSeconds) => setState(tick(getState(), frameSeconds[speed])),
  } });
}
