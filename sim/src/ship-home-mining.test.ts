import { describe, expect, it } from "vitest";
import { createInitialState } from "./state";
import { tick } from "./tick";
import { foundedStation } from "./test-ships";
import { placeStation } from "./station-placement";

function loadedShip(state: ReturnType<typeof createInitialState>, homeStationId: number) {
  const ship = state.ships[0]!;
  const station = state.stations.find((candidate) => candidate.id === homeStationId)!;
  return {
    ...state,
    stations: state.stations.map((candidate) => candidate.id === homeStationId ? station : candidate),
    ships: [{ ...ship, homeStationId, state: "homebound" as const, sectorId: station.sectorId,
      position: { ...station.dock.position }, leg: null, timer: 0, target: null,
      defaultBehaviour: "none" as const,
      cargo: 12, cargoMaterial: "Metal" as const, cargoByMaterial: { Metal: 12, Ice: 0 } }],
  };
}

describe("miners return cargo to their assigned home", () => {
  it("unloads into their home station's Storage", () => {
    const initial = createInitialState(17);
    const station = foundedStation(1, 0, 900, 900);
    const state = loadedShip({ ...initial, stations: [...initial.stations, station] }, 1);

    const result = tick(state, 30);

    expect(result.stations[1]!.inventory.Metal).toBe(12);
    expect(result.stations[0]!.inventory).toEqual(state.stations[0]!.inventory);
  });

  it("unloads into their home construction site before Storage is built", () => {
    const initial = placeStation(createInitialState(17), 0, { x: 900, y: 900 });
    const state = loadedShip(initial, 1);

    const result = tick(state, 30);


    expect(result.stations[1]!.constructionSite.inventory.Metal).toBe(12);
    expect(result.stations[0]!.inventory).toEqual(state.stations[0]!.inventory);
  });
});
