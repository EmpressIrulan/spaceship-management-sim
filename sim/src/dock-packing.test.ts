import { describe, expect, it } from "vitest";
import { freeBerth, fitsDock } from "./dock-packing";
import type { BerthLayout, ShipDesign } from "./model";
import { createInitialState } from "./state";

const longShip: ShipDesign = { width: 12, height: 3, slots: Array(36).fill("Hull") };
const squareShip: ShipDesign = { width: 6, height: 6, slots: Array(36).fill("Hull") };

describe("per-dock ship fitting", () => {
  it("fits a long ship in a 12x3 dock and refuses a same-area square ship", () => {
    const initial = createInitialState(1);
    const dock = { type: "Dock" as const, position: { x: 0, y: 0 }, size: { width: 90, height: 22.5 }, width: 12, height: 3 };
    const layout: BerthLayout = { dock: dock.position, sectorId: 0, modules: [dock], capacity: 36 };
    expect(fitsDock(longShip, layout)).toBe(true);
    expect(fitsDock(squareShip, layout)).toBe(false);
    expect(freeBerth(layout, [], longShip)).not.toBeNull();
    expect(freeBerth(layout, [], squareShip)).toBeNull();
  });
});
