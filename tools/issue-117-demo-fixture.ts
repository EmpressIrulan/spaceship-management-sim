// Only the recorder imports this fixture, through its build-time entry plugin.
import { createInitialState, queueModuleBuild, setDefaultBehaviour, type SimState } from "sim";
import { newAsteroid } from "../sim/src/state";
import type { UiState } from "../app/src/ui-state";

export function installIssue117Demo(ui: UiState, getState: () => SimState, setState: (state: SimState) => void): void {
  function setup(scene: number): void {
    let state = createInitialState(7);
    state.hives = [];
    state.fields = [{ id: 0, sectorId: 0, kind: "cluster", centre: { x: -140, y: -80 }, radius: 55 }];
    state.asteroids = [
      newAsteroid(1000, 0, 0, { x: -140, y: -80 }, "Ice", false),
      newAsteroid(1001, 0, 0, { x: -140, y: 60 }, "Metal", false),
    ];
    state.nextAsteroidId = 1002;
    const ship = state.ships[0]!;
    Object.assign(ship, { state: "idle", position: { ...state.stations[0]!.dock.position }, target: null, leg: null, timer: 0 });
    state = queueModuleBuild(state, "Storage", { x: 80, y: 0 });
    if (scene !== 5) state = setDefaultBehaviour(state, [0], "supply");
    else state.ships[0]!.mineMaterials = ["Metal", "Ice"];
    if (scene === 4) {
      state.asteroids = state.asteroids.filter(rock => rock.material !== "Ice");
      state.respawns = [{ sectorId: 0, fieldId: 0, timer: 30, lastPosition: { x: -140, y: -80 }, rich: false }];
      state.sectors[0]!.character.abundant = "Ice";
    }
    if (scene === 6) {
      state.ships.push({ ...structuredClone(state.ships[0]!), id: 1, position: { x: -35, y: 20 } });
      state.nextShipId = 2;
    }
    setState(state);
    ui.clock = { speed: 4, paused: true };
    ui.currentSector = 0;
    ui.camera = { center: { x: -25, y: 0 }, zoom: 2.2 };
    ui.selectedShip = null;
    ui.selectedShips = [];
    ui.renderedPanel = "";
    ui.pointer = null;
    ui.buildMenuOpen = false;
    ui.selectedBuildSite = null;
  }
  Object.assign(window, { issue117Demo: { setup, snapshot: () => getState() } });
}
