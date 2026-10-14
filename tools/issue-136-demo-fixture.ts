// Only the recording bundle imports this fixture; healing uses real ticks.
import { createInitialState, tick, type Ship, type SimState } from "sim";
import type { UiState } from "../app/src/ui-state";

export function installIssue136Demo(ui: UiState, getState: () => SimState, setState: (state: SimState) => void): void {
  function setup(scene: number): void {
    const state = createInitialState(7);
    const base = state.ships[0]!;
    state.asteroids = []; state.fields = []; state.respawns = []; state.hives = []; state.bugs = [];
    state.sectors[0]!.gate.to = 0;
    const station = state.stations[0]!;
    station.modules = [{ type: "Builder", position: { x: -150, y: 0 }, size: { width: 30, height: 40 }, hp: 40, maxHp: 40 }];
    station.inventory = { Metal: 500, Ice: 500 };
    station.shipBuilds = []; station.buildQueue = []; station.construction = null;
    const make = (id: number, x: number, hp: number, repair = false): Ship => ({ ...structuredClone(base), id,
      position: { x, y: 0 }, state: "holding", defaultBehaviour: "none", order: null, leg: null, timer: 0, berth: null,
      hp, maxHp: 40, cargo: 0, target: null, transfer: null,
      design: repair ? { width: 3, height: 2, slots: ["Engine", "Repair", "Repair", "Engine", "Repair", "Repair"] }
        : { width: 2, height: 2, slots: ["Hull", "Hull", "Hull", "Hull"] } });
    const repairer = make(10, -1.8, 40, true);
    const target = make(11, 1, scene === 6 ? 36 : 30);
    repairer.repairTarget = { kind: "ship", shipId: target.id };
    state.ships = [repairer, target];
    if (scene === 4) {
      repairer.position.x = -1; repairer.defaultBehaviour = "repair"; repairer.repairTarget = null;
      target.position.x = 1; target.hp = 39.2;
      station.modules[0]!.position = { x: -10, y: 0 }; station.modules[0]!.size = {width: 2,height: 2}; station.modules[0]!.hp = 39.2;
      state.ships.push(make(12, 15, 39.2));
    }
    if (scene === 5) {
      repairer.defaultBehaviour = "repair"; repairer.repairTarget = null;
      target.hp = 38.4;
      state.ships.push(make(12, 30, 38.4));
    }
    if (scene === 7) {
      state.bugs = Array.from({length: 5}, (_, id) => ({ id, hiveId: 0, sectorId: 0, position: { x: 1.4, y: id * 0.4 }, hp: 6, maxHp: 6,
        state: "hunting", targetShipId: 11, targetModule: null, leg: null, timer: id === 0 ? 0.2 : 100 }));
    }
    if (scene === 8) {
      repairer.hp = 30; repairer.defaultBehaviour = "repair"; repairer.repairTarget = null;
      state.ships = [repairer];
    }
    setState(state);
    Object.assign(ui, { clock: { speed: 1, paused: true }, currentSector: 0,
      camera: { center: { x: 2, y: 0 }, zoom: scene === 4 || scene === 5 ? 8 : 30 }, pointer: null, selectedShip: null, selectedShips: [], mapOpen: false });
  }
  Object.assign(window, { issue136Demo: {
    setup,
    step: (dt: number) => setState(tick(getState(), dt)),
    addPartner: () => {
      const state = getState();
      const partner = { ...structuredClone(state.ships[0]!), id: 11, position: { x: 1, y: 0 } };
      setState({ ...state, ships: [...state.ships, partner] });
    },
  } });
}
