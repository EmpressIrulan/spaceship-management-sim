import { describe, expect, it } from "vitest";
import {
  UNLOADING_SECONDS,
  MATERIALS,
  createInitialState,
  deleteStock,
  setStorageLimit,
  stationIncome,
  tick,
} from "./index";

describe("Storage stock controls", () => {
  it("throws away ore above a material limit while the miner unloads and carries on", () => {
    const initial = createInitialState(7);
    const limited = setStorageLimit({
      ...initial,
      stations: [{
        ...initial.stations[0]!,
        inventory: { Metal: 20, Ice: 40 },
      }],
      ships: [{
        ...initial.ships[0]!,
        mineMaterials: [...MATERIALS],
        state: "unloading",
        position: { ...initial.stations[0]!.dock.position },
        timer: UNLOADING_SECONDS,
        cargo: 10,
        cargoMaterial: "Ice",
      }],
    }, "Ice", 40);

    const unloaded = tick(limited, UNLOADING_SECONDS);

    expect(unloaded.stations[0]!.inventory.Ice).toBe(40);
    expect(unloaded.ships[0]).toMatchObject({ cargo: 0, state: "outbound" });
    expect(stationIncome(unloaded).Ice).toBe(0);
  });

  it("uses a blank limit as unlimited and destroys excess stock as soon as a limit is set", () => {
    const initial = createInitialState(7);
    const stocked = {
      ...initial,
      stations: [{ ...initial.stations[0]!, inventory: { Metal: 20, Ice: 80 } }],
    };

    expect(setStorageLimit(stocked, "Ice", 40).stations[0]!.inventory.Ice).toBe(40);
    expect(setStorageLimit(stocked, "Ice", null).stations[0]!.inventory.Ice).toBe(80);
    expect(initial.stations[0]!.storageLimits).toEqual({ Metal: null, Ice: null });
  });

  it("deletes only the requested stock and lets a storage-blocked ship unload", () => {
    const initial = createInitialState(7);
    const blocked = {
      ...initial,
      stations: [{ ...initial.stations[0]!, inventory: { Metal: 20, Ice: 80 } }],
      ships: [{
        ...initial.ships[0]!,
        state: "waiting" as const,
        timer: 0,
        cargo: 10,
        cargoMaterial: "Metal" as const,
      }],
    };

    const freed = deleteStock(blocked, "Ice", 30);

    expect(freed.stations[0]!.inventory).toEqual({ Metal: 20, Ice: 50 });
    expect(freed.ships[0]).toMatchObject({ state: "berthing", cargo: 10 });
  });
});
