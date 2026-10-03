import { describe, expect, it } from "vitest";
import { createInitialState, type SimState, type Ship, type HaulRoute, type DefaultBehaviour, type Material, type HaulStationId } from "sim";
import { applyHaulRouteFieldChange } from "./panels";
import { selectionPanel } from "./selection";

function baseShip(initial: SimState, overrides: Partial<Ship> = {}): Ship {
  return { ...initial.ships[0]!, ...overrides };
}

function makeHaulRoute(from: HaulStationId, to: HaulStationId, material: Material): HaulRoute {
  return { from, to, material };
}

describe("applyHaulRouteFieldChange (Slice B)", () => {
  function haulState(): SimState {
    const initial = createInitialState(7);
    return {
      ...initial,
      sectors: initial.sectors.map((sector, index) => ({ ...sector, name: index === 0 ? "Home" : index === 1 ? "Kessel" : sector.name })),
      claimSites: [
        { id: 3, sectorId: 1, position: { x: 100, y: 50 }, stage: 2, delivered: { Metal: 0, Ice: 0 }, timer: null as number | null },
        { id: 4, sectorId: 2, position: { x: 200, y: 50 }, stage: 2, delivered: { Metal: 0, Ice: 0 }, timer: null as number | null },
      ],
      station: { ...initial.station, inventory: { Metal: 100, Ice: 100 } },
      ships: [
        baseShip(initial, { id: 0, defaultBehaviour: "haul" as DefaultBehaviour, haulRoute: makeHaulRoute("home", "claim:3", "Ice") }),
        baseShip(initial, { id: 1, defaultBehaviour: "haul" as DefaultBehaviour, haulRoute: makeHaulRoute("home", "claim:4", "Metal") }),
      ],
    };
  }

  it("changing From on mixed selection updates From for all ships, preserves their To and Material (criterion 4, 5)", () => {
    let state = haulState();
    state = applyHaulRouteFieldChange(state, [0, 1], "from", "claim:4");
    expect(state.ships[0]!.haulRoute).toEqual({ from: "claim:4", to: "claim:3", material: "Ice" });
    expect(state.ships[1]!.haulRoute).toEqual({ from: "home", to: "claim:4", material: "Metal" });
  });

  it("changing To on mixed selection updates To for all ships, preserves their From and Material (criterion 4, 5)", () => {
    let state = haulState();
    state = applyHaulRouteFieldChange(state, [0, 1], "to", "claim:3");
    expect(state.ships[0]!.haulRoute).toEqual({ from: "home", to: "claim:3", material: "Ice" });
    expect(state.ships[1]!.haulRoute).toEqual({ from: "home", to: "claim:3", material: "Metal" });
  });

  it("changing Material on mixed selection updates Material for all ships, preserves their From and To (criterion 4, 5)", () => {
    let state = haulState();
    state = applyHaulRouteFieldChange(state, [0, 1], "material", "Metal");
    expect(state.ships[0]!.haulRoute).toEqual({ from: "home", to: "claim:3", material: "Metal" });
    expect(state.ships[1]!.haulRoute).toEqual({ from: "home", to: "claim:4", material: "Metal" });
  });

  it("rejects change that would give a ship same From and To (criterion 7)", () => {
    let state = haulState();
    state = applyHaulRouteFieldChange(state, [0, 1], "to", "home");
    expect(state.ships[0]!.haulRoute).toEqual({ from: "home", to: "claim:3", material: "Ice" });
    expect(state.ships[1]!.haulRoute).toEqual({ from: "home", to: "claim:4", material: "Metal" });
  });

  it("after a valid mixed change, the dropdown no longer shows Mixed for that field", () => {
    let state = haulState();
    state = applyHaulRouteFieldChange(state, [0, 1], "material", "Metal");
    const panel = selectionPanel(state, [0, 1]);
    expect(panel?.haulRoute?.material).toBe("Metal");
    expect(panel?.haulRoute?.material).not.toBe("mixed");
    expect(panel?.haulRoute?.from).toBe("home");
    expect(panel?.haulRoute?.to).toBe("mixed");
  });

  it("handles single ship selection (non-mixed) correctly", () => {
    let state = haulState();
    state = applyHaulRouteFieldChange(state, [0], "from", "claim:4");
    expect(state.ships[0]!.haulRoute).toEqual({ from: "claim:4", to: "claim:3", material: "Ice" });
    expect(state.ships[1]!.haulRoute).toEqual({ from: "home", to: "claim:4", material: "Metal" });
  });

  it("does nothing when selected ship has no haul route", () => {
    const initial = createInitialState(7);
    const state: SimState = {
      ...initial,
      sectors: initial.sectors.map((sector, index) => ({ ...sector, name: index === 0 ? "Home" : index === 1 ? "Kessel" : sector.name })),
      claimSites: [
        { id: 3, sectorId: 1, position: { x: 100, y: 50 }, stage: 2, delivered: { Metal: 0, Ice: 0 }, timer: null as number | null },
      ],
      ships: [
        baseShip(initial, { id: 0, defaultBehaviour: "mine" as DefaultBehaviour, haulRoute: undefined }),
        baseShip(initial, { id: 1, defaultBehaviour: "haul" as DefaultBehaviour, haulRoute: makeHaulRoute("home", "claim:3", "Ice") }),
      ],
    };
    let nextState = applyHaulRouteFieldChange(state, [0, 1], "from", "claim:3");
    expect(nextState.ships[0]!.haulRoute).toBeUndefined();
    expect(nextState.ships[1]!.haulRoute).toEqual({ from: "home", to: "claim:3", material: "Ice" });
  });
});