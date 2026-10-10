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
      stations: [{ ...state.stations[0]!, constructionSite: { ...state.stations[0]!.constructionSite, inventory: { Metal: 50, Ice: 50 } } }],
    };
  }

  const east = { x: 80, y: 0 };

  it("lists each module at its own cost and disables unaffordable choices", () => {
    const state = miningStart(7);

    expect(MODULE_COST).toEqual({ Metal: 25, Ice: 25 });
    const missing = { Metal: 25, Ice: 25 };
    expect(availableModuleBuilds(state, 0)).toEqual([
      { type: "Dock", enabled: false, missing },
      { type: "Storage", enabled: false, missing },
      { type: "Builder", enabled: false, missing },
      { type: "Turret", enabled: false, missing },
      { type: "Claim", enabled: false, missing: { Metal: 1000, Ice: 1000 } },
    ]);
  });

  it("takes the cost immediately, occupies the next slot, and disables every choice", () => {
    const state = startModuleBuild(funded(), 0, "Storage", east);

    expect(state.stations[0]!.constructionSite.inventory).toEqual({ Metal: 25, Ice: 25 });
    expect(state.stations[0]!.construction).toMatchObject({
      type: "Storage",
      timer: BUILD_SECONDS,
      position: { x: 80, y: 0 },
    });
    expect(availableModuleBuilds(state, 0).every((option) => !option.enabled)).toBe(true);
  });

  it("offers every empty adjacent slot so the station can grow in any direction", () => {
    expect(availableModuleBuildSites(funded(), 0)).toEqual([
      { x: -40, y: 0 },
      { x: 0, y: -40 },
      { x: 0, y: 40 },
      { x: 40, y: -40 },
      { x: 40, y: 40 },
      { x: 80, y: 0 },
    ]);

    expect(startModuleBuild(funded(), 0, "Builder", { x: -40, y: 0 }).stations[0]!.construction)
      .toMatchObject({ type: "Builder", position: { x: -40, y: 0 } });
    const state = funded();
    expect(startModuleBuild(state, 0, "Builder", { x: 400, y: 400 })).toBe(state);
  });

  it("never offers a site that overlaps an existing module, on a fresh game or after a second Dock", () => {
    function expectClear(state: SimState): void {
      const footprints = [
        ...state.stations[0]!.modules,
        ...(state.stations[0]!.construction ? [state.stations[0]!.construction] : []),
      ];
      for (const site of availableModuleBuildSites(state, 0)) {
        for (const module of footprints) {
          const overlapX = Math.abs(site.x - module.position.x) < (DOCK_SIZE.width + module.size.width) / 2;
          const overlapY = Math.abs(site.y - module.position.y) < (DOCK_SIZE.height + module.size.height) / 2;
          expect(overlapX && overlapY, `${JSON.stringify(site)} vs ${module.type}`).toBe(false);
        }
      }
    }

    const fresh = funded();
    expectClear(fresh);
    expect(availableModuleBuildSites(fresh, 0).length).toBeGreaterThan(0);

    const withSecondDock = tick(startModuleBuild(fresh, 0, "Dock", east), BUILD_SECONDS);
    expect(withSecondDock.stations[0]!.modules.filter((module) => module.type === "Dock")).toHaveLength(2);
    expectClear(withSecondDock);
  });

  it("finishes modules after 15 seconds and increases the matching capacity", () => {
    const storage = tick(startModuleBuild(funded(), 0, "Storage", east), BUILD_SECONDS);
    expect(storage.stations[0]!.construction).toBeNull();
    expect(storage.stations[0]!.modules.at(-1)).toMatchObject({ type: "Storage", position: { x: 80, y: 0 } });
    expect(storage.stations[0]!.storage.capacity).toBe(2000);

    const dock = tick(startModuleBuild(funded(), 0, "Dock", east), BUILD_SECONDS);
    expect(dock.stations[0]!.dock.capacity).toBe(192);

    const builder = tick(startModuleBuild(funded(), 0, "Builder", east), BUILD_SECONDS);
    expect(builder.stations[0]!.modules.at(-1)).toMatchObject({ type: "Builder" });
  });

  it("queues and builds a Turret like any other module", () => {
    const started = startModuleBuild(funded(), 0, "Turret", east);
    expect(started.stations[0]!.construction).toMatchObject({ type: "Turret", timer: BUILD_SECONDS });
    const built = tick(started, BUILD_SECONDS);
    expect(built.stations[0]!.modules.at(-1)).toMatchObject({ type: "Turret", hp: 40, maxHp: 40 });
  });

  it("adds one thousand shared units for each additional Storage module", () => {
    let state = tick(startModuleBuild(funded(), 0, "Storage", east), BUILD_SECONDS);
    expect(state.stations[0]!.storage.capacity).toBe(2000);
    for (const amount of [50]) {
      const site = availableModuleBuildSites(state, 0)[0]!;
      state = {
        ...state,
        stations: [{ ...state.stations[0]!, constructionSite: {
          ...state.stations[0]!.constructionSite,
          inventory: { Metal: amount, Ice: amount },
        } }],
      };
      state = tick(startModuleBuild(state, 0, "Storage", site), BUILD_SECONDS);
    }
    expect(state.stations[0]!.storage.capacity).toBe(3000);
  });

  it("gives a build that lost its footing back to the site instead of finishing it", () => {
    const started = startModuleBuild(funded(), 0, "Storage", east);
    const detached: SimState = {
      ...started,
      stations: [{
        ...started.stations[0]!,
        construction: { type: "Storage", position: { x: 200, y: 0 }, size: { width: 30, height: 40 }, timer: BUILD_SECONDS },
      }],
    };

    const settled = tick(detached, BUILD_SECONDS);

    expect(settled.stations[0]!.modules.map((module) => module.position)).not.toContainEqual({ x: 200, y: 0 });
    expect(settled.stations[0]!.construction).toBeNull();
    expect(settled.stations[0]!.constructionSite.inventory).toEqual({ Metal: 50, Ice: 50 });
  });

  it("leaves a Storage-blocked ship waiting, because a build no longer spends Storage", () => {
    const initial = funded();
    const waiting: SimState = {
      ...initial,
      stations: [{ ...initial.stations[0]!, inventory: { Metal: 75, Ice: 25 } }],
      ships: [{ ...initial.ships[0]!, state: "waiting", cargo: 10, cargoMaterial: "Metal", timer: 0 }],
    };

    const building = startModuleBuild(waiting, 0, "Builder", east);

    expect(building.stations[0]!.inventory).toEqual({ Metal: 75, Ice: 25 });
    expect(building.ships[0]).toMatchObject({ state: "waiting", cargo: 10 });
  });

  it("lets a ship waiting on full Storage leave once a Storage module completes", () => {
    const building = startModuleBuild(funded(), 0, "Storage", east);
    const full: SimState = {
      ...building,
      stations: [{ ...building.stations[0]!, inventory: { Metal: 750, Ice: 250 } }],
      ships: [{ ...building.ships[0]!, state: "waiting", cargo: 10, cargoMaterial: "Metal", timer: 0 }],
    };

    const completed = tick(full, BUILD_SECONDS);
    expect(completed.stations[0]!.storage.capacity).toBe(2000);
    expect(completed.ships[0]).toMatchObject({ state: "berthing", cargo: 10 });

    const docked = tick(completed, completed.ships[0]!.timer);
    expect(docked.ships[0]).toMatchObject({ state: "unloading", cargo: 10 });

    const unloaded = tick(docked, docked.ships[0]!.timer);
    expect(unloaded.stations[0]!.inventory).toEqual({ Metal: 760, Ice: 250 });
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
      stations: [{
        ...initial.stations[0]!,
        modules: unique.map((position, index) => ({
          type: index === 0 ? "Dock" : "Storage",
          position,
          size: initial.stations[0]!.storage.size,
        })),
      }],
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
      expect(respawned.stations[0]!.modules.every((module) =>
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
