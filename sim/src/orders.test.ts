import { describe, expect, it } from "vitest";
import { createInitialState, type SimState } from "./state";
import { tick } from "./tick";
import { giveOrder, formation, resumeDefault, setDefaultBehaviour } from "./orders";

function fleet(count: number): SimState {
  const state = createInitialState(7);
  const first = state.ships[0]!;
  return { ...state, ships: Array.from({ length: count }, (_, id) => ({ ...first, id })) };
}

function run(state: SimState, seconds: number): SimState {
  let next = state;
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 30) next = tick(next, Math.min(1 / 30, seconds - elapsed));
  return next;
}

function until(state: SimState, done: (state: SimState) => boolean): SimState {
  let next = state;
  for (let elapsed = 0; elapsed < 180; elapsed += 1 / 30) {
    if (done(next)) return next;
    next = tick(next, 1 / 30);
  }
  throw new Error("condition never held");
}

describe("RTS ship orders", () => {
  it("gives each ship a distinct nearby formation position", () => {
    const points = formation({ x: 50, y: -25 }, 5);
    expect(new Set(points.map((p) => `${p.x},${p.y}`)).size).toBe(5);
    expect(points.every((p) => Math.hypot(p.x - 50, p.y + 25) < 100)).toBe(true);
  });

  it("flies selected ships to a point, preserves cargo, and holds until resumed", () => {
    const start = fleet(2);
    const ordered = giveOrder(start, [start.ships[1]!.id], { kind: "move", point: { x: 0, y: -100 } });
    expect(ordered.ships[0]!.order).toBeNull();
    expect(ordered.ships[1]!.state).toBe("moving");
    const arrived = until(ordered, (s) => s.ships[1]!.state === "holding");
    expect(arrived.ships[1]!.position.y).toBeLessThan(0);
    expect(resumeDefault(arrived, [arrived.ships[1]!.id]).ships[1]!.state).not.toBe("holding");
  });

  it("mines one selected rock load and returns to the default", () => {
    const start = fleet(1);
    const rock = start.asteroids[1]!;
    const ordered = giveOrder(start, [start.ships[0]!.id], { kind: "mine", asteroidId: rock.id });
    const home = until(ordered, (s) => s.ships[0]!.order === null);
    expect(home.station.inventory[rock.material]).toBeGreaterThan(0);
    expect(home.ships[0]!.defaultBehaviour).toBe("mine");
  });

  it("keeps a same-material partial load while mining the selected rock", () => {
    const start = fleet(1);
    const rock = start.asteroids[0]!;
    const loaded = { ...start, ships: [{ ...start.ships[0]!, cargo: 5, cargoMaterial: rock.material }] };
    const ordered = giveOrder(loaded, [0], { kind: "mine", asteroidId: rock.id });
    const working = until(ordered, (s) => s.ships[0]!.state === "working");
    expect(working.ships[0]!.cargo).toBe(5);
    const homebound = until(working, (s) => s.ships[0]!.state === "homebound");
    expect(homebound.ships[0]!.cargo).toBe(20);
  });

  it("holds after an order when the default is None", () => {
    const start = setDefaultBehaviour(fleet(1), [0], "none");
    const ordered = giveOrder(start, [0], { kind: "move", point: { x: 20, y: 20 } });
    expect(until(ordered, (s) => s.ships[0]!.state === "holding").ships[0]!.order).toEqual({
      kind: "move", point: { x: 20, y: 20 },
    });
  });
});
