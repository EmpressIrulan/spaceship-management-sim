import { describe, expect, it } from "vitest";
import { createInitialState, tick, type GateProject, type Ship, type ShipDesign, type SimState, type Station } from "sim";
import { hoveredBody, worldToScreen, type Camera } from "./camera";
import { infoBox } from "./labels";
import { MODULE_COLORS, spritePixels, shipPanel } from "./ships";

const viewport = { width: 800, height: 600 };
const camera: Camera = { center: { x: 0, y: 0 }, zoom: 1 };

const noLaser: ShipDesign = { width: 2, height: 1, slots: ["Engine", "Storage"] };
const big: ShipDesign = { width: 6, height: 6, slots: Array(36).fill("Hull") };

describe("ship module palette", () => {
  it("has distinct colours for the shield modules", () => {
    expect(MODULE_COLORS.Capacitor).toBeDefined();
    expect(MODULE_COLORS.Generator).toBeDefined();
    expect(MODULE_COLORS.Capacitor).not.toBe(MODULE_COLORS.Generator);
  });
});

function withShips(ships: Partial<Ship>[], station: Partial<Station> = {}): SimState {
  const state = createInitialState(7);
  const base = state.ships[0]!;
  return {
    ...state,
    stations: [{ ...state.stations[0]!, ...station }],
    ships: ships.map((ship, id) => ({ ...base, id, ...ship })),
    nextShipId: ships.length,
  };
}

describe("hovering a ship shows its state", () => {
  it.each<[Partial<Ship>, string]>([
    [{ state: "outbound", cargoMaterial: "Metal" }, "Flying out to mine Metal"],
    [{ state: "working", cargoMaterial: "Ice" }, "Mining Ice"],
    [{ state: "homebound", cargo: 20, cargoMaterial: "Ice" }, "Flying home with 20 Ice"],
    [{ state: "unloading", cargo: 5, cargoMaterial: "Ice" }, "Unloading"],
    [{ state: "idle", design: noLaser, target: null }, "Idle: no laser"],
  ])("%o reads %s", (ship, line) => {
    expect(infoBox(withShips([ship]), { kind: "ship", index: 0 })).toEqual({ title: "Ship", line });
  });

  it("tells a ship waiting for a berth apart from one waiting for room", () => {
    const home = { state: "homebound" as const, timer: 0, cargo: 20, cargoMaterial: "Metal" as const };
    const fleet = withShips(Array.from({ length: 7 }, () => home), {
      storage: { ...createInitialState(7).stations[0]!.storage, capacity: 1000 },
    });
    const arrived = tick(tick(fleet, 0), 8);
    const index = arrived.ships.findIndex((ship) => ship.state === "waiting");

    expect(infoBox(arrived, { kind: "ship", index })?.line).toBe("Waiting: dock busy");
  });

  it("shows live gate loading and unloading counts ahead of the standing order", () => {
    const ordered = { kind: "haulGate" as const, gateId: 0 };
    expect(infoBox(withShips([{ state: "loading" as Ship["state"], cargo: 12, cargoMaterial: "Metal", order: ordered }]),
      { kind: "ship", index: 0 })?.line).toBe("Loading 12/20");
    expect(infoBox(withShips([{ state: "gateUnloading" as Ship["state"], cargo: 12, cargoMaterial: "Metal", order: ordered,
      transfer: { startingCargo: 20, amount: 20 } }]), { kind: "ship", index: 0 })?.line).toBe("Unloading 8/20");
    expect(infoBox(withShips([{ state: "waiting", cargo: 0, cargoMaterial: "Metal", order: ordered }]),
      { kind: "ship", index: 0 })?.line).toBe("Waiting: dock busy");
  });

  it("shows transfer progress against the amount for partial loads and unloads", () => {
    const ordered = { kind: "haulGate" as const, gateId: 0 };
    expect(infoBox(withShips([{ state: "loading", cargo: 3, cargoMaterial: "Metal", order: ordered,
      transfer: { startingCargo: 0, amount: 8 } }]), { kind: "ship", index: 0 })?.line).toBe("Loading 3/8");
    expect(infoBox(withShips([{ state: "gateUnloading", cargo: 2, cargoMaterial: "Metal", order: ordered,
      transfer: { startingCargo: 6, amount: 6 } }]), { kind: "ship", index: 0 })?.line).toBe("Unloading 4/6");
  });

  it("can hover a ship sitting idle at the Dock", () => {
    const state = tick(withShips([{ state: "idle", design: noLaser, target: null }]), 0);
    const pointer = worldToScreen(camera, viewport, state.stations[0]!.dock.position);
    expect(hoveredBody(state, camera, viewport, pointer)).toEqual({ kind: "ship", index: 0 });
  });

  it("lets a ship at the Dock win over the station underneath it", () => {
    const state = withShips([{ state: "unloading", position: { ...createInitialState(7).stations[0]!.dock.position } }]);
    const pointer = worldToScreen(camera, viewport, state.stations[0]!.dock.position);

    expect(hoveredBody(state, camera, viewport, pointer)).toEqual({ kind: "ship", index: 0 });
  });

  it.each([1, 0.5, 0.2])("picks out each ship when nine crowd the Dock, at zoom %s", (zoom) => {
    const home = { state: "homebound" as const, timer: 0, cargo: 20, cargoMaterial: "Metal" as const };
    const fleet = withShips(Array.from({ length: 9 }, () => home), {
      storage: { ...createInitialState(7).stations[0]!.storage, capacity: 1000 },
    });
    // Long enough for every ship to reach a pad or a parking spot.
    const settled = tick(tick(fleet, 0), 8);
    const zoomed: Camera = { center: { x: 0, y: 0 }, zoom };

    expect(settled.ships.filter((ship) => ship.state === "unloading")).toHaveLength(6);
    expect(settled.ships.filter((ship) => ship.state === "waiting")).toHaveLength(3);
    settled.ships.forEach((ship, index) => {
      const pointer = worldToScreen(zoomed, viewport, ship.position);
      expect(hoveredBody(settled, zoomed, viewport, pointer)).toEqual({ kind: "ship", index });
    });
  });

  it("reads a ship flying to its pad as docking, and one flying to park as waiting", () => {
    const home = { state: "homebound" as const, timer: 0, cargo: 10, cargoMaterial: "Metal" as const };
    const fleet = withShips(Array.from({ length: 7 }, () => home), {
      storage: { ...createInitialState(7).stations[0]!.storage, capacity: 1000 },
    });
    const arrived = tick(fleet, 0);
    const lines = arrived.ships.map((_, index) => infoBox(arrived, { kind: "ship", index })?.line);

    expect(lines.slice(0, 6)).toEqual(Array(6).fill("Docking"));
    expect(lines[6]).toBe("Waiting: dock busy");
  });

  it("keeps a ship selectable during its outbound transition from the Dock", () => {
    const state = createInitialState(7);
    const pointer = worldToScreen(camera, viewport, state.stations[0]!.dock.position);

    expect(hoveredBody(state, camera, viewport, pointer)).toEqual({ kind: "ship", index: 0 });
  });

  it("lets a ship at a gate win over the gate underneath it", () => {
    const position = { x: 80, y: 0 };
    const state = {
      ...withShips([{ state: "gateHauling", position }]),
      gateProjects: [{
        id: 0,
        ends: [{ sectorId: 0, position }, { sectorId: 1, position: { x: 200, y: 0 } }],
        delivered: { Metal: 0, Ice: 0 },
        complete: false,
      } as GateProject],
    };
    const pointer = worldToScreen(camera, viewport, position);

    expect(hoveredBody(state, camera, viewport, pointer)).toEqual({ kind: "ship", index: 0 });
  });

  it("lets a ship at the other gate end win when viewing that sector", () => {
    const position = { x: 200, y: 0 };
    const state = {
      ...withShips([{ state: "gateHauling", sectorId: 1, position }]),
      gateProjects: [{
        id: 0,
        ends: [{ sectorId: 0, position: { x: 80, y: 0 } }, { sectorId: 1, position }],
        delivered: { Metal: 0, Ice: 0 },
        complete: false,
      } as GateProject],
    };
    const pointer = worldToScreen(camera, viewport, position);

    expect(hoveredBody(state, camera, viewport, pointer, 1)).toEqual({ kind: "ship", index: 0 });
  });
});

