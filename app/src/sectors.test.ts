import { describe, expect, it } from "vitest";
import { createInitialState } from "sim";
import { mapHit, mapLayout, mapToggled } from "./sectors";

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
    expect(layout.links).toHaveLength(1);
    expect(layout.circles.map((circle) => circle.ships)).toEqual([1, 0]);
    expect(mapHit(layout, layout.circles[1]!.center)).toBe(1);
    expect(mapHit(layout, { x: 0, y: 0 })).toBeNull();
  });
});
