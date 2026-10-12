// Recording-only seed and hooks; never included in the shipped game.
import { BUILDER_SIZE, MODULE_SPACING, createInitialState, STARTING_SHIP, type ShipDesign, type SimState } from "sim";
import { draftFromDesign, viewCentredOn } from "../app/src/blueprints";
import type { UiState } from "../app/src/ui-state";

export const MIXED_SHIP: ShipDesign = { width: 4, height: 2,
  slots: ["Generator", "Capacitor", "Gun", "Hull", "Storage", "Laser", "Engine", "Engine"] };

export function installIssue123Demo(ui: UiState, getState: () => SimState,
  setState: (state: SimState) => void, openMenu: (builder: number) => void,
  closeMenu: () => void, limits: { min: number; max: number }) {
  Object.assign(window, { issue123Demo: {
    setup(mixed = false, multiple = false) {
      closeMenu();
      const state = createInitialState(7);
      state.hives = []; state.bugs = [];
      state.stations[0]!.modules.push({ type: "Builder", position: { x: 0, y: -MODULE_SPACING }, size: BUILDER_SIZE, hp: 40 });
      const ship = state.ships[0]!;
      Object.assign(ship, { position: { x: 60, y: 0 }, berth: null, state: "idle",
        order: null, leg: null, target: null, timer: 0 });
      if (mixed) ship.design = MIXED_SHIP;
      if (multiple) state.ships.push({ ...structuredClone(ship), id: 1, position: { x: 80, y: 0 } });
      setState(state);
      Object.assign(ui, { clock: { speed: 1, paused: true }, selectedShips: multiple ? [0, 1] : [0],
        selectedShip: 0, renderedPanel: "", currentSector: 0, mapOpen: false,
        camera: { center: { x: 65, y: 0 }, zoom: Math.min(12, limits.max) } });
    },
    build(mixed = false) {
      const index = getState().stations[0]!.modules.findIndex(m => m.type === "Builder");
      openMenu(index);
      const design = mixed ? MIXED_SHIP : STARTING_SHIP;
      ui.draft = draftFromDesign(ui.draft, design);
      ui.paintView = viewCentredOn(ui.paintView, design);
    },
  } });
}
