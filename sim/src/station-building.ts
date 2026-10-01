import { ASTEROID_MIN_SPACING, BUILD_SECONDS, BUILDER_SIZE, DOCK_SIZE, MATERIALS, MODULE_COST, MODULE_TYPES, STORAGE_SIZE, MODULE_SPACING } from "./build-constants";
import type { Material, ModuleType, Size, Vec } from "./model";
type BuildState = { station: { constructionSite: { position: Vec; size: Size; inventory: Record<Material, number> }; construction: { type: ModuleType; position: Vec; size: Size; timer: number } | null; modules: { type: ModuleType; position: Vec; size: Size }[]; inventory: Record<Material, number> }; asteroids: { position: Vec }[]; ships: unknown[] };
import { distance } from "./fields";

export interface ModuleBuildOption {
  type: ModuleType;
  enabled: boolean;
  // What the construction site still lacks to pay for this module.
  missing: Record<Material, number>;
}

export function availableModuleBuilds(state: BuildState): ModuleBuildOption[] {
  const stock = state.station.constructionSite.inventory;
  const missing = Object.fromEntries(
    MATERIALS.map((material) => [material, Math.max(0, MODULE_COST[material] - stock[material])]),
  ) as Record<Material, number>;
  const enabled = MATERIALS.every((material) => missing[material] === 0) && state.station.construction === null;
  return MODULE_TYPES.map((type) => ({ type, enabled, missing }));
}

// Centre-to-centre distance between neighbouring module slots.
const BUILD_DIRECTIONS: Vec[] = [
  { x: -MODULE_SPACING, y: 0 },
  { x: 0, y: -MODULE_SPACING },
  { x: 0, y: MODULE_SPACING },
  { x: MODULE_SPACING, y: 0 },
];

function samePosition(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}

// A site is offered before the module type is picked, so it has to fit the
// largest module, the Dock.
function overlapsFootprint(site: Vec, footprint: { position: Vec; size: Size }): boolean {
  return Math.abs(site.x - footprint.position.x) < (DOCK_SIZE.width + footprint.size.width) / 2
    && Math.abs(site.y - footprint.position.y) < (DOCK_SIZE.height + footprint.size.height) / 2;
}

export function availableModuleBuildSites(state: BuildState): Vec[] {
  const footprints = [
    ...state.station.modules,
    ...(state.station.construction ? [state.station.construction] : []),
    state.station.constructionSite,
  ];
  const sites: Vec[] = [];
  for (const module of state.station.modules) {
    for (const direction of BUILD_DIRECTIONS) {
      const site = { x: module.position.x + direction.x, y: module.position.y + direction.y };
      const blocked = footprints.some((footprint) => overlapsFootprint(site, footprint))
        || state.asteroids.some((asteroid) => distance(asteroid.position, site) < ASTEROID_MIN_SPACING);
      if (!blocked && !sites.some((position) => samePosition(position, site))) sites.push(site);
    }
  }
  return sites;
}

function moduleSize(type: ModuleType): Size {
  if (type === "Dock") return DOCK_SIZE;
  if (type === "Storage") return STORAGE_SIZE;
  return BUILDER_SIZE;
}

export function startModuleBuild<S extends BuildState>(state: S, type: ModuleType, position: Vec): S {
  const option = availableModuleBuilds(state).find((candidate) => candidate.type === type);
  const site = availableModuleBuildSites(state).find((candidate) => samePosition(candidate, position));
  if (!option?.enabled || !site) return state;

  const inventory = Object.fromEntries(
    MATERIALS.map((material) => [material, state.station.constructionSite.inventory[material] - MODULE_COST[material]]),
  ) as Record<Material, number>;
  const construction = {
    type,
    position: { ...site },
    size: moduleSize(type),
    timer: BUILD_SECONDS,
  };
  const station = { ...state.station, constructionSite: { ...state.station.constructionSite, inventory }, construction };
  return { ...state, station } as S;
}
