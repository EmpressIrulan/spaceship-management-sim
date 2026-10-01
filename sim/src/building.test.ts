import { describe, expect, it } from "vitest";
import { miningStart } from "./test-ships";
import {
  BUILD_SECONDS,
  DOCK_SIZE,
  MODULE_COST,
  availableModuleBuildSites,
  availableModuleBuilds,
  startModuleBuild,
  tick,
  type SimState,
  type Vec,
} from "./index";

describe("building station modules", () => {
  function funded(): SimState {
    const state = miningStart(7);
    return {
      ...state,
      station: { ...state.station, constructionSite: { ...state.station.constructionSite, inventory: { Metal: 50, Ice: 50 } } },
    };
  }

  const east = { x: 80, y: 0 };

  it("lists every module at 25 Metal and 25 Ice and disables unaffordable choices", () => {
    const state = miningStart(7);

    expect(MODULE_COST).toEqual({ Metal: 25, Ice: 25 });
    const missing = { Metal: 25, Ice: 25 };
    expect(availableModuleBuilds(state)).toEqual([
      { type: "Dock", enabled: false, missing },
      { type: "Storage", enabled: false, missing },
      { type: "Builder", enabled: false, missing },
    ]);
  });

  it("takes the cost immediately, occupies the next slot, and disables every choice", () => {
    const state = startModuleBuild(funded(), "Storage", east);

    expect(state.station.constructionSite.inventory).toEqual({ Metal: 25, Ice: 25 });
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
      { x: 80, y: 0 },
    ]);

    expect(startModuleBuild(funded(), "Builder", { x: -40, y: 0 }).station.construction)
      .toMatchObject({ type: "Builder", position: { x: -40, y: 0 } });
    const state = funded();
    expect(startModuleBuild(state, "Builder", { x: 400, y: 400 })).toBe(state);
  });

  it("never offers a site that overlaps an existing module, on a fresh game or after a second Dock", () => {
    function expectClear(state: SimState): void {
      const footprints = [
        ...state.station.modules,
        ...(state.station.construction ? [state.station.construction] : []),
      ];
      for (const site of availableModuleBuildSites(state)) {
        for (const module of footprints) {
          const overlapX = Math.abs(site.x - module.position.x) < (DOCK_SIZE.width + module.size.width) / 2;
          const overlapY = Math.abs(site.y - module.position.y) < (DOCK_SIZE.height + module.size.height) / 2;
          expect(overlapX && overlapY, `${JSON.stringify(site)} vs ${module.type}`).toBe(false);
        }
      }
    }

    const fresh = funded();
    expectClear(fresh);
    expect(availableModuleBuildSites(fresh).length).toBeGreaterThan(0);

    const withSecondDock = tick(startModuleBuild(fresh, "Dock", east), BUILD_SECONDS);
    expect(withSecondDock.station.modules.filter((module) => module.type === "Dock")).toHaveLength(2);
    expectClear(withSecondDock);
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

  it("leaves a Storage-blocked ship waiting, because a build no longer spends Storage", () => {
    const initial = funded();
    const waiting: SimState = {
      ...initial,
      station: { ...initial.station, inventory: { Metal: 75, Ice: 25 } },
      ships: [{ ...initial.ships[0]!, state: "waiting", cargo: 10, cargoMaterial: "Metal", timer: 0 }],
    };

    const building = startModuleBuild(waiting, "Builder", east);

    expect(building.station.inventory).toEqual({ Metal: 75, Ice: 25 });
    expect(building.ships[0]).toMatchObject({ state: "waiting", cargo: 10 });
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
    expect(completed.ships[0]).toMatchObject({ state: "berthing", cargo: 10 });

    const docked = tick(completed, completed.ships[0]!.timer);
    expect(docked.ships[0]).toMatchObject({ state: "unloading", cargo: 10 });

    const unloaded = tick(docked, docked.ships[0]!.timer);
    expect(unloaded.station.inventory).toEqual({ Metal: 85, Ice: 25 });
    expect(unloaded.ships[0]).toMatchObject({ state: "outbound", cargo: 0 });
  });

  it("keeps respawned asteroids clear of a station grown in every direction and mineable", () => {
    const initial = miningStart(17);
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
