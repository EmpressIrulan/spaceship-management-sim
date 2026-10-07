import { availableModuleBuildSites, startModuleBuild } from "./station-building";
import type { SimState } from "./model";
import { stationById } from "./state";
import { tick } from "./tick";

const CLAIM_SECONDS = 300;

// Pays a station's own site the full Claim cost, starts a Claim on its first
// free slot and runs the clock until it stands. Tests of sector claims use
// this so they go through the same path a player does.
export function buildClaim(state: SimState, stationId: number): SimState {
  const station = stationById(state, stationId)!;
  const funded: SimState = {
    ...state,
    stations: state.stations.map((candidate) => (candidate.id === stationId
      ? { ...candidate, constructionSite: { ...candidate.constructionSite, inventory: { Metal: 1000, Ice: 1000 } } }
      : candidate)),
  };
  const site = availableModuleBuildSites(funded, station.id)[0]!;
  let next = startModuleBuild(funded, stationId, "Claim", site);
  for (let elapsed = 0; elapsed < CLAIM_SECONDS; elapsed += 1) next = tick(next, 1);
  return next;
}
