import { describe, expect, it } from "vitest";
import { createInitialState } from "sim";
import { fitCamera } from "./camera";
import { contextOrderAllowed, orderLineAlpha, selectionPanel, shipsInBox, toggleShip } from "./selection";

describe("RTS selection helpers", () => {
  it("box-selects by ship id and shift selection toggles by id", () => {
    const state = createInitialState(7);
    const camera = fitCamera({ width: 800, height: 600 }, [state.station.dock, ...state.asteroids]);
    const viewport = { width: 800, height: 600 };
    const twoShips = { ...state, ships: [state.ships[0]!, { ...state.ships[0]!, id: 42 }] };
    const box = { x: 0, y: 0 };
    const picked = shipsInBox(twoShips, camera, viewport, 0, box, { x: 800, y: 600 });
    expect(picked).toEqual([0, 42]);
    expect(toggleShip(picked, 0)).toEqual([42]);
    expect(toggleShip([], 0)).toEqual([0]);
  });

  it("lists selected ships, mixed defaults, and whether Resume is available", () => {
    const initial = createInitialState(7);
    const second = { ...initial.ships[0]!, id: 14, defaultBehaviour: "none" as const, order: { kind: "move" as const, point: { x: 1, y: 2 }, sectorId: 0 } };
    const state = { ...initial, ships: [initial.ships[0]!, second] };
    expect(selectionPanel(state, [0, 14])).toMatchObject({ defaultBehaviour: "mixed", canResume: true, rows: [{ id: 0 }, { id: 14 }] });
  });

  it("fades order feedback to zero after one second", () => {
    expect(orderLineAlpha(0)).toBe(1);
    expect(orderLineAlpha(0.5)).toBe(0.5);
    expect(orderLineAlpha(1)).toBe(0);
  });

  it("box-selects only ships in the sector being viewed", () => {
    const initial = createInitialState(19);
    const homeShip = initial.ships[0]!;
    const farShip = { ...homeShip, id: 42, sectorId: 1, position: { x: 2000, y: 2000 } };
    const state = { ...initial, ships: [homeShip, farShip] };
    const camera = { center: { x: 1000, y: 1000 }, zoom: 0.1 };

    expect(shipsInBox(state, camera, { width: 800, height: 600 }, 1, { x: 0, y: 0 }, { x: 800, y: 600 })).toEqual([42]);
  });

  it("ignores context orders while the map is open", () => {
    expect(contextOrderAllowed(true)).toBe(false);
    expect(contextOrderAllowed(false)).toBe(true);
  });
});
