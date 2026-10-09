import { describe, expect, it } from "vitest";
import { ONE_STORAGE, foundedStation, oneStorageStart, padHopSeconds } from "./test-ships";
import { shipSize } from "./ship";
const ONE_STORAGE_SIZE = shipSize(ONE_STORAGE);
import { tick } from "./tick";
import {
  CARGO_PER_TRIP,
  UNLOADING_SECONDS,
  WORKING_SECONDS,
  createInitialState,
  dockBerths,
  type SimState,
} from "./state";
import { travelSeconds } from "./motion";

function stored(state: SimState): number {
  return state.stations[0]!.inventory.Metal + state.stations[0]!.inventory.Ice;
}

describe("Dock and Storage", () => {
  it("ticks the existing Home-only game through the station list unchanged", () => {
    const state = createInitialState(7);

    const next = tick(state, 0);

    expect(state.stations).toHaveLength(1);
    expect(next.stations).toHaveLength(1);
    expect(next.stations[0]).toEqual(state.stations[0]);
  });

  it("starts with two separate station modules", () => {
    const state = oneStorageStart(7);

    expect(state.stations[0]!).toMatchObject({
      dock: { capacity: 96 },
      storage: { capacity: 1000 },
    });
    expect(state.stations[0]!.dock.position).not.toEqual(state.stations[0]!.storage.position);
  });

  it("gives a newly founded station one module of Storage", () => {
    const station = foundedStation(1, 1, 100, 50);
    expect(station.storage.capacity).toBe(1000);
  });

  it("returns the ship to the Dock to unload", () => {
    const state = oneStorageStart(7);
    const ship = state.ships[0]!;
    const leg = travelSeconds(
      Math.hypot(
        ship.target!.site.x - state.stations[0]!.dock.position.x,
        ship.target!.site.y - state.stations[0]!.dock.position.y,
      ),
    );

    const arrived = tick(state, 2 * leg + WORKING_SECONDS + padHopSeconds(state) + 0.01);

    expect(arrived.ships[0]!.state).toBe("unloading");
    expect(arrived.ships[0]!.position).toEqual(dockBerths(state.stations[0]!.dock.position)[0]);
  });

  it("keeps delivering past 100 and stops at 1000 stored, leaving the ship waiting with the rest", () => {
    const initial = oneStorageStart(7);
    const dock = initial.stations[0]!.dock.position;
    const pastOneHundred: SimState = {
      ...initial,
      stations: [{ ...initial.stations[0]!, inventory: { Metal: 90, Ice: 0 } }],
      ships: [{ ...initial.ships[0]!, state: "unloading", position: dock, timer: UNLOADING_SECONDS,
        cargo: 20, cargoMaterial: "Metal" }],
    };
    const delivered = tick(pastOneHundred, UNLOADING_SECONDS + 0.1);
    expect(stored(delivered)).toBeGreaterThan(100);

    const nearlyFull: SimState = {
      ...initial,
      stations: [{
        ...initial.stations[0]!,
        inventory: { Metal: 995, Ice: 0 },
      }],
      ships: [
        {
          ...initial.ships[0]!,
          state: "unloading",
          position: dock,
          timer: UNLOADING_SECONDS,
          cargo: CARGO_PER_TRIP,
          cargoMaterial: "Metal",
        },
      ],
    };

    // Long enough for the ship to fly to its parking spot.
    const full = tick(nearlyFull, UNLOADING_SECONDS + 10);

    expect(stored(full)).toBe(1000);
    expect(full.ships[0]).toMatchObject({
      state: "waiting",
      cargo: CARGO_PER_TRIP - 5,
      cargoMaterial: "Metal",
    });
    expect(full.ships[0]!.position).not.toEqual(dock);

    const stillWaiting = tick(full, 10);
    expect(stored(stillWaiting)).toBe(1000);
    expect(stillWaiting.ships[0]!.cargo).toBe(CARGO_PER_TRIP - 5);
  });
});
