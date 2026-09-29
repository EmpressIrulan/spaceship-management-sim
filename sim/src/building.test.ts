import { describe, expect, it } from "vitest";
import {
  BUILD_SECONDS,
  MODULE_COST,
  availableModuleBuilds,
  createInitialState,
  startModuleBuild,
  tick,
  type SimState,
} from "./index";

describe("building station modules", () => {
  function funded(): SimState {
    const state = createInitialState(7);
    return {
      ...state,
      station: { ...state.station, inventory: { Metal: 50, Ice: 50 } },
    };
  }

  it("lists every module at 25 Metal and 25 Ice and disables unaffordable choices", () => {
    const state = createInitialState(7);

    expect(MODULE_COST).toEqual({ Metal: 25, Ice: 25 });
    expect(availableModuleBuilds(state)).toEqual([
      { type: "Dock", enabled: false },
      { type: "Storage", enabled: false },
      { type: "Builder", enabled: false },
    ]);
  });

  it("takes the cost immediately, occupies the next slot, and disables every choice", () => {
    const state = startModuleBuild(funded(), "Storage");

    expect(state.station.inventory).toEqual({ Metal: 25, Ice: 25 });
    expect(state.station.construction).toMatchObject({
      type: "Storage",
      timer: BUILD_SECONDS,
      position: { x: 80, y: 0 },
    });
    expect(availableModuleBuilds(state).every((option) => !option.enabled)).toBe(true);
  });

  it("finishes modules after 15 seconds and increases the matching capacity", () => {
    const storage = tick(startModuleBuild(funded(), "Storage"), BUILD_SECONDS);
    expect(storage.station.construction).toBeNull();
    expect(storage.station.modules.at(-1)).toMatchObject({ type: "Storage", position: { x: 80, y: 0 } });
    expect(storage.station.storage.capacity).toBe(200);

    const dock = tick(startModuleBuild(funded(), "Dock"), BUILD_SECONDS);
    expect(dock.station.dock.capacity).toBe(12);

    const builder = tick(startModuleBuild(funded(), "Builder"), BUILD_SECONDS);
    expect(builder.station.modules.at(-1)).toMatchObject({ type: "Builder" });
  });

  it("lets a storage-blocked ship resume unloading when ore is spent", () => {
    const initial = funded();
    const waiting: SimState = {
      ...initial,
      station: { ...initial.station, inventory: { Metal: 75, Ice: 25 } },
      ships: [{ ...initial.ships[0]!, state: "waiting", cargo: 10, cargoMaterial: "Metal", timer: 0 }],
    };

    const building = startModuleBuild(waiting, "Builder");

    expect(building.station.inventory).toEqual({ Metal: 50, Ice: 0 });
    expect(building.ships[0]).toMatchObject({ state: "unloading", cargo: 10 });
  });
});
