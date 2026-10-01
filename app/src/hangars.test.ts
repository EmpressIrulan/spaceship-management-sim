import { describe, expect, it } from "vitest";
import { createInitialState, type ShipDesign } from "sim";
import { infoBox } from "./labels";
import { emptyDraft, shipMenuView, withModule } from "./shipyard";
import { shipsInBox } from "./selection";

describe("hangars in the interface", () => {
  it("offers Hangar as a pixel type in the ship designer", () => {
    const state = createInitialState(1);
    const draft = withModule(emptyDraft(), "Hangar");
    draft.cells.set("0,0", "Hangar");
    expect(shipMenuView(state, 0, draft).parts).toContain("Hangar 1 px");
  });

  it("shows capacity used and docked ship count when hovering a carrier", () => {
    const state = createInitialState(1);
    const carrierDesign: ShipDesign = { width: 40, height: 1, slots: Array(40).fill("Hangar") };
    state.ships = [
      { ...state.ships[0]!, id: 1, design: carrierDesign },
      { ...state.ships[0]!, id: 2, state: "docked", hangarId: 1 },
    ];

    expect(infoBox(state, { kind: "ship", index: 0 })?.line).toContain("Hangar 16/40\nDocked ships: 1");
    expect(infoBox(state, { kind: "ship", index: 0 })?.action).toMatchObject({ label: "Launch all", carrierId: 1, disabled: false });
    expect(shipsInBox(state, { center: { x: 0, y: 0 }, zoom: 1 }, { width: 100, height: 100 }, 0,
      { x: 40, y: 40 }, { x: 60, y: 60 })).toEqual([1]);
  });
});
