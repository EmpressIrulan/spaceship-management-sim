import { describe, expect, it } from "vitest";
import { separateTraffic } from "./movement";
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

  it("steers moving traffic away from station module footprints", () => {
    const modules: StationModule[] = [{ type: "Storage", position: { x: 0, y: 0 }, size: { width: 20, height: 20 } }];
    const result = separateTraffic([ship(1, 0, 0)], [], modules, []);
    expect(Math.abs(result.ships[0]!.position.x) >= 10 || Math.abs(result.ships[0]!.position.y) >= 10).toBe(true);
  });
});
