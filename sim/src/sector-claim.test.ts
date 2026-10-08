import { describe, expect, it } from "vitest";
import { createInitialState, sectorClaimed, stationById, type SimState } from "./index";
import { placeStation, removeStation, renameSector } from "./station-placement";
import { buildClaim, startFundedBuild } from "./test-claims";
import { tick } from "./tick";

const homeSector = 0;

// A station in `sectorId` that stands on its own Dock with nothing queued,
// the way a grown station does, so a Claim can be ordered on it.
function grownStation(sectorId: number): { state: SimState; id: number } {
  const placed = placeStation(createInitialState(7), sectorId, { x: 300, y: 300 });
  const id = placed.nextStationId - 1;
  const station = stationById(placed, id)!;
  const state = { ...placed, stations: placed.stations.map((candidate) => (candidate.id === id
    ? { ...station, founding: false, buildQueue: [], modules: [{ type: "Dock" as const, position: station.dock.position, size: station.dock.size }] }
    : candidate)) };
  return { state, id };
}

describe("criterion 5: more than one Claim can go in a sector", () => {
  it("takes a second Claim at Home, and the sector stays claimed", () => {
    const twice = buildClaim(buildClaim(createInitialState(7), 0), 0);

    expect(stationById(twice, 0)!.modules.filter((module) => module.type === "Claim")).toHaveLength(2);
    expect(sectorClaimed(twice, homeSector)).toBe(true);
  });

  it("keeps the sector claimed when either of two stations holding a Claim is removed", () => {
    const { state: grown, id } = grownStation(homeSector);
    const both = buildClaim(buildClaim(grown, 0), id);

    expect(sectorClaimed(removeStation(both, id), homeSector)).toBe(true);
    expect(sectorClaimed(removeStation(both, 0), homeSector)).toBe(true);
  });
});

describe("criterion 6: removing the last Claim unclaims the sector", () => {
  it("unclaims when the station holding the last Claim is removed, and the generated name comes back", () => {
    const initial = createInitialState(7);
    const claimed = renameSector(buildClaim(initial, 0), homeSector, "Foundry");
    expect(claimed.sectors[0]!.name).toBe("Foundry");

    const removed = removeStation(claimed, 0);

    expect(sectorClaimed(removed, homeSector)).toBe(false);
    expect(removed.sectors[0]!.name).toBe(initial.sectors[0]!.name);
    expect(renameSector(removed, homeSector, "Nova")).toBe(removed);
  });

  it("keeps the sector claimed and its chosen name while another station still holds a Claim", () => {
    const { state: grown, id } = grownStation(homeSector);
    const both = renameSector(buildClaim(buildClaim(grown, 0), id), homeSector, "Foundry");

    const removed = removeStation(both, 0);

    expect(sectorClaimed(removed, homeSector)).toBe(true);
    expect(removed.sectors[0]!.name).toBe("Foundry");
  });
});

describe("criterion 7: Home starts unclaimed", () => {
  it("leaves Home's sector unclaimed, with no Rename", () => {
    const initial = createInitialState(7);

    expect(sectorClaimed(initial, homeSector)).toBe(false);
    expect(renameSector(initial, homeSector, "Foundry")).toBe(initial);
  });

  it("claims Home's sector once a Claim stands at Home, like any other sector", () => {
    const claimed = buildClaim(createInitialState(7), 0);

    expect(sectorClaimed(claimed, homeSector)).toBe(true);
    expect(renameSector(claimed, homeSector, "Foundry").sectors[0]!.name).toBe("Foundry");
  });

  it("claims another sector once a station in it holds a Claim", () => {
    const { state: grown, id } = grownStation(1);

    expect(sectorClaimed(grown, 1)).toBe(false);
    expect(sectorClaimed(buildClaim(grown, id), 1)).toBe(true);
  });
});

// Runs the clock on a fresh build and collects the sectors named on each tick.
function namingTicks(start: SimState, seconds: number): number[][] {
  const named: number[][] = [];
  let next = start;
  for (let elapsed = 0; elapsed < seconds; elapsed += 1) {
    next = tick(next, 1);
    if (next.finishedClaims.length > 0) named.push(next.finishedClaims);
  }
  return named;
}

describe("criterion 2: a finished Claim asks for a name", () => {
  it("names its sector on the one tick the Claim stands", () => {
    const { state: grown, id } = grownStation(1);

    expect(namingTicks(startFundedBuild(grown, id, "Claim"), 400)).toEqual([[1]]);
  });

  it("names Home's sector when a Claim at Home stands", () => {
    expect(namingTicks(startFundedBuild(createInitialState(7), 0, "Claim"), 400)).toEqual([[homeSector]]);
  });

  it("names nothing when the module that stands is not a Claim", () => {
    expect(namingTicks(startFundedBuild(createInitialState(7), 0, "Storage"), 400)).toEqual([]);
  });
});
