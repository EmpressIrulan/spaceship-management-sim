// Recording-only scenes for the issue 145 demo. Production code does not import
// this fixture. Each scene seeds a state; the real clock then runs the real `tick`.
import { createInitialState, type Asteroid, type Bug, type Hive, type Ship, type SimState, type Vec } from "sim";
import { makeHive } from "../sim/src/enemies";
import { STARTING_SHIP } from "../sim/src/ship";
import { makeWorker } from "../sim/src/worker-bugs";
import type { UiState } from "../app/src/ui-state";

// A gun ship: two Guns, so `guns(design) > 0` and it fires at bugs in range.
const GUN_SHIP: Ship["design"] = { width: 2, height: 2, slots: ["Gun", "Gun", "Engine", "Hull"] };

export function installIssue145Demo(ui: UiState, getState: () => SimState, setState: (state: SimState) => void): void {
  function setup(scene: number): void {
    const state = createInitialState(7);
    const base = state.ships[0]!;
    state.asteroids = []; state.fields = []; state.respawns = []; state.hives = []; state.bugs = []; state.drops = [];
    state.ships = [];
    state.sectors[0]!.gate.to = 0;
    state.nextBugId = 1000;
    state.nextHiveId = 10;
    const rock = (id: number, at: Vec, material: "Metal" | "Ice"): Asteroid => ({ id, sectorId: 0, rich: false, fieldId: 0,
      position: { ...at }, size: { width: 13, height: 10 }, ore: 60, material });
    const hive = (id: number, at: Vec, stock: { Metal: number; Ice: number }): Hive => ({
      ...makeHive(id, 0, at), stock: { ...stock },
    });
    // Workers come from the real constructor, then the scene trims or wounds them.
    const workersFor = (h: Hive, count: number, hpOverrides: number[] = []): Bug[] =>
      Array.from({ length: count }, (_, i) => {
        const w = makeWorker(h.id * 100 + i, h);
        return hpOverrides[i] === undefined ? w : { ...w, hp: hpOverrides[i]! };
      });
    const ship = (id: number, at: Vec): Ship => ({
      ...structuredClone(base), id, position: { ...at }, design: GUN_SHIP, state: "holding", defaultBehaviour: "none",
      mineMaterials: [], order: null, leg: null, timer: 0, berth: null, cargo: 0, target: null, transfer: null,
      hp: 1000, maxHp: 1000, gunTimer: 0, gunShot: null,
    });
    const C: Vec = { x: 300, y: 0 };
    let camera = { center: { ...C }, zoom: 4 };
    if (scene === 1) {
      // Criterion 1: three unarmed workers, one Metal rock and one Ice rock, empty stock.
      const h = hive(10, C, { Metal: 0, Ice: 0 });
      state.hives = [h];
      state.asteroids = [rock(900, { x: 300 - 60, y: -35 }, "Metal"), rock(901, { x: 300 + 60, y: 35 }, "Ice")];
      state.bugs = workersFor(h, 3);
    } else if (scene === 2) {
      // Criterion 2: stock 14 Metal and 14 Ice buys one large (8/8), one medium (4/4), one small (2/2).
      camera = { center: { ...C }, zoom: 3.5 };
      const h = hive(10, C, { Metal: 14, Ice: 14 });
      state.hives = [h];
      state.bugs = workersFor(h, 3);
    } else if (scene === 3) {
      // Criterion 3: a stocked hive on the left, an empty one on the right.
      camera = { center: { x: C.x, y: 0 }, zoom: 3 };
      const rich = hive(10, { x: 230, y: 0 }, { Metal: 60, Ice: 60 });
      const empty = hive(11, { x: 370, y: 0 }, { Metal: 0, Ice: 0 });
      state.hives = [rich, empty];
      state.bugs = [...workersFor(rich, 3), ...workersFor(empty, 3)];
    } else if (scene === 4) {
      // Criterion 4: two workers left, stock for exactly one replacement (2/2) and nothing more.
      const h = hive(10, C, { Metal: 2, Ice: 2 });
      state.hives = [h];
      state.bugs = workersFor(h, 2);
    } else if (scene === 5) {
      // Criterion 5: worker 1 is shot once and survives; worker 2 starts at 3 HP and dies to one shot.
      const h = hive(10, C, { Metal: 0, Ice: 0 });
      state.hives = [h];
      state.bugs = workersFor(h, 3, [6, 6, 3]);
      // Each gun sees only one worker in range (80), and the hive is out of range of both.
      state.ships = [ship(1, { x: 300, y: 90 }), ship(2, { x: 215, y: -17 })];
    } else if (scene === 6) {
      // Criterion 6: the same hive with its workers, and the same hive after its workers were killed.
      camera = { center: { x: 300, y: 0 }, zoom: 3 };
      const whole = hive(10, { x: 230, y: 0 }, { Metal: 4, Ice: 4 });
      const killed = hive(11, { x: 370, y: 0 }, { Metal: 4, Ice: 4 });
      state.hives = [whole, killed];
      state.bugs = workersFor(whole, 3);
      state.asteroids = [rock(900, { x: 230, y: -45 }, "Metal"), rock(901, { x: 230, y: 45 }, "Ice"),
        rock(902, { x: 370, y: -45 }, "Metal"), rock(903, { x: 370, y: 45 }, "Ice")];
    } else if (scene === 7) {
      // Criterion 7: a stocked hive, and the pointer on it. No stock figure should appear.
      const h = hive(10, C, { Metal: 9, Ice: 9 });
      state.hives = [h];
      state.bugs = workersFor(h, 3);
    }
    setState(state);
    Object.assign(ui, { clock: { speed: 4, paused: false }, currentSector: 0, camera, pointer: null, selectedShip: null, selectedShips: [], mapOpen: false });
  }
  Object.assign(window, { issue145Demo: {
    setup,
    snapshot: () => {
      const state = getState();
      return {
        time: state.time,
        hives: (state.hives ?? []).map(({ id, position, alive, hp, stock }) => ({ id, x: position.x, y: position.y, alive, hp, stock: stock ?? { Metal: 0, Ice: 0 } })),
        bugs: (state.bugs ?? []).map(({ id, hiveId, role, state: s, hp, cargo, design, position }) => ({
          id, hiveId, role: role ?? "fighter", state: s, hp, cargo: cargo ?? 0, width: design?.width ?? 0, x: position.x, y: position.y,
        })),
        ships: state.ships.map(({ id, position, state: s, gunShot }) => ({ id, x: position.x, y: position.y, state: s, shooting: !!gunShot })),
        drops: (state.drops ?? []).length,
      };
    },
  } });
}
