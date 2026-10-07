import { describe, expect, it } from "vitest";
import { createInitialState } from "./state";
import { setShipHome } from "./orders";
import { placeStation, removeStation } from "./station-placement";

describe("ship home stations", () => {
  it("starts with Home assigned and migrates an old missing home when Home is selected", () => {
    const state = createInitialState(7);
    expect(state.ships[0]!.homeStationId).toBe(0);
    const oldSave = { ...state, ships: state.ships.map(({ homeStationId: _old, ...ship }) => ship) };

    expect(setShipHome(oldSave, [state.ships[0]!.id], 0).ships[0]!.homeStationId).toBe(0);
  });

  it("treats a missing home in an old save as Home when Home is removed", () => {
    const state = createInitialState(7);
    const oldSave = { ...state, ships: state.ships.map(({ homeStationId: _old, ...ship }) => ship) };

    const ship = removeStation(oldSave, 0).ships[0]!;
    expect(ship).toMatchObject({ homeStationId: null, defaultBehaviour: "none", state: "holding" });
  });

  it("lets the player assign a selected ship to an existing station", () => {
    const state = placeStation(createInitialState(7), 0, { x: 900, y: 900 });
    const shipId = state.ships[0]!.id;

    expect(setShipHome(state, [shipId], 1).ships[0]!.homeStationId).toBe(1);
    expect(setShipHome(state, [shipId], 99)).toBe(state);
  });

  it("clears home when its station is removed", () => {
    const state = placeStation(createInitialState(7), 0, { x: 900, y: 900 });
    const assigned = setShipHome(state, [state.ships[0]!.id], 1);

    const ship = removeStation(assigned, 1).ships[0]!;
    expect(ship.homeStationId).toBeNull();
    expect(ship.defaultBehaviour).toBe("none");
    expect(ship.state).toBe("holding");
  });
});
