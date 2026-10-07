import { describe, expect, it } from "vitest";
import {
  availableModuleBuildSites,
  availableModuleBuilds,
  createInitialState,
  homeStation,
  queueModuleBuild,
  startModuleBuild,
  stationById,
  tick,
  type SimState,
} from "./index";
import { miningStart } from "./test-ships";
import { placeStation } from "./station-placement";

const east = { x: 80, y: 0 };
const claimCost = { Metal: 1000, Ice: 1000 };
const claimSeconds = 300;

function withSite(state: SimState, stationId: number, Metal: number, Ice: number): SimState {
  return {
    ...state,
    stations: state.stations.map((station) => (station.id === stationId
      ? { ...station, constructionSite: { ...station.constructionSite, inventory: { Metal, Ice } } }
      : station)),
  };
}

// A placed station that has its Dock standing, so it has build slots the way
// a grown station does. Placed stations start empty, which hides the Claim
// offer behind the founding build.
function grownStation(): { state: SimState; id: number } {
  const placed = placeStation(createInitialState(7), 0, { x: 300, y: 300 });
  const id = placed.nextStationId - 1;
  const station = stationById(placed, id)!;
  const state = { ...placed, stations: placed.stations.map((candidate) => (candidate.id === id
    ? { ...station, founding: false, modules: [{ type: "Dock" as const, position: station.dock.position, size: station.dock.size }] }
    : candidate)) };
  return { state, id };
}

describe("ordering a Claim module", () => {
  it("offers Claim at Home and at a grown station, for 1000 Metal and 1000 Ice", () => {
    const { state, id } = grownStation();

    expect(availableModuleBuilds(miningStart(7), 0)).toContainEqual({ type: "Claim", enabled: false, missing: claimCost });
    expect(availableModuleBuilds(state, id)).toContainEqual({ type: "Claim", enabled: false, missing: claimCost });
  });

  it("enables Claim only once the station's own site holds the full cost", () => {
    const funded = withSite(miningStart(7), 0, 1000, 1000);
    expect(availableModuleBuilds(funded, 0).find((option) => option.type === "Claim")).toMatchObject({ enabled: true });
    expect(availableModuleBuilds(withSite(miningStart(7), 0, 999, 1000), 0).find((option) => option.type === "Claim"))
      .toMatchObject({ enabled: false, missing: { Metal: 1, Ice: 0 } });
  });

  it("takes 1000 Metal and 1000 Ice at once and builds for 300 seconds", () => {
    const started = startModuleBuild(withSite(miningStart(7), 0, 1000, 1000), 0, "Claim", east);

    expect(started.stations[0]!.constructionSite.inventory).toEqual({ Metal: 0, Ice: 0 });
    expect(started.stations[0]!.construction).toMatchObject({ type: "Claim", timer: claimSeconds, position: east });

    const almost = tick(started, claimSeconds - 1);
    expect(almost.stations[0]!.modules.some((module) => module.type === "Claim")).toBe(false);

    const built = tick(almost, 1);
    expect(built.stations[0]!.modules.at(-1)).toMatchObject({ type: "Claim", position: east });
    expect(built.stations[0]!.construction).toBeNull();
  });

  it("queues a Claim it cannot yet pay for, and starts it when the site fills", () => {
    let state = queueModuleBuild(miningStart(7), "Claim", east);
    expect(state.stations[0]!.buildQueue).toMatchObject([{ type: "Claim", position: east }]);

    state = tick(withSite(state, 0, 999, 1000), 0);
    expect(state.stations[0]!.construction).toBeNull();
    expect(state.stations[0]!.buildQueue).toHaveLength(1);

    state = tick(withSite(state, 0, 1000, 1000), 0);
    expect(state.stations[0]!.construction).toMatchObject({ type: "Claim", timer: claimSeconds });
    expect(state.stations[0]!.constructionSite.inventory).toEqual({ Metal: 0, Ice: 0 });
  });

  it("pays a grown station's Claim from that station's site and leaves Home's stock alone", () => {
    const { state: grown, id } = grownStation();
    const funded = withSite(withSite(grown, 0, 50, 50), id, 1000, 1000);
    const site = availableModuleBuildSites(funded, id)[0]!;

    const started = startModuleBuild(funded, id, "Claim", site);

    expect(stationById(started, id)!.construction).toMatchObject({ type: "Claim", position: site });
    expect(stationById(started, id)!.constructionSite.inventory).toEqual({ Metal: 0, Ice: 0 });
    expect(homeStation(started).constructionSite.inventory).toEqual({ Metal: 50, Ice: 50 });
  });
});
