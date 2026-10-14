import { describe, expect, it } from "vitest";
import { CONSTRUCTION_SITE_POSITION, CONSTRUCTION_SITE_SIZE, SIZE_MULTIPLIER, createInitialState, formation, removeStation } from "./index";
import { berthLayout, toParking } from "./state";
import { nearbyClearPosition } from "./station-building";

describe("station-local scale", () => {
  it("scales the build pad's footprint and offset with the station bodies", () => {
    expect(CONSTRUCTION_SITE_POSITION).toEqual({ x: 75 * SIZE_MULTIPLIER, y: -60 * SIZE_MULTIPLIER });
    expect(CONSTRUCTION_SITE_SIZE).toEqual({ width: 28 * SIZE_MULTIPLIER, height: 28 * SIZE_MULTIPLIER });
    const pad = createInitialState(7).stations[0]!.constructionSite;
    expect(pad.position).toEqual(CONSTRUCTION_SITE_POSITION);
    expect(pad.size).toEqual(CONSTRUCTION_SITE_SIZE);
  });

  it("relocates a blocked build pad in scaled half-slot steps", () => {
    const dock = createInitialState(7).stations[0]!.dock;
    expect(nearbyClearPosition(dock.position, [dock], [], 0))
      .toEqual({ x: -40 * SIZE_MULTIPLIER, y: -40 * SIZE_MULTIPLIER });
  });

  it("scales both the first parking arc and subsequent arc gaps", () => {
    const state = createInitialState(7), layout = berthLayout(state.stations[0]!);
    const parked: typeof state.ships = [];
    for (let id = 0; id < 13; id++) {
      const ship = toParking(layout, parked, { ...state.ships[0]!, id });
      const point = ship.leg!.to;
      expect(Math.hypot(point.x - layout.dock.x, point.y - layout.dock.y))
        .toBeCloseTo((70 + Math.floor(id / 6) * 22) * SIZE_MULTIPLIER);
      parked.push({ ...ship, position: point, state: "waiting", leg: null });
    }
    expect(new Set(parked.map(ship => `${ship.position.x},${ship.position.y}`)).size).toBe(13);
  });

  it("scales every formation ring while preserving slot counts", () => {
    const origin = { x: 100, y: -50 }, spots = formation(origin, 20);
    expect(spots).toHaveLength(20);
    expect(spots[0]).toEqual(origin);
    for (const [start, end, ring] of [[1, 7, 1], [7, 19, 2], [19, 20, 3]] as const) {
      for (const spot of spots.slice(start, end)) {
        expect(Math.hypot(spot.x - origin.x, spot.y - origin.y)).toBeCloseTo(ring * 27 * SIZE_MULTIPLIER);
      }
    }
  });

  it("releases a docked ship beside a removed station at a scaled hull offset", () => {
    const state = createInitialState(7), dock = state.stations[0]!.dock;
    state.ships[0] = { ...state.ships[0]!, state: "docked", position: dock.position };
    const ship = removeStation(state, 0).ships[0]!;
    expect(ship.position).toEqual({ x: dock.position.x + dock.size.width / 2 + 12 * SIZE_MULTIPLIER, y: dock.position.y });
    expect(ship.state).toBe("holding");
  });
});
