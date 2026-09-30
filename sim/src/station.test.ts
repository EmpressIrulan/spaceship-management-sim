import { describe, expect, it } from "vitest";
import { ONE_STORAGE, oneStorageStart, padHopSeconds } from "./test-ships";
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
  return state.station.inventory.Metal + state.station.inventory.Ice;
}

describe("Dock and Storage", () => {
  it("starts with two separate station modules", () => {
    const state = oneStorageStart(7);

    expect(state.station).toMatchObject({
      dock: { capacity: 6 },
      storage: { capacity: 100 },
    });
    expect(state.station.dock.position).not.toEqual(state.station.storage.position);
  });

  it("returns the ship to the Dock to unload", () => {
    const state = oneStorageStart(7);
    const ship = state.ships[0]!;
    const leg = travelSeconds(
      Math.hypot(
        ship.target!.site.x - state.station.dock.position.x,
        ship.target!.site.y - state.station.dock.position.y,
      ),
    );

    const arrived = tick(state, 2 * leg + WORKING_SECONDS + padHopSeconds(state) + 0.01);

    expect(arrived.ships[0]!.state).toBe("unloading");
    expect(arrived.ships[0]!.position).toEqual(dockBerths(state.station.dock.position)[0]);
  });

  it("stops at 100 stored and leaves the ship waiting beside the Dock with the rest", () => {
    const initial = oneStorageStart(7);
    const dock = initial.station.dock.position;
    const nearlyFull: SimState = {
      ...initial,
      station: {
        ...initial.station,
        inventory: { Metal: 79, Ice: 20 },
      },
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

    expect(stored(full)).toBe(100);
    expect(full.ships[0]).toMatchObject({
      state: "waiting",
      cargo: CARGO_PER_TRIP - 1,
      cargoMaterial: "Metal",
    });
    expect(full.ships[0]!.position).not.toEqual(dock);

    const stillWaiting = tick(full, 10);
    expect(stored(stillWaiting)).toBe(100);
    expect(stillWaiting.ships[0]!.cargo).toBe(CARGO_PER_TRIP - 1);
  });
});
