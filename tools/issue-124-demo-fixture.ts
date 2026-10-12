// Recording-only seeded states. Neither this file nor its UI hooks ship in the game.
import { STARTING_SHIP, berthPoint, createInitialState, giveOrder, shipSize, shipStats, stationIncome, tick, type ShipDesign, type SimState } from "sim";
import { berthLayout, GATE_DISTANCE } from "../sim/src/state";
import type { UiState } from "../app/src/ui-state";

// Same 25-unit cruise speed as the starter; a small hold and eleven lasers
// isolate the travel-dominated case rather than implying every cycle is 5×.
export const TRAVEL_MINER: ShipDesign = { width: 4, height: 4,
  slots: ["Engine", "Engine", "Engine", "Engine", "Laser", "Laser", "Laser", "Laser",
    "Laser", "Laser", "Laser", "Laser", "Laser", "Laser", "Laser", "Storage"] };

export function createIssue124DemoState(scene: number, design = STARTING_SHIP): SimState {
  const state = createInitialState(7);
  if ([1, 5, 7].includes(scene)) return state;
  state.hives = [];
  state.bugs = [];
  state.respawns = [];
  const ship = state.ships[0]!, station = state.stations[0]!;
  Object.assign(ship, { state: "idle", timer: 0, cargo: 0, cargoMaterial: null,
    cargoByMaterial: { Metal: 0, Ice: 0 }, target: null, leg: null, transfer: null, order: null,
    berth: 0, position: berthPoint(berthLayout(station), 0, ship.design) });
  if (scene === 2) {
    state.asteroids = [{ ...state.asteroids[0]!, position: { x: 140, y: 0 } }];
    ship.position = { x: 80, y: 0 }; ship.berth = null;
    state.hives = [{ id: 0, sectorId: 0, position: { x: 100, y: 55 }, hp: 200, maxHp: 200, alive: true, spawnTimer: 10 }];
    state.bugs = [{ id: 0, hiveId: 0, sectorId: 0, position: { x: 140, y: 55 }, hp: 6, maxHp: 6,
      state: "hovering", targetShipId: null, targetModule: null, leg: null, timer: 10 }];
  } else if (scene === 3) {
    state.asteroids = [{ ...state.asteroids[0]!, position: { x: 140, y: 0 } }];
    state.sectors[0]!.gate.position = { x: 210, y: 0 };
    state.ships = [];
  } else if (scene === 8) {
    // A controlled counterpart of the gate-radius route: only distance changes.
    // Fixed mining/unloading time remains real, so full-cycle ratios need not be 5.
    const rock = { ...state.asteroids[0]!, position: { x: GATE_DISTANCE, y: 0 }, material: "Metal" as const, ore: 1000 };
    state.asteroids = [rock]; state.fields = []; ship.mineMaterials = ["Metal"]; ship.design = design;
    return giveOrder(state, [ship.id], { kind: "mine", asteroidId: rock.id });
  } else state.asteroids = [];
  return state;
}

export function measureIssue124Trip(design = STARTING_SHIP) {
  let state = createIssue124DemoState(8, design);
  const stats = shipStats(design);
  const outboundSeconds = state.ships[0]!.timer;
  // Advance the actual tick until the first complete hold is credited.
  while (state.stations[0]!.inventory.Metal < stats.hold && state.time < 2000) state = tick(state, 0.25);
  if (state.stations[0]!.inventory.Metal !== stats.hold) throw new Error("Demo miner failed to deliver a complete hold");
  return { seconds: state.time, delivered: state.stations[0]!.inventory.Metal,
    income: stationIncome(state).Metal, cruiseSpeed: stats.speed, outboundSeconds };
}

export function installIssue124Demo(ui: UiState, getState: () => SimState, setState: (state: SimState) => void,
  limits: { min: number; max: number }) {
  const openingCamera = structuredClone(ui.camera);
  const metrics = measureIssue124Trip(TRAVEL_MINER);
  const api = {
    limits, metrics,
    get state() { return getState(); },
    get ui() { return ui; },
    setup(scene: number) {
      setState(createIssue124DemoState(scene, scene === 8 ? TRAVEL_MINER : STARTING_SHIP));
      Object.assign(ui, { clock: { speed: 1, paused: true }, currentSector: 0, pointer: null,
        selectedShip: null, selectedShips: [], mapOpen: false, camera: structuredClone(openingCamera) });
    },
    camera(x: number, y: number, zoom: number) {
      if (zoom < limits.min || zoom > limits.max) throw new Error(`Zoom ${zoom} outside game limits`);
      ui.camera = { center: { x, y }, zoom };
    },
    step(seconds: number) { setState(tick(getState(), seconds)); },
    sizes() { return { dock: getState().stations[0]?.dock.size, ship: shipSize(getState().ships[0]!.design) }; },
  };
  Object.assign(window, { issue124Demo: api });
}
