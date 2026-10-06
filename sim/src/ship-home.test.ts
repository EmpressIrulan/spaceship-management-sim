import { describe, expect, it } from "vitest";
import { createInitialState } from "./state";
import { setShipHome } from "./orders";
import { placeStation, removeStation } from "./station-placement";

describe("ship home stations", () => {
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
