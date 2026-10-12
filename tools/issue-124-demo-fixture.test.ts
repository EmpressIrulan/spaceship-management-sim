import { describe, expect, it } from "vitest";
import { createInitialState, shipSize } from "sim";
import { createIssue124DemoState, measureIssue124Trip, TRAVEL_MINER } from "./issue-124-demo-fixture";

describe("issue 124 recording fixture", () => {
  it("keeps the new-game scene untouched and the system layout seeded", () => {
    expect(createIssue124DemoState(5)).toEqual(createInitialState(7));
    expect(createIssue124DemoState(1)).toEqual(createIssue124DemoState(1));
  });
  it("parks a visible ship inside a real berth", () => {
    const s = createIssue124DemoState(4), ship = s.ships[0]!, dock = s.stations[0]!.dock;
    const size = shipSize(ship.design);
    expect(ship.state).toBe("idle");
    expect(ship.berth).not.toBeNull();
    expect(Math.abs(ship.position.x - dock.position.x) + size.width / 2).toBeLessThanOrEqual(dock.size.width / 2);
    expect(Math.abs(ship.position.y - dock.position.y) + size.height / 2).toBeLessThanOrEqual(dock.size.height / 2);
  });
  it("keeps Home available to the renderer in every scene", () => {
    for (let scene = 1; scene <= 9; scene++) {
      expect(createIssue124DemoState(scene).stations[0]?.name).toBe("Home");
    }
  });
  it("measures a complete real mining delivery without inventing income", () => {
    const result = measureIssue124Trip();
    expect(result.seconds).toBeGreaterThan(100);
    expect(result.delivered).toBe(20);
    expect(result.income).toBeGreaterThan(0);
    expect(result.cruiseSpeed).toBe(25);
  });
  it("can demonstrate a travel-dominated miner without changing its cruise speed", () => {
    const result = measureIssue124Trip(TRAVEL_MINER);
    expect(result.delivered).toBe(2);
    expect(result.seconds).toBeGreaterThan(190);
    expect(result.seconds).toBeLessThan(210);
    expect(result.cruiseSpeed).toBe(25);
  });
});
