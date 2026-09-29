import { describe, expect, it } from "vitest";
import { tick } from "./tick";
import {
  CARGO_PER_TRIP,
  UNLOADING_SECONDS,
  WORKING_SECONDS,
  createInitialState,
  type SimState,
  type Station,
  type Vec,
} from "./state";
import { travelSeconds } from "./motion";

type ModuleStation = Station & {
  dock: { position: Vec; size: { width: number; height: number }; capacity: number };
  storage: { position: Vec; size: { width: number; height: number }; capacity: number };
};

function station(state: SimState): ModuleStation {
  return state.station as ModuleStation;
}

function stored(state: SimState): number {
  return state.station.inventory.Metal + state.station.inventory.Ice;
}

describe("Dock and Storage", () => {
  it("starts with two separate station modules", () => {
    const state = createInitialState(7);

    expect(station(state)).toMatchObject({
      dock: { capacity: 6 },
      storage: { capacity: 100 },
    });
    expect(station(state).dock.position).not.toEqual(station(state).storage.position);
  });

  it("returns the ship to the Dock to unload", () => {
    const state = createInitialState(7);
    const ship = state.ships[0]!;
    const leg = travelSeconds(
      Math.hypot(
        ship.target!.site.x - state.station.position.x,
        ship.target!.site.y - state.station.position.y,
      ),
    );

    const arrived = tick(state, 2 * leg + WORKING_SECONDS);

    expect(arrived.ships[0]!.state).toBe("unloading");
    expect(arrived.ships[0]!.position).toEqual(station(arrived).dock?.position);
  });

  it("stops at 100 stored and leaves the ship waiting at the Dock with the rest", () => {
    const initial = createInitialState(7);
    const dock = station(initial).dock?.position ?? initial.station.position;
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

    const full = tick(nearlyFull, UNLOADING_SECONDS);

    expect(stored(full)).toBe(100);
    expect(full.ships[0]).toMatchObject({
      state: "waiting",
      position: dock,
      cargo: CARGO_PER_TRIP - 1,
      cargoMaterial: "Metal",
    });

    const stillWaiting = tick(full, 10);
    expect(stored(stillWaiting)).toBe(100);
    expect(stillWaiting.ships[0]!.cargo).toBe(CARGO_PER_TRIP - 1);
  });
});
