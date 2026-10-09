// Recording-only arrangements. All births, movement, damage, builds and drops
// are produced by the real simulation; production never imports this file.
import { createInitialState, giveOrder, tick, BUILDER_SIZE, type SimState, type Ship, type Vec } from "sim";
import { applyTool, withModule } from "../app/src/shipyard";
import type { UiState } from "../app/src/ui-state";

export function installIssue105Demo(ui: UiState, get: () => SimState, set: (s: SimState) => void): void {
  function setup(count = 0, ships = false): void {
    const s = createInitialState(105);
    s.asteroids = []; s.respawns = []; s.ships = [];
    const h = s.hives![0]!;
    s.bugs = Array.from({ length: count }, (_, id) => ({ id, hiveId: h.id, sectorId: h.sectorId,
      position: { x: h.position.x + [-30, 30, -30, 30, 0][id % 5]!, y: h.position.y + [-30, -30, 30, 30, -38][id % 5]! }, hp: 6, maxHp: 6,
      state: "hovering" as const, targetShipId: null, leg: null, timer: 0 }));
    s.nextBugId = count;
    if (ships) {
      const template = createInitialState(105).ships[0]!;
      const ship: Ship = { ...template, state: "holding", position: { x: h.position.x + 110, y: h.position.y + 30 },
        sectorId: h.sectorId, hp: 40, maxHp: 40, cargo: 5, cargoByMaterial: { Metal: 5, Ice: 0 }, cargoMaterial: "Metal",
        design: { width: 3, height: 2, slots: ["Engine", "Hull", "Storage", "Engine", "Hull", "Storage"] },
        defaultBehaviour: "none", order: null, timer: 0, leg: null, target: null, berth: null, transfer: null };
      s.ships = [ship];
    }
    set(s); ui.clock = { speed: 4, paused: true }; ui.selectedShips = []; ui.selectedShip = null;
    ui.shipMenuBuilder = null; document.querySelector<HTMLElement>("#ship-menu")!.hidden = true;
  }
  Object.assign(window, { issue105Demo: {
    setup,
    hunting: () => {
      setup(5, true); const s = get(); const h = s.hives![0]!;
      const farther = { ...structuredClone(s.ships[0]!), id: 99, cargo: 0, cargoMaterial: null,
        cargoByMaterial: { Metal: 0, Ice: 0 }, position: { x: h.position.x - 210, y: h.position.y + 100 } };
      s.ships.push(farther); set(s);
    },
    pause: () => { ui.clock.paused = true; },
    run: (speed: 1 | 2 | 4 = 4) => { ui.clock = { speed, paused: false }; },
    focus: (position: Vec, zoom = 3) => { ui.camera = { center: { ...position }, zoom }; },
    designer: () => {
      setup(); const s = get(); const station = s.stations[0]!;
      station.modules.push({ type: "Builder", position: { x: 80, y: 0 }, size: BUILDER_SIZE });
      station.inventory = { Metal: 500, Ice: 500 }; set(s);
    },
    paint: (module: "Engine" | "Hull" | "Gun", x: number, y: number) => { ui.draft = withModule(ui.draft, module); applyTool(ui.draft, { x, y }); },
    move: (id: number, position: Vec, sectorId: number) => {
      set(giveOrder(get(), [id], { kind: "move", point: position, sectorId }));
      ui.selectedShips = [id]; ui.selectedShip = id;
    },
    combat: () => {
      setup(1, true); const s = get(); const h = s.hives![0]!;
      s.ships[0]!.position = { x: h.position.x - 60, y: h.position.y + 25 };
      s.ships[0]!.design.slots[1] = "Gun";
      s.bugs![0]!.position = { x: h.position.x - 25, y: h.position.y + 25 };
      s.bugs![0]!.timer = 6;
      h.hp = 9; set(s);
    },
    dead: () => { setup(); const s = get(); const h = s.hives![0]!;
      const template = createInitialState(105).ships[0]!;
      s.ships = [{ ...template, design: { width: 2, height: 1, slots: ["Engine", "Gun"] }, state: "holding", sectorId: h.sectorId,
        position: { x: h.position.x - 60, y: h.position.y }, defaultBehaviour: "none", timer: 0, leg: null, order: null }];
      h.hp = 3; set(tick(s, 0.01));
    },
  }});
}
