import { describe, expect, it } from "vitest";
import { createInitialState, DOCK_SIZE, DOCK_CAPACITY, tick, setShipHome, shipHomeRefusal, type ShipDesign } from "./index";
import { berthLayout, toBerth, arrived } from "./state";

const design = (width: number, height: number): ShipDesign => ({ width, height, slots: Array(width * height).fill("Engine") });
function pack(width: number, height: number, count: number, docks = 1) {
  const state = createInitialState(7);
  const station = state.stations[0]!;
  station.dock.capacity = 96 * docks;
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
  it("is eight by twelve ship pixels, with 96 of room", () => {
    expect(DOCK_SIZE).toEqual({ width: 18, height: 27 });
    expect(DOCK_CAPACITY).toBe(96);
  });
  it.each([[4, 4, 6], [2, 4, 12], [8, 12, 1]])("packs %i by %i ships to capacity %i without overlap", (width, height, count) => {
    const { ships, station } = pack(width, height, count + 1);
    expect(ships).toHaveLength(count);
    for (const ship of ships) {
      expect(Math.abs(ship.position.x - station.dock.position.x) + width * 2.25 / 2).toBeLessThanOrEqual(9);
      expect(Math.abs(ship.position.y - station.dock.position.y) + height * 2.25 / 2).toBeLessThanOrEqual(13.5);
      for (const other of ships.filter((other) => other.id !== ship.id)) {
        expect(Math.abs(ship.position.x - other.position.x) >= width * 2.25 || Math.abs(ship.position.y - other.position.y) >= height * 2.25).toBe(true);
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
    expect(pack(4, 4, 13, 2).ships).toHaveLength(12);
    expect(pack(8, 12, 3, 2).ships).toHaveLength(2);
  });
  it("does not consume another station's or sector's room", () => {
    const { station, ships, state } = pack(4, 4, 6);
    const elsewhere = ships.map((ship) => ({ ...ship, position: { x: ship.position.x + 300, y: ship.position.y } }));
    expect(toBerth(berthLayout(station), elsewhere, { ...state.ships[0]!, id: 20 })).not.toBeNull();
    const otherSector = ships.map((ship) => ({ ...ship, sectorId: 1 }));
    expect(toBerth(berthLayout(station), otherSector, { ...state.ships[0]!, id: 20 })).not.toBeNull();
  });
  it.each([[9, 12], [9, 4], [4, 13]])("refuses %ix%i even when its area alone might fit, preserving home", (width, height) => {
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
