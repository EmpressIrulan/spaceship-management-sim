import { RESPAWN_SECONDS, type Asteroid, type Ship, type Station, type Vec, type SimState } from "./state";
import { shipStats } from "./ship";

// Only called for a ship that can mine, so it has a Laser.
export function miningSeconds(ship: Ship): number {
  return shipStats(ship.design).miningSeconds ?? 0;
}

// Mutable copy of the parts of SimState that one tick changes. Built fresh
// from the input, so the caller's state is never touched.
export interface Draft {
  time: number;
  deliveries: Station["deliveries"];
  rng: number;
  nextAsteroidId: number;
  nextShipId: number;
  // The Dock module's position, the station's home point and route origin.
  dock: Vec;
  stationSector: number;
  storageCapacity: number;
  storageLimits: Station["storageLimits"];
  inventory: Station["inventory"];
  constructionSite: Station["constructionSite"];
  asteroids: Asteroid[];
  respawns: SimState["respawns"];
  fields: SimState["fields"];
  ships: Ship[];
  modules: Station["modules"];
  construction: Station["construction"];
  buildQueue: Station["buildQueue"];
  shipBuilds: Station["shipBuilds"];
  dockCapacity: number;
  sectors: SimState["sectors"];
  gateProjects: SimState["gateProjects"];
  claimSites: SimState["claimSites"];
}

// Takes up to `units` of ore from the asteroid a ship is mining and returns
// how many it got, removing the asteroid and queueing its replacement once it
// is empty. A ship whose asteroid is already gone gets nothing.
export function mine(draft: Draft, ship: Ship, units: number): number {
  if (units <= 0 || !ship.target) return 0;
  const id = ship.target.asteroidId;
  const asteroid = draft.asteroids.find((a) => a.id === id);
  if (!asteroid) return 0;
  const taken = Math.min(units, asteroid.ore);
  const ore = asteroid.ore - taken;
  if (ore > 0) {
    draft.asteroids = draft.asteroids.map((a) => (a.id === id ? { ...a, ore } : a));
    return taken;
  }
  draft.asteroids = draft.asteroids.filter((a) => a.id !== id);
  draft.respawns = [...draft.respawns, { sectorId: asteroid.sectorId, fieldId: asteroid.fieldId, timer: RESPAWN_SECONDS, lastPosition: asteroid.position, rich: asteroid.rich }];
  return taken;
}

export function asteroidGone(draft: Draft, ship: Ship): boolean {
  return !draft.asteroids.some((a) => a.id === ship.target?.asteroidId);
}
