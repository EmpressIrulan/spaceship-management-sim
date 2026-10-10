import { describe, expect, it } from "vitest";
import { createInitialState, HOME_SECTOR, type Ship, type SimState } from "sim";
import { shipStatus } from "./ships";
import { selectionPanel } from "./selection";

function withShips(ships: Partial<Ship>[], changes: Partial<SimState> = {}): SimState {
  const state = createInitialState(7);
  const base = state.ships[0]!;
  return { ...state, ...changes, ships: ships.map((ship, id) => ({ ...base, id, ...ship })) };
}

function withoutIce(state: SimState): SimState {
  return { ...state, asteroids: state.asteroids.filter((rock) => rock.sectorId !== HOME_SECTOR || rock.material !== "Ice") };
}

const status = (state: SimState) => shipStatus(state, state.ships[0]!);

function withSupplyQueue(state: SimState): SimState {
  const station = state.stations[0]!;
  return { ...state, stations: [{ ...station, buildQueue: [station.modules[0]!] }, ...state.stations.slice(1)] };
}

describe("a miner's status names the materials ticked for it", () => {
  it("reads Idle when nothing is ticked", () => {
    expect(status(withShips([{ state: "idle", mineMaterials: [] }]))).toBe("Idle");
  });

  it("reads Mining Ice with Ice ticked, and plain Mining with everything ticked", () => {
    expect(status(withShips([{ state: "working", cargoMaterial: "Ice", mineMaterials: ["Ice"] }]))).toBe("Mining Ice");
    expect(status(withShips([{ state: "working", cargoMaterial: "Ice", mineMaterials: ["Metal", "Ice"] }]))).toBe("Mining");
  });

  it("reads Waiting: no Ice when Ice is ticked and the home sector has none", () => {
    const state = withoutIce(withShips([{ state: "idle", mineMaterials: ["Ice"] }]));
    expect(status(state)).toBe("Waiting: no Ice");
  });

  it("does not wait while a ticked material is still available", () => {
    const state = withoutIce(withShips([{ state: "idle", mineMaterials: ["Metal", "Ice"] }]));
    expect(status(state)).toBe("Idle");
  });

  it("waits when ticked rocks are in another sector but cross-sector mining is off", () => {
    const initial = createInitialState(7);
    const state = withShips([{ state: "idle", sectorId: 1, mineMaterials: ["Metal"], mineOtherSectors: false }], {
      asteroids: initial.asteroids.filter((rock) => rock.sectorId === HOME_SECTOR && rock.material === "Metal"),
    });
    expect(status(state)).toBe("Waiting: no Metal");
  });

  it("waits when an other-sector ticked rock has no reachable gate", () => {
    const initial = createInitialState(7);
    const state = withShips([{ state: "idle", mineMaterials: ["Metal"], mineOtherSectors: true }], {
      asteroids: initial.asteroids.filter((rock) => rock.sectorId === 2 && rock.material === "Metal"),
    });
    expect(status(state)).toBe("Waiting: no Metal");
  });

  it("keeps showing the order while a ship follows one", () => {
    const state = withShips([{ state: "working", mineMaterials: ["Ice"], order: { kind: "mine", asteroidId: 0, loaded: false } }]);
    expect(status(state)).toBe("Order: mine");
  });
});

describe("a supply ship's status names its site materials", () => {
  it("reads Idle when no materials are ticked", () => {
    expect(status(withSupplyQueue(withShips([{ defaultBehaviour: "supply", state: "idle", mineMaterials: [] }])))).toBe("Idle");
  });

  it("reads Supplying site with one or both materials", () => {
    expect(status(withSupplyQueue(withShips([{ defaultBehaviour: "supply", state: "working", mineMaterials: ["Ice"] }])))).toBe("Supplying site: Ice");
    expect(status(withSupplyQueue(withShips([{ defaultBehaviour: "supply", state: "working", mineMaterials: ["Metal", "Ice"] }])))).toBe("Supplying site: Metal, Ice");
  });

  it("reads Waiting: no Ice at the Dock and resumes the supplying text when Ice returns", () => {
    const barren = withSupplyQueue(withoutIce(withShips([{ defaultBehaviour: "supply", state: "idle", mineMaterials: ["Ice"] }])));
    expect(status(barren)).toBe("Waiting: no Ice");
    const supplied = { ...barren, asteroids: createInitialState(7).asteroids };
    expect(status(supplied)).toBe("Supplying site: Ice");
  });
});

describe("the selection panel's material dropdown", () => {
  it("selects Ice when only Ice is enabled", () => {
    const panel = selectionPanel(withShips([{ mineMaterials: ["Ice"] }]), [0])!;
    expect(panel.materials).toBe("Ice");
  });

  it("shows Mixed when selected ships disagree on their material choice", () => {
    const panel = selectionPanel(withShips([{ mineMaterials: ["Ice"] }, { mineMaterials: ["Metal", "Ice"] }]), [0, 1])!;
    expect(panel.materials).toBe("mixed");
  });

  it("selects Metal and Ice for a supply ship with both materials", () => {
    const panel = selectionPanel(withShips([{ defaultBehaviour: "supply", mineMaterials: ["Metal", "Ice"] }]), [0])!;
    expect(panel.materials).toBe("both");
  });

  it("shows Mixed for a ship with no materials, and nothing unless every selected ship is Mine or Supply", () => {
    expect(selectionPanel(withShips([{ mineMaterials: [] }]), [0])!.materials).toBe("mixed");
    expect(selectionPanel(withShips([{ defaultBehaviour: "none" }]), [0])!.materials).toBeNull();
    expect(selectionPanel(withShips([{}, { defaultBehaviour: "none" }]), [0, 1])!.materials).toBeNull();
  });

  it("writes each ship's own status in its row", () => {
    const state = withShips([{ state: "working", cargoMaterial: "Ice", mineMaterials: ["Ice"] }, { state: "idle", mineMaterials: [] }]);
    expect(selectionPanel(state, [0, 1])!.rows.map((row) => row.status)).toEqual(["Mining Ice", "Idle"]);
  });
});
