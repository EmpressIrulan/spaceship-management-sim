// Only the recorder imports this fixture, through its build-time entry plugin.
import { createInitialState, tick, type SimState, type ShipModule } from "sim";
import type { UiState } from "../app/src/ui-state";

export function installIssue106Demo(ui: UiState, getState: () => SimState, setState: (state: SimState) => void): void {
  function setup(scene: number, generators = 1): void {
    const state = createInitialState(7);
    state.hives = [];
    state.asteroids = [];
    state.fields = [];
    state.ships = [state.ships[0]!];
    const modules: ShipModule[] = ["Engine", "Capacitor", ...Array<ShipModule>(generators).fill("Generator")];
    const ship = state.ships[0]!;
    Object.assign(ship, { design: { width: modules.length, height: 1, slots: modules }, state: "holding", position: { x: -90, y: -60 }, target: null, leg: null, timer: 0, order: null });
    if (scene === 2) {
      ship.shield = 10;
      state.ships.push({ ...structuredClone(ship), id: 1, position: { x: -90, y: 30 }, design: { width: 4, height: 1, slots: ["Engine", "Capacitor", "Capacitor", "Generator"] }, shield: 20 });
    }
    if (scene === 3) ship.design = { width: 3, height: 1, slots: ["Engine", "Generator", "Generator"] };
    if (scene === 4 || scene === 5) {
      if (scene === 4) {
        ship.shield = 2.5;
        ship.design = { width: 2, height: 1, slots: ["Engine", "Capacitor"] };
      }
      state.bugs = Array.from({ length: 5 }, (_, id) => ({
        id, hiveId: 0, sectorId: 0, position: { x: ship.position.x + 1, y: ship.position.y + 1 }, hp: 10, maxHp: 10,
        state: "hunting" as const, targetShipId: ship.id, leg: null,
        timer: scene === 5 ? 1 : id < 3 ? 2 + id * 2 : 100,
      }));
      state.nextBugId = 5;
    }
    if (scene === 1 || scene === 6) {
      state.ships = [];
      state.stations[0]!.inventory = { Metal: 500, Ice: 500 };
      state.stations[0]!.modules.push({ type: "Builder", position: { x: 0, y: -70 }, size: { width: 30, height: 30 } });
    }
    state.nextShipId = scene === 2 ? 2 : 1;
    setState(state);
    ui.clock = { speed: 1, paused: true };
    ui.currentSector = 0;
    ui.camera = { center: { x: -40, y: -30 }, zoom: 3 };
    ui.selectedShip = null;
    ui.selectedShips = [];
    ui.renderedPanel = "";
    ui.pointer = null;
  }
  Object.assign(window, { issue106Demo: {
    setup,
    step: (seconds: number) => setState(tick(getState(), seconds)),
    removeBugs: () => setState({ ...getState(), bugs: [] }),
    snapshot: () => getState(),
  } });
}
