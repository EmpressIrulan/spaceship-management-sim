// Recording-only scenes for the issue 146 demo. Production code does not import
// this fixture. Every scene is a seeded state advanced by the real `tick`.
import { createInitialState, dockBerths, giveOrder, tick, type Asteroid, type Bug, type Ship, type SimState, type Vec } from "sim";
import { travelSeconds } from "../sim/src/motion";
import type { UiState } from "../app/src/ui-state";

const BUG_SPEED = 0.6;

export function installIssue146Demo(ui: UiState, getState: () => SimState, setState: (state: SimState) => void): void {
  function setup(scene: number): void {
    const state = createInitialState(7);
    const base = state.ships[0]!;
    state.asteroids = []; state.fields = []; state.respawns = []; state.hives = []; state.bugs = [];
    state.sectors[0]!.gate.to = 0;
    const station = state.stations[0]!;
    const make = (id: number, at: Vec, extra: Partial<Ship> = {}): Ship => ({
      ...structuredClone(base), id, position: { ...at }, state: "holding", defaultBehaviour: "none",
      mineMaterials: [], order: null, leg: null, timer: 0, berth: null, cargo: 0, target: null, transfer: null,
      hp: 1000, maxHp: 1000, ...extra,
    });
    const rock = (id: number, at: Vec): Asteroid => ({ id, sectorId: 0, rich: false, fieldId: 0, position: { ...at },
      size: { width: 13, height: 10 }, ore: 30, material: "Metal" });
    const bug = (id: number, from: Vec, to: Vec, targetShipId: number): Bug => {
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      return { id, hiveId: 0, sectorId: 0, position: { ...from }, design: { width: 1, height: 1, slots: ["Gun"] }, loiterRng: id,
        hp: 100, maxHp: 100, state: "hunting", targetShipId, targetModule: null, leg: { from: { ...from }, to: { ...to } },
        timer: travelSeconds(length, BUG_SPEED) };
    };
    const sendMoves = (orders: { id: number; to: Vec }[]) => {
      let next = state;
      for (const { id, to } of orders) next = giveOrder(next, [id], { kind: "move", point: to });
      setState(next);
    };
    // Open space well away from the station (the Dock sits at the origin).
    const C: Vec = { x: 300, y: 0 };
    let camera = { center: { ...C }, zoom: 12 };
    // Park the home ship away from every scene so only seeded ships are shown.
    const away = (): void => { state.ships = []; };
    away();
    if (scene === 1) {
      state.ships = [make(1, { x: C.x - 40, y: C.y }), make(2, { x: C.x, y: C.y - 40 })];
      setState(state);
      sendMoves([{ id: 1, to: { x: C.x + 40, y: C.y } }, { id: 2, to: { x: C.x, y: C.y + 40 } }]);
    } else if (scene === 2) {
      camera = { center: { x: 5, y: -12 }, zoom: 10 };
      state.asteroids = [rock(900, { x: 0, y: -30 })];
      state.ships = [make(1, { x: -45, y: -2 }), make(2, { x: -45, y: -30 })];
      state.bugs = [bug(0, { x: 60, y: 5 }, { x: -45, y: 5 }, 1)];
      setState(state);
      sendMoves([{ id: 1, to: { x: 60, y: -2 } }, { id: 2, to: { x: 45, y: -30 } }]);
    } else if (scene === 3) {
      camera = { center: { x: C.x + 25, y: C.y }, zoom: 12 };
      const fan = [-25, -15, -5, 5, 15, 25];
      state.ships = fan.map((_, id) => make(id + 1, C));
      setState(state);
      sendMoves(fan.map((y, i) => ({ id: i + 1, to: { x: C.x + 60, y: C.y + y } })));
    } else if (scene === 4) {
      camera = { center: { x: -10, y: 8 }, zoom: 10 };
      state.asteroids = [rock(900, { x: -30, y: 25 })];
      const berths = dockBerths(station.dock.position);
      const rockSite = { x: -30, y: 25 };
      const miner = (id: number, dx: number, dy: number) => make(id, { x: rockSite.x + dx, y: rockSite.y + dy }, {
        state: "working", timer: 1000, cargoMaterial: "Metal",
        target: { asteroidId: 900, sectorId: 0, site: { x: rockSite.x + dx, y: rockSite.y + dy } },
      });
      state.ships = [
        make(1, berths[0]!, { state: "docked", berth: 0 }),
        make(2, berths[1]!, { state: "docked", berth: 4 }),
        miner(3, -4.3, 2), miner(4, 0, 2), miner(5, 4.3, 2),
        make(10, { x: -62, y: 26 }), make(11, { x: 0, y: -40 }),
      ];
      setState(state);
      sendMoves([{ id: 10, to: { x: 0, y: 26 } }, { id: 11, to: { x: 0, y: 40 } }]);
    } else if (scene === 5) {
      camera = { center: { x: C.x - 5, y: C.y }, zoom: 12 };
      const rows = [-9, -3, 3, 9];
      state.ships = rows.map((y, i) => make(i + 1, { x: C.x - 45, y: C.y + y }));
      setState(giveOrder(state, rows.map((_, i) => i + 1), { kind: "move", point: { ...C } }));
    } else if (scene === 6) {
      camera = { center: { x: C.x + 5, y: C.y }, zoom: 12 };
      const guard = { x: C.x - 25, y: C.y };
      state.ships = [make(1, guard), make(2, { x: C.x + 27, y: C.y - 30 })];
      state.bugs = [-6, -1, 4].map((dy, i) => bug(i, { x: C.x + 45, y: C.y + dy }, { x: C.x - 35, y: C.y + dy }, 1));
      setState(state);
      sendMoves([{ id: 2, to: { x: C.x + 27, y: C.y + 50 } }]);
    }
    Object.assign(ui, { clock: { speed: 1, paused: true }, currentSector: 0, camera, pointer: null, selectedShip: null, selectedShips: [], mapOpen: false });
  }
  Object.assign(window, { issue146Demo: {
    setup,
    step: (dt: number) => setState(tick(getState(), dt)),
    snapshot: () => {
      const state = getState();
      const station = state.stations[0]!;
      return {
        time: state.time,
        ships: state.ships.map(({ id, position, state: s, leg, design }) => ({ id, x: position.x, y: position.y, state: s,
          from: leg?.from ?? null, to: leg?.to ?? null, width: design.width, height: design.height })),
        bugs: state.bugs.map(({ id, position, leg, timer }) => ({ id, x: position.x, y: position.y, from: leg?.from ?? null, to: leg?.to ?? null, timer })),
        asteroids: state.asteroids.map(({ id, position, size }) => ({ id, x: position.x, y: position.y, ...size })),
        modules: station.modules.map(({ position, size }) => ({ x: position.x, y: position.y, ...size })),
      };
    },
  } });
}
