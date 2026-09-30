import { describe, expect, it } from "vitest";
import { createInitialState, sectorInGateRange } from "sim";
import { dismissGatePlacement, gateTargetAllowed, mapHit, mapLayout, mapToggled } from "./sectors";

describe("sector map", () => {
  it("toggles with M, closes with Escape, and otherwise stays open", () => {
    expect(mapToggled(false, "m")).toBe(true);
    expect(mapToggled(true, "M")).toBe(false);
    expect(mapToggled(true, "Escape")).toBe(false);
    expect(mapToggled(true, "x")).toBe(true);
  });

  it("shows both named sectors, their gate link and ship counts, and hit-tests circles", () => {
    const state = createInitialState(11);
    const layout = mapLayout(state, { width: 1000, height: 640 });
    expect(layout.circles.map((circle) => circle.name)).toEqual(state.sectors.map((sector) => sector.name));
    expect(layout.circles).toHaveLength(4);
    expect(layout.links).toHaveLength(1);
    expect(layout.circles.map((circle) => circle.ships)).toEqual([1, 0, 0, 0]);
    expect(mapHit(layout, layout.circles[1]!.center)).toBe(1);
    expect(mapHit(layout, { x: 0, y: 0 })).toBeNull();
  });

  it("puts exactly two sectors within gate-building range of Home", () => {
    expect([1, 2, 3].filter((id) => sectorInGateRange(0, id))).toEqual([1, 3]);
  });

  it("adds a map link only when the player-built gate is paid", () => {
    const state = createInitialState(11);
    const project = { id: 0, ends: [{ sectorId: 0, position: { x: 1, y: 1 } }, { sectorId: 3, position: { x: 2, y: 2 } }] as [any, any],
      delivered: { Metal: 200, Ice: 200 }, complete: true };
    expect(mapLayout({ ...state, gateProjects: [project] }, { width: 1000, height: 640 }).links).toHaveLength(2);
    expect(mapLayout({ ...state, gateProjects: [{ ...project, complete: false }] }, { width: 1000, height: 640 }).links).toHaveLength(1);
  });

  it("clears a dismissed placement so ordinary map clicks are unrestricted", () => {
    const pending = { sectorId: 0, position: { x: 10, y: 20 } };
    expect(dismissGatePlacement(pending)).toBeNull();
    expect(gateTargetAllowed(null, 2)).toBe(true);
  });
});
