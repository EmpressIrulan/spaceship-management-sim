import { ASTEROID_MIN_SPACING, BUILD_SECONDS, BUILDER_SIZE, DOCK_SIZE, MODULE_COST, STORAGE_SIZE, MODULE_SPACING } from "./build-constants";
import { MATERIALS, MODULE_TYPES } from "./model";
import type { Material, ModuleType, SimState, Station, Size, Vec } from "./model";
import { homeStation, replaceStation, stationById } from "./state";
import { distance } from "./fields";
import { moduleSize, samePosition } from "./station-module-geometry";

export interface ModuleBuildOption {
  type: ModuleType;
  enabled: boolean;
  // What the construction site still lacks to pay for this module.
  missing: Record<Material, number>;
}

// Every station pays for its own module builds from its own construction
// site, so the offers and the missing materials read that station's stock.
export function availableModuleBuilds(state: SimState, stationId: number): ModuleBuildOption[] {
  const station = stationById(state, stationId) ?? homeStation(state);
  const stock = station.constructionSite.inventory;
  const missing = Object.fromEntries(
    MATERIALS.map((material) => [material, Math.max(0, MODULE_COST[material] - stock[material])]),
  ) as Record<Material, number>;
  const enabled = MATERIALS.every((material) => missing[material] === 0) && station.construction === null;
  return MODULE_TYPES.map((type) => ({ type, enabled, missing }));
}

// Centre-to-centre distance between neighbouring module slots.
const BUILD_DIRECTIONS: Vec[] = [
  { x: -MODULE_SPACING, y: 0 },
  { x: 0, y: -MODULE_SPACING },
  { x: 0, y: MODULE_SPACING },
  { x: MODULE_SPACING, y: 0 },
];

// A site is offered before the module type is picked, so it has to fit the
// largest module, the Dock.
function overlapsFootprint(site: Vec, footprint: { position: Vec; size: Size }): boolean {
  return Math.abs(site.x - footprint.position.x) < (DOCK_SIZE.width + footprint.size.width) / 2
    && Math.abs(site.y - footprint.position.y) < (DOCK_SIZE.height + footprint.size.height) / 2;
}

export function availableModuleBuildSites(state: SimState, stationId: number): Vec[] {
  const station = stationById(state, stationId) ?? homeStation(state);
  const footprints = [
    ...state.stations.flatMap((other) => (other.sectorId === station.sectorId
      ? [...other.modules, ...(other.construction ? [other.construction] : []), ...other.buildQueue, other.constructionSite]
      : [])),
  ];
  const anchors = [...station.modules, ...station.buildQueue];
  const sites: Vec[] = [];
  for (const module of anchors) {
    for (const direction of BUILD_DIRECTIONS) {
      const site = { x: module.position.x + direction.x, y: module.position.y + direction.y };
      const blocked = footprints.some((footprint) => overlapsFootprint(site, footprint))
        || state.asteroids.some((asteroid) => distance(asteroid.position, site) < ASTEROID_MIN_SPACING);
      if (!blocked && !sites.some((position) => samePosition(position, site))) sites.push(site);
    }
  }
  return sites;
}

// The station that owns the slot a + was clicked at. Slots are offered per
// station and never overlap, so the pointer's slot names its owner.
export function stationOwningSite(state: SimState, position: Vec): number {
  const owner = stationById(state, state.supplyStation);
  for (const station of state.stations) {
    if (availableModuleBuildSites(state, station.id).some((site) => samePosition(site, position))) return station.id;
  }
  return owner?.id ?? 0;
}

export function startModuleBuild(state: SimState, stationId: number, type: ModuleType, position: Vec): SimState {
  const option = availableModuleBuilds(state, stationId).find((candidate) => candidate.type === type);
  const site = availableModuleBuildSites(state, stationId).find((candidate) => samePosition(candidate, position));
  if (!option?.enabled || !site) return state;
  const station = stationById(state, stationId);
  if (!station) return state;

  const inventory = Object.fromEntries(
    MATERIALS.map((material) => [material, station.constructionSite.inventory[material] - MODULE_COST[material]]),
  ) as Record<Material, number>;
  const construction = {
    type,
    position: { ...site },
    size: moduleSize(type),
    timer: BUILD_SECONDS,
  };
  return replaceStation(state, { ...station, constructionSite: { ...station.constructionSite, inventory }, construction });
}
