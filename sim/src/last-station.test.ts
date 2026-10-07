import { describe, expect, it } from "vitest";
import {
  availableModuleBuildSites,
  createInitialState,
  giveOrder,
  haulStations,
  placeStation,
  removeStation,
  startModuleBuild,
  tick,
  type SimState,
} from "./index";

function withoutLastStation(): SimState {
  const initial = createInitialState(7);
  const assigned = { ...initial, ships: initial.ships.map((ship) => ({ ...ship, homeStationId: 0 })) };
  return removeStation(assigned, 0);
}

describe("running without a station", () => {
  it("keeps ticking and allows orders and haul choices after Home is removed", () => {
    const empty = withoutLastStation();

    expect(empty.stations).toEqual([]);
    expect(empty.ships[0]).toMatchObject({ state: "holding", homeStationId: null, defaultBehaviour: "none" });
    expect(() => tick(empty, 1)).not.toThrow();
    expect(giveOrder(empty, [0], { kind: "move", point: { x: 50, y: 50 }, sectorId: 0 })).toEqual(empty);
    expect(haulStations(empty)).toEqual([]);
  });

  it("can place a replacement site and build its Dock without restoring Home", () => {
    const empty = withoutLastStation();
    const placed = placeStation(empty, 1, { x: 900, y: 900 });
    const station = placed.stations.find((candidate) => candidate.id === 1)!;
    const stocked: SimState = {
      ...placed,
      stations: placed.stations.map((candidate) => candidate.id === station.id
        ? { ...candidate, constructionSite: { ...candidate.constructionSite, inventory: { Metal: 25, Ice: 25 } } }
        : candidate),
    };
    const built = startModuleBuild(stocked, station.id, "Dock", availableModuleBuildSites(stocked, station.id)[0]!);

    expect(built.stations).toHaveLength(1);
    expect(built.stations[0]!.id).toBe(1);
    expect(built.stations[0]!.construction).toMatchObject({ type: "Dock" });
  });
});
