import { describe, expect, it } from "vitest";
import { createInitialState, tick, type GateProject, type Ship, type ShipDesign, type SimState } from "sim";
import { hoveredBody, worldToScreen, type Camera } from "./camera";
import { infoBox } from "./labels";
import { spritePixels, shipPanel } from "./ships";

const viewport = { width: 800, height: 600 };
const camera: Camera = { center: { x: 0, y: 0 }, zoom: 1 };

const noLaser: ShipDesign = { width: 2, height: 1, slots: ["Engine", "Storage"] };
const big: ShipDesign = { width: 6, height: 6, slots: Array(36).fill("Hull") };

function withShips(ships: Partial<Ship>[], station: Partial<SimState["station"]> = {}): SimState {
  const state = createInitialState(7);
  const base = state.ships[0]!;
  return {
    ...state,
    station: { ...state.station, ...station },
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
      storage: { ...createInitialState(7).station.storage, capacity: 1000 },
    });
    const arrived = tick(fleet, 0);
    const index = arrived.ships.findIndex((ship) => ship.state === "waiting");

    expect(infoBox(arrived, { kind: "ship", index })?.line).toBe("Waiting: dock busy");
  });

  it("can hover a ship sitting idle at the Dock", () => {
    const state = tick(withShips([{ state: "idle", design: noLaser, target: null }]), 0);
    const pointer = worldToScreen(camera, viewport, state.station.dock.position);
    expect(hoveredBody(state, camera, viewport, pointer)).toEqual({ kind: "ship", index: 0 });
  });

  it("lets a ship at the Dock win over the station underneath it", () => {
    const state = withShips([{ state: "unloading", position: { ...createInitialState(7).station.dock.position } }]);
    const pointer = worldToScreen(camera, viewport, state.station.dock.position);

    expect(hoveredBody(state, camera, viewport, pointer)).toEqual({ kind: "ship", index: 0 });
  });

  it("keeps a ship selectable during its outbound transition from the Dock", () => {
    const state = createInitialState(7);
    const pointer = worldToScreen(camera, viewport, state.station.dock.position);

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
});
