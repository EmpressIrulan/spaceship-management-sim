import { ASTEROID_MIN_SPACING, BUILD_SECONDS, BUILDER_SIZE, DOCK_SIZE, MODULE_COST, STORAGE_SIZE, MODULE_SPACING } from "./build-constants";
import { MATERIALS, MODULE_TYPES } from "./model";
import type { Material, ModuleType, SimState, Size, Vec } from "./model";
import { homeStation, replaceHomeStation } from "./state";
import { distance } from "./fields";
import { moduleSize, samePosition } from "./station-module-geometry";

export interface ModuleBuildOption {
  type: ModuleType;
  enabled: boolean;
  // What the construction site still lacks to pay for this module.
  missing: Record<Material, number>;
}

export function availableModuleBuilds(state: SimState): ModuleBuildOption[] {
  const home = homeStation(state);
  const stock = home.constructionSite.inventory;
  const missing = Object.fromEntries(
    MATERIALS.map((material) => [material, Math.max(0, MODULE_COST[material] - stock[material])]),
  ) as Record<Material, number>;
  const enabled = MATERIALS.every((material) => missing[material] === 0) && home.construction === null;
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

export function availableModuleBuildSites(state: SimState): Vec[] {
  const home = homeStation(state);
  const footprints = [
    ...home.modules,
    ...(home.construction ? [home.construction] : []),
    ...home.buildQueue,
    home.constructionSite,
  ];
  const anchors = [...home.modules, ...home.buildQueue];
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

export function startModuleBuild(state: SimState, type: ModuleType, position: Vec): SimState {
  const option = availableModuleBuilds(state).find((candidate) => candidate.type === type);
  const site = availableModuleBuildSites(state).find((candidate) => samePosition(candidate, position));
  if (!option?.enabled || !site) return state;

  const home = homeStation(state);
  const inventory = Object.fromEntries(
    MATERIALS.map((material) => [material, home.constructionSite.inventory[material] - MODULE_COST[material]]),
  ) as Record<Material, number>;
  const construction = {
    type,
    position: { ...site },
    size: moduleSize(type),
    timer: BUILD_SECONDS,
  };
  const station = { ...home, constructionSite: { ...home.constructionSite, inventory }, construction };
  return replaceHomeStation(state, station);
}
