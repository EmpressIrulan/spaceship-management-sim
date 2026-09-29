import { describe, expect, it } from "vitest";
import { createInitialState, type SimState } from "sim";
import { worldToScreen, type Camera } from "./camera";
import {
  ORDER_LINE_SECONDS,
  isBoxDrag,
  keyPan,
  orderLineAlpha,
  orderTargetAt,
  selectionPanel,
  shipsInBox,
  toggleShip,
} from "./selection";

const viewport = { width: 800, height: 600 };
const camera: Camera = { center: { x: 0, y: 0 }, zoom: 1 };

function spread(): SimState {
  const start = createInitialState(7);
  const at = (x: number, y: number) => ({ ...start.ships[0]!, position: { x, y } });
  return { ...start, ships: [at(-100, -100), at(-80, -90), at(150, 120)] };
}

describe("box select", () => {
  it("picks every ship inside the box, whichever corner the drag started from", () => {
    const state = spread();
    const a = worldToScreen(camera, viewport, { x: -120, y: -120 });
    const b = worldToScreen(camera, viewport, { x: -70, y: -80 });
    expect(shipsInBox(state, camera, viewport, a, b)).toEqual([0, 1]);
    expect(shipsInBox(state, camera, viewport, b, a)).toEqual([0, 1]);
  });

  it("picks nothing when the box is empty", () => {
    const a = worldToScreen(camera, viewport, { x: 0, y: 200 });
    const b = worldToScreen(camera, viewport, { x: 50, y: 250 });
    expect(shipsInBox(spread(), camera, viewport, a, b)).toEqual([]);
  });

  it("treats a small wobble as a click rather than a drag", () => {
    expect(isBoxDrag({ x: 10, y: 10 }, { x: 12, y: 11 })).toBe(false);
    expect(isBoxDrag({ x: 10, y: 10 }, { x: 40, y: 30 })).toBe(true);
  });
});

describe("shift-click", () => {
  it("adds a ship that is not selected and removes one that is", () => {
    expect(toggleShip([0, 2], 1)).toEqual([0, 1, 2]);
    expect(toggleShip([0, 1, 2], 1)).toEqual([0, 2]);
  });
});

describe("right-click target", () => {
  const state = createInitialState(7);
  const rock = state.asteroids[0]!;

  it("mines a rock", () => {
    expect(orderTargetAt(state, { kind: "asteroid", id: rock.id }, rock.position))
      .toEqual({ kind: "mine", asteroidId: rock.id });
  });

  it("goes home on the Dock", () => {
    expect(orderTargetAt(state, { kind: "dock" }, { x: 0, y: 0 })).toEqual({ kind: "home" });
    const withDock = {
      ...state,
      station: {
        ...state.station,
        modules: [...state.station.modules, { type: "Dock" as const, position: { x: 0, y: 40 }, size: state.station.dock.size }],
      },
    };
    expect(orderTargetAt(withDock, { kind: "module", index: 2 }, { x: 0, y: 40 })).toEqual({ kind: "home" });
  });

  it("moves to empty space", () => {
    expect(orderTargetAt(state, null, { x: 70, y: -30 })).toEqual({ kind: "move", point: { x: 70, y: -30 } });
  });
});

describe("keyboard pan", () => {
  it("pans with WASD and the arrow keys", () => {
    expect(keyPan(new Set(["d"]), 1).dx).toBeLessThan(0);
    expect(keyPan(new Set(["ArrowLeft"]), 1).dx).toBeGreaterThan(0);
    expect(keyPan(new Set(["w"]), 1).dy).toBeGreaterThan(0);
    expect(keyPan(new Set(["ArrowDown"]), 1).dy).toBeLessThan(0);
    expect(keyPan(new Set(["D"]), 1).dx).toBeLessThan(0);
    expect(keyPan(new Set(), 1)).toEqual({ dx: 0, dy: 0 });
  });
});

describe("order line", () => {
  it("fades out over a second", () => {
    expect(ORDER_LINE_SECONDS).toBe(1);
    expect(orderLineAlpha(0)).toBe(1);
    expect(orderLineAlpha(0.5)).toBeCloseTo(0.5);
    expect(orderLineAlpha(1)).toBe(0);
    expect(orderLineAlpha(3)).toBe(0);
  });
});

describe("side panel", () => {
  it("lists the selected ships with what each is doing", () => {
    const state = createInitialState(7);
    const three = { ...state, ships: [state.ships[0]!, state.ships[0]!, state.ships[0]!] };
    const panel = selectionPanel(three, [0, 2]);
    expect(panel?.rows.map((row) => row.name)).toEqual(["Ship 1", "Ship 3"]);
    expect(panel?.defaultBehaviour).toBe("mine");
    expect(panel?.canResume).toBe(false);
  });

  it("offers Resume once a selected ship has an order", () => {
    const state = createInitialState(7);
    const ordered = {
      ...state,
      ships: [{ ...state.ships[0]!, state: "holding" as const, order: { kind: "move" as const, point: { x: 0, y: 0 } } }],
    };
    expect(selectionPanel(ordered, [0])?.canResume).toBe(true);
    expect(selectionPanel(ordered, [0])?.rows[0]?.status).toBe("Order: move, holding");
  });

  it("says Mixed when the selected ships have different defaults", () => {
    const state = createInitialState(7);
    const mixed = { ...state, ships: [state.ships[0]!, { ...state.ships[0]!, defaultBehaviour: "none" as const }] };
    expect(selectionPanel(mixed, [0, 1])?.defaultBehaviour).toBe("mixed");
  });

  it("closes with nothing selected", () => {
    expect(selectionPanel(createInitialState(7), [])).toBeNull();
  });
});
