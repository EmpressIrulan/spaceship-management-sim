import { describe, expect, it, vi } from "vitest";
import { separateTraffic } from "./movement";
import { shipSize } from "./ship";
import type { Bug, Ship, StationModule } from "./model";

const ship = (id: number, x: number, y: number): Ship => ({
  id, design: { width: 2, height: 2, slots: ["Engine", "Engine", "Engine", "Engine"] },
  state: "moving", sectorId: 0, position: { x, y }, timer: 1, cargo: 0, cargoMaterial: null,
  target: null, defaultBehaviour: "none", mineMaterials: [], order: null, leg: { from: { x, y }, to: { x: x + 100, y } }, berth: null, transfer: null,
});

const bug = (id: number, x: number, y: number): Bug => ({
  id, hiveId: 0, sectorId: 0, position: { x, y }, design: { width: 1, height: 1, slots: ["Gun"] },
  loiterRng: id, hp: 1, maxHp: 1, state: "hunting", targetShipId: null, targetModule: null,
  leg: { from: { x, y }, to: { x: x + 100, y } }, timer: 1,
});

describe("shared traffic separation", () => {
  it("does not recompute body sizes for every nearby pair", () => {
    const ships = Array.from({ length: 64 }, (_, id) => ship(id, id * 4, 0));
    const hypot = vi.spyOn(Math, "hypot");
    try {
      separateTraffic(ships, [], []);
      expect(hypot.mock.calls.length).toBeLessThanOrEqual(ships.length * 2);
    } finally {
      hypot.mockRestore();
    }
  });

  it("separates moving ships from other ships and bugs", () => {
    const ships = [ship(1, 0, 0), ship(2, 0, 0)];
    const bugs = [bug(1, 0, 0)];
    const result = separateTraffic(ships, bugs, [], []);
    const distance = (a: { position: { x: number; y: number } }, b: { position: { x: number; y: number } }) =>
      Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
    expect(distance(result.ships[0]!, result.ships[1]!)).toBeGreaterThan(1);
    expect(distance(result.ships[0]!, result.bugs[0]!)).toBeGreaterThan(1);
    expect(distance(result.ships[1]!, result.bugs[0]!)).toBeGreaterThan(1);
  });

  it.each([2, 20])("leaves distant traffic and other sectors alone with %i bodies", (count) => {
    const ships = Array.from({ length: count }, (_, id) => ship(id, id * 100, 0));
    ships[1] = { ...ship(1, 0, 0), sectorId: 1 };
    const result = separateTraffic(ships, [], []);
    expect(result.ships).toEqual(ships);
    expect(result.ships.every((item, index) => item === ships[index])).toBe(true);
  });

  it("steers moving traffic away from station module footprints", () => {
    const modules: StationModule[] = [{ type: "Storage", position: { x: 0, y: 0 }, size: { width: 20, height: 20 } }];
    const result = separateTraffic([ship(1, 0, 0)], [], modules, []);
    expect(Math.abs(result.ships[0]!.position.x) >= 10 || Math.abs(result.ships[0]!.position.y) >= 10).toBe(true);
  });

  it("nudges a packed group of ships apart instead of leaving them stacked", () => {
    const ships = [ship(1, 0, 0), ship(2, 0, 0), ship(3, 0, 0)];
    const result = separateTraffic(ships, [], [], []);
    const positions = result.ships.map(({ position }) => `${position.x},${position.y}`);
    expect(new Set(positions).size).toBe(ships.length);
    expect(result.ships.every(({ position }) => Math.hypot(position.x, position.y) > 0)).toBe(true);
    for (let i = 0; i < result.ships.length; i += 1) for (let j = i + 1; j < result.ships.length; j += 1) {
      const a = result.ships[i]!.position; const b = result.ships[j]!.position;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(Math.hypot(shipSize(ships[0]!.design).width, shipSize(ships[0]!.design).height) - 1e-9);
    }
  });

  it.each(["docked", "working", "unloading"] as const)("keeps a %s ship in place while moving traffic separates", (state) => {
    const parked = { ...ship(9, 0, 0), state, leg: null } as Ship;
    const result = separateTraffic([parked, ship(10, 0, 0)], [], [], []);
    expect(result.ships[0]!.position).toEqual({ x: 0, y: 0 });
    expect(result.ships[1]!.position).not.toEqual({ x: 0, y: 0 });
  });
});
