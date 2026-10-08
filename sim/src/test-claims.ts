import { availableModuleBuildSites, startModuleBuild } from "./station-building";
import type { ModuleType, SimState } from "./model";
import { stationById } from "./state";
import { tick } from "./tick";

const CLAIM_SECONDS = 300;

// Pays a station's own site for a module of `type`, then starts it on the
// station's first free slot. Tests use this so they go through the same path a
// player does.
export function startFundedBuild(state: SimState, stationId: number, type: ModuleType): SimState {
  const station = stationById(state, stationId)!;
  const funded: SimState = {
    ...state,
    stations: state.stations.map((candidate) => (candidate.id === stationId
      ? { ...candidate, constructionSite: { ...candidate.constructionSite, inventory: { Metal: 1000, Ice: 1000 } } }
      : candidate)),
  };
  const site = availableModuleBuildSites(funded, station.id)[0]!;
  return startModuleBuild(funded, stationId, type, site);
}

// Starts a Claim on a station and runs the clock until it stands.
export function buildClaim(state: SimState, stationId: number): SimState {
  let next = startFundedBuild(state, stationId, "Claim");
  for (let elapsed = 0; elapsed < CLAIM_SECONDS; elapsed += 1) next = tick(next, 1);
  return next;
}
