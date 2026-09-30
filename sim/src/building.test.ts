import { describe, expect, it } from "vitest";
import {
  BUILD_SECONDS,
  MODULE_COST,
  availableModuleBuildSites,
  availableModuleBuilds,
  createInitialState,
  startModuleBuild,
  tick,
  type SimState,
  type Vec,
} from "./index";

describe("building station modules", () => {
  function funded(): SimState {
    const state = createInitialState(7);
    return {
      ...state,
      station: { ...state.station, inventory: { Metal: 50, Ice: 50 } },
    };
  }

  const east = { x: 80, y: 0 };

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
    const state = startModuleBuild(funded(), "Storage", east);

    expect(state.station.inventory).toEqual({ Metal: 25, Ice: 25 });
    expect(state.station.construction).toMatchObject({
      type: "Storage",
      timer: BUILD_SECONDS,
      position: { x: 80, y: 0 },
    });
    expect(availableModuleBuilds(state).every((option) => !option.enabled)).toBe(true);
  });

  it("offers every empty adjacent slot so the station can grow in any direction", () => {
    expect(availableModuleBuildSites(funded())).toEqual([
      { x: -40, y: 0 },
      { x: 0, y: -40 },
      { x: 0, y: 40 },
      { x: 40, y: -40 },
      { x: 40, y: 40 },
      { x: 80, y: 0 },
    ]);

    expect(startModuleBuild(funded(), "Builder", { x: 0, y: -40 }).station.construction)
      .toMatchObject({ type: "Builder", position: { x: 0, y: -40 } });
    const state = funded();
    expect(startModuleBuild(state, "Builder", { x: 400, y: 400 })).toBe(state);
  });

  it("finishes modules after 15 seconds and increases the matching capacity", () => {
    const storage = tick(startModuleBuild(funded(), "Storage", east), BUILD_SECONDS);
    expect(storage.station.construction).toBeNull();
    expect(storage.station.modules.at(-1)).toMatchObject({ type: "Storage", position: { x: 80, y: 0 } });
    expect(storage.station.storage.capacity).toBe(200);

    const dock = tick(startModuleBuild(funded(), "Dock", east), BUILD_SECONDS);
    expect(dock.station.dock.capacity).toBe(12);

    const builder = tick(startModuleBuild(funded(), "Builder", east), BUILD_SECONDS);
    expect(builder.station.modules.at(-1)).toMatchObject({ type: "Builder" });
  });

  it("lets a storage-blocked ship resume unloading when ore is spent", () => {
    const initial = funded();
    const waiting: SimState = {
      ...initial,
      station: { ...initial.station, inventory: { Metal: 75, Ice: 25 } },
      ships: [{ ...initial.ships[0]!, state: "waiting", cargo: 10, cargoMaterial: "Metal", timer: 0 }],
    };

    const building = startModuleBuild(waiting, "Builder", east);

    expect(building.station.inventory).toEqual({ Metal: 50, Ice: 0 });
    expect(building.ships[0]).toMatchObject({ state: "unloading", cargo: 10 });
  });

  it("lets a ship waiting on full Storage leave once a Storage module completes", () => {
    const building = startModuleBuild(funded(), "Storage", east);
    const full: SimState = {
      ...building,
      station: { ...building.station, inventory: { Metal: 75, Ice: 25 } },
      ships: [{ ...building.ships[0]!, state: "waiting", cargo: 10, cargoMaterial: "Metal", timer: 0 }],
    };

    const completed = tick(full, BUILD_SECONDS);
    expect(completed.station.storage.capacity).toBe(200);
    expect(completed.ships[0]).toMatchObject({ state: "unloading", cargo: 10 });

    const unloaded = tick(completed, completed.ships[0]!.timer);
    expect(unloaded.station.inventory).toEqual({ Metal: 85, Ice: 25 });
    expect(unloaded.ships[0]).toMatchObject({ state: "outbound", cargo: 0 });
  });

  it("keeps respawned asteroids clear of a station grown in every direction and mineable", () => {
    const initial = createInitialState(17);
    const positions: Vec[] = [];
    for (let offset = -400; offset <= 400; offset += 40) {
      positions.push({ x: offset, y: 0 }, { x: 0, y: offset });
    }
    const unique = positions.filter(
      (position, index) => positions.findIndex((other) => other.x === position.x && other.y === position.y) === index,
    );
    const grown: SimState = {
      ...initial,
      station: {
        ...initial.station,
        modules: unique.map((position, index) => ({
          type: index === 0 ? "Dock" : "Storage",
          position,
          size: initial.station.storage.size,
        })),
      },
      asteroids: [],
      respawns: Array.from({ length: 8 }, (_, index) => ({
        sectorId: 0,
        fieldId: index % 4,
        timer: 0,
        lastPosition: { x: 200 + index * 10, y: 0 },
        rich: false,
      })),
      ships: [{ ...initial.ships[0]!, state: "idle", timer: 0, cargo: 0, target: null }],
    };

    const respawned = tick(grown, 0);
    for (const asteroid of respawned.asteroids) {
      expect(respawned.station.modules.every((module) =>
        Math.hypot(
          asteroid.position.x - module.position.x,
          asteroid.position.y - module.position.y,
        ) >= 40,
      )).toBe(true);
    }
    expect(respawned.ships[0]).toMatchObject({ state: "outbound" });

    const mining = tick(respawned, respawned.ships[0]!.timer);
    expect(mining.ships[0]).toMatchObject({ state: "working", cargoMaterial: expect.any(String) });
  });
});
