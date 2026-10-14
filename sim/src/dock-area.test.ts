import { describe, expect, it } from "vitest";
import { createInitialState, DOCK_SIZE, DOCK_CAPACITY, MODULE_SPACING, PIXEL_SIZE, queueModuleBuild, tick, setShipHome, shipHomeRefusal, startModuleBuild, validDockDimensions, type ShipDesign } from "./index";
import { berthLayout, toBerth, arrived } from "./state";

const design = (width: number, height: number): ShipDesign => ({ width, height, slots: Array(width * height).fill("Engine") });
function pack(width: number, height: number, count: number, docks = 1) {
  const state = createInitialState(7);
  const station = state.stations[0]!;
  station.dock.capacity = DOCK_CAPACITY * docks;
  for (let i = 1; i < docks; i++) station.modules.push({ type: "Dock", position: { x: station.dock.position.x - i * 40, y: station.dock.position.y }, size: DOCK_SIZE });
  const ships = [] as typeof state.ships;
  for (let id = 0; id < count; id++) {
    const ship = { ...state.ships[0]!, id, design: design(width, height), cargo: 20 };
    const flying = toBerth(berthLayout(station), ships, ship);
    if (flying) ships.push(arrived(flying));
  }
  return { state, station, ships };
}

describe("Dock pixel area", () => {
  it("names Ship 3 using the same numbering as the ship panel", () => {
    const state = createInitialState(7);
    state.ships[0] = { ...state.ships[0]!, id: 2, design: design(9, 12) };
    expect(shipHomeRefusal(state, [2], 0)).toBe("Ship 3 is too big for this Dock");
  });
  it("starts Home with a ten by ten Dock", () => {
    expect(DOCK_SIZE).toEqual({ width: 7.5, height: 7.5 });
    expect(DOCK_CAPACITY).toBe(100);
    expect(createInitialState(7).stations[0]!.dock.size).toEqual(DOCK_SIZE);
    expect(createInitialState(7).stations[0]!.modules[0]).toMatchObject({ type: "Dock", width: 10, height: 10 });
  });
  it("stores custom dimensions on each Dock and charges one of each material per pixel", () => {
    const state = createInitialState(7);
    state.stations[0]!.constructionSite.inventory = { Metal: 16, Ice: 16 };
    const built = startModuleBuild(state, 0, "Dock", { x: 2 * MODULE_SPACING, y: 0 }, { width: 4, height: 4 });
    expect(built.stations[0]!.construction).toMatchObject({ type: "Dock", width: 4, height: 4 });
    expect(built.stations[0]!.constructionSite.inventory).toEqual({ Metal: 0, Ice: 0 });
    expect(validDockDimensions({ width: 4, height: 4 })).toBe(true);
    expect(validDockDimensions({ width: 101, height: 4 })).toBe(true);
    expect(validDockDimensions({ width: 3, height: 10 })).toBe(false);
    expect(startModuleBuild(state, 0, "Dock", { x: 2 * MODULE_SPACING, y: 0 }, { width: 3, height: 10 })).toBe(state);
  });
  it("keeps custom dimensions and area through the build queue", () => {
    const state = createInitialState(7);
    state.stations[0]!.constructionSite.inventory = { Metal: 20, Ice: 20 };
    const queued = queueModuleBuild(state, "Dock", { x: 2 * MODULE_SPACING, y: 0 }, { width: 4, height: 5 });
    expect(queued.stations[0]!.construction).toMatchObject({ type: "Dock", width: 4, height: 5 });
    expect(queued.stations[0]!.constructionSite.inventory).toEqual({ Metal: 0, Ice: 0 });
    const complete = tick(queued, 15);
    expect(complete.stations[0]!.modules.at(-1)).toMatchObject({ type: "Dock", width: 4, height: 5 });
    expect(complete.stations[0]!.dock.capacity).toBe(120);
  });
  it.each([[4, 4, 4], [2, 4, 10], [10, 10, 1]])("packs %i by %i ships to capacity %i without overlap", (width, height, count) => {
    const { ships, station } = pack(width, height, count + 1);
    expect(ships).toHaveLength(count);
    for (const ship of ships) {
      expect(Math.abs(ship.position.x - station.dock.position.x) + width * PIXEL_SIZE / 2).toBeLessThanOrEqual(DOCK_SIZE.width / 2);
      expect(Math.abs(ship.position.y - station.dock.position.y) + height * PIXEL_SIZE / 2).toBeLessThanOrEqual(DOCK_SIZE.height / 2);
      for (const other of ships.filter((other) => other.id !== ship.id)) {
        expect(Math.abs(ship.position.x - other.position.x) >= width * PIXEL_SIZE || Math.abs(ship.position.y - other.position.y) >= height * PIXEL_SIZE).toBe(true);
      }
    }
  });
  it("reserves approaching ships and reuses a freed rectangle", () => {
    const { station, ships, state } = pack(4, 4, 6);
    const seventh = { ...state.ships[0]!, id: 6 };
    expect(toBerth(berthLayout(station), ships, seventh)).toBeNull();
    const flying = toBerth(berthLayout(station), ships.slice(1), seventh)!;
    expect(flying.leg?.to).toEqual(ships[0]!.position);
    expect(toBerth(berthLayout(station), [...ships.slice(1), flying], { ...seventh, id: 7 })).toBeNull();
  });
  it("adds a separate packing region for every Dock", () => {
    expect(pack(4, 4, 9, 2).ships).toHaveLength(8);
    expect(pack(10, 10, 3, 2).ships).toHaveLength(2);
  });
  it("does not consume another station's or sector's room", () => {
    const { station, ships, state } = pack(4, 4, 6);
    const elsewhere = ships.map((ship) => ({ ...ship, position: { x: ship.position.x + 300, y: ship.position.y } }));
    expect(toBerth(berthLayout(station), elsewhere, { ...state.ships[0]!, id: 20 })).not.toBeNull();
    const otherSector = ships.map((ship) => ({ ...ship, sectorId: 1 }));
    expect(toBerth(berthLayout(station), otherSector, { ...state.ships[0]!, id: 20 })).not.toBeNull();
  });
  it.each([[11, 10], [10, 11], [11, 4]])("refuses %ix%i even when its area alone might fit, preserving home", (width, height) => {
    const state = createInitialState(7);
    state.ships[0] = { ...state.ships[0]!, id: 3, homeStationId: null, design: design(width, height) };
    expect(setShipHome(state, [3], 0)).toBe(state);
    expect(toBerth(berthLayout(state.stations[0]!), [], state.ships[0]!)).toBeNull();
  });
  it("keeps an oversized arrival outside", () => {
    const state = createInitialState(7);
    state.ships[0] = { ...state.ships[0]!, design: design(9, 12), state: "homebound", timer: 0, cargo: 20, cargoMaterial: "Metal" };
    expect(tick(state, 0).ships[0]!.berth).toBeNull();
  });
});
