// Recording-only fixture, injected into a separate demo bundle.
import { BUILDER_SIZE, createInitialState, type SimState } from "sim";
import type { UiState } from "../app/src/ui-state";

export function installIssue122Demo(ui: UiState, setState: (state: SimState) => void): void {
  const state = createInitialState(122);
  state.asteroids = [];
  state.fields = [];
  state.respawns = [];
  state.ships = state.ships.slice(0, 1);
  const start = state.ships[0]!;
  start.position = { x: -25, y: 0 };
  const designs = [
    start.design,
    { width: 3, height: 2, slots: ["Engine", "Hull", "Laser", "Storage", null, "Hull"] } as const,
    { width: 2, height: 3, slots: ["Hull", "Engine", "Storage", "Laser", "Hull", "Engine"] } as const,
  ];
  state.ships.push(...designs.slice(1).map((design, index) => ({
    ...start, id: index + 1, design: { ...design, slots: [...design.slots] },
    position: { x: index === 0 ? 0 : 25, y: 0 },
  })));
  state.nextShipId = state.ships.length;
  const station = state.stations[0]!;
  for (const module of station.modules) module.position = { x: module.position.x, y: -90 };
  station.modules.push({ type: "Builder", position: { x: 0, y: -130 }, size: { ...BUILDER_SIZE } });
  setState(state);
  Object.assign(ui, {
    clock: { speed: 1, paused: true }, currentSector: 0,
    camera: { center: { x: 0, y: 0 }, zoom: 3 }, pointer: null,
    selectedShip: null, selectedShips: [], mapOpen: false,
    shipMenuBuilder: null, shipMenuPosition: null, shipMenuStation: 0,
  });
}