describe("ships drawn from their pixels", () => {
  it("colours each painted pixel by its module and leaves the empty ones clear", () => {
    const pixels = spritePixels({ width: 3, height: 1, slots: ["Engine", null, "Hull"] });
    expect([...pixels]).toEqual([0xf9, 0x73, 0x16, 255, 0, 0, 0, 0, 0x47, 0x55, 0x69, 255]);
  });

  it("paints the Gun a colour no other part wears", () => {
    const colours = Object.values(MODULE_COLORS);
    expect(new Set(colours).size).toBe(colours.length);
    const pixels = spritePixels({ width: 1, height: 1, slots: ["Gun"] });
    expect([...pixels]).toEqual([0xfa, 0xcc, 0x15, 255]);
  });

  it("makes a 6x6 pixel ship's hover area bigger than the starting ship's", () => {
    const state = withShips([
      { state: "outbound", position: { x: 100, y: 100 } },
      { state: "outbound", design: big, position: { x: -100, y: 100 } },
    ]);
    const edge = (x: number) => hoveredBody(state, camera, viewport, worldToScreen(camera, viewport, { x, y: 100 }));
    // 5.5 units off centre is outside the 9-wide starting ship and inside a 13.5-wide 6x6.
    expect(edge(100 + 5.5)).toBeNull();
    expect(edge(-100 + 5.5)).toEqual({ kind: "ship", index: 1 });
  });
});

describe("the selected ship's panel", () => {
  it("shows size, grid, speed, hold, mining time, cargo and state", () => {
    const state = withShips([{ state: "working", cargo: 12, cargoMaterial: "Metal" }]);
    expect(shipPanel(state, 0)).toEqual({
      size: "4x4",
      design: state.ships[0]!.design,
      rows: [
        ["Speed", "25"],
        ["Hold", "20"],
        ["Mining time", "24 s"],
        ["Cargo", "12/20 Metal"],
        ["State", "Mining Metal"],
      ],
    });
  });

  it("follows the ship live and closes if it is gone", () => {
    const start = withShips([{ state: "working", timer: 24, cargo: 0, cargoMaterial: "Metal" }]);
    const later = tick(start, 5);
    expect(shipPanel(later, 0)!.rows).not.toEqual(shipPanel(start, 0)!.rows);
    expect(shipPanel(start, 9)).toBeNull();
  });

  it("lists each material in a mixed hold before the capacity", () => {
    const state = withShips([{ state: "homebound", cargo: 14, cargoMaterial: "Ice",
      cargoByMaterial: { Metal: 6, Ice: 8 } }]);
    expect(shipPanel(state, 0)!.rows).toContainEqual(["Cargo", "Metal 6, Ice 8 / 20"]);
    expect(shipPanel(state, 0)!.rows).toContainEqual(["State", "Flying home with 6 Metal, 8 Ice"]);
  });
});
