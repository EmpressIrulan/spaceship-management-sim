import { DOCK_SIZE, MODULE_SPACING } from "./build-constants";
import { MATERIALS, MODULE_TYPES } from "./model";
import type { Material, ModuleType, SimState, Station, Size, Vec } from "./model";
import { homeStation, replaceStation, stationById } from "./state";
import { moduleBuildSeconds, moduleCost, moduleSize, samePosition } from "./station-module-geometry";
import { DOCK_HEIGHT, DOCK_WIDTH } from "./dock-packing";
import { validDockDimensions } from "./station-module-geometry";

export interface ModuleBuildOption {
  type: ModuleType;
  enabled: boolean;
  // What the construction site still lacks to pay for this module.
  missing: Record<Material, number>;
}

// Every station pays for its own module builds from its own construction
// site, so the offers and the missing materials read that station's stock.
export function availableModuleBuilds(state: SimState, stationId: number, dockDimensions?: Size): ModuleBuildOption[] {
  const station = stationById(state, stationId) ?? homeStation(state);
  const stock = station.constructionSite.inventory;
  return MODULE_TYPES.map((type) => {
    const cost = moduleCost(type, type === "Dock" ? dockDimensions?.width : undefined, type === "Dock" ? dockDimensions?.height : undefined);
    const missing = Object.fromEntries(
      MATERIALS.map((material) => [material, Math.max(0, cost[material] - stock[material])]),
    ) as Record<Material, number>;
    const enabled = MATERIALS.every((material) => missing[material] === 0) && station.construction === null;
    return { type, enabled, missing };
  });
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
const BUILD_CLEARANCE = 0.01;

function overlapsFootprint(site: Vec, footprint: { position: Vec; size: Size }, size = DOCK_SIZE): boolean {
  return Math.abs(site.x - footprint.position.x) < (size.width + footprint.size.width) / 2
    && Math.abs(site.y - footprint.position.y) < (size.height + footprint.size.height) / 2;
}

export function footprintsTouch(a: { position: Vec; size: Size }, b: { position: Vec; size: Size }): boolean {
  const dx = Math.abs(a.position.x - b.position.x);
  const dy = Math.abs(a.position.y - b.position.y);
  const horizontal = dy < 1e-6
    && Math.abs(dx - Math.max(MODULE_SPACING, (a.size.width + b.size.width) / 2 + BUILD_CLEARANCE)) < 1e-6;
  const vertical = dx < 1e-6
    && Math.abs(dy - Math.max(MODULE_SPACING, (a.size.height + b.size.height) / 2 + BUILD_CLEARANCE)) < 1e-6;
  return horizontal || vertical || Math.abs(Math.hypot(dx, dy) - MODULE_SPACING) < 1e-6;
}

export function availableModuleBuildSites(state: SimState, stationId: number, dockDimensions?: Size): Vec[] {
  const station = stationById(state, stationId) ?? homeStation(state);
  const proposedSize = dockDimensions ? moduleSize("Dock", dockDimensions.width, dockDimensions.height) : DOCK_SIZE;
  const footprints = [
    ...state.stations.flatMap((other) => (other.sectorId === station.sectorId
      ? [...other.modules, ...(other.construction ? [other.construction] : []), ...other.buildQueue]
      : [])),
  ];
  const anchors = [...station.modules, ...station.buildQueue];
  const sites: Vec[] = [];
  for (const module of anchors) {
    for (const direction of BUILD_DIRECTIONS) {
      const horizontal = direction.x !== 0;
      const offset = Math.max(MODULE_SPACING, (horizontal
        ? proposedSize.width + module.size.width
        : proposedSize.height + module.size.height) / 2 + BUILD_CLEARANCE);
      const site = {
        x: module.position.x + (horizontal ? Math.sign(direction.x) * offset : 0),
        y: module.position.y + (horizontal ? 0 : Math.sign(direction.y) * offset),
      };
      const blocked = footprints.some((footprint) => overlapsFootprint(site, footprint, proposedSize))
        || state.asteroids.some((asteroid) => asteroid.sectorId === station.sectorId
          && overlapsFootprint(site, asteroid, proposedSize));
      if (!blocked && !sites.some((position) => samePosition(position, site))) sites.push(site);
    }
  }
  return sites;
}

// Find a nearby clear location for the construction pad after a module is
// completed on top of it. Search outward in small deterministic steps.
export function nearbyClearPosition(position: Vec, obstacles: Array<{ position: Vec; size: Size }>, asteroids: SimState["asteroids"], sectorId: number): Vec {
  const blocked = (candidate: Vec) => obstacles.some((obstacle) => overlapsFootprint(candidate, obstacle))
    || asteroids.some((asteroid) => asteroid.sectorId === sectorId && overlapsFootprint(candidate, asteroid));
  if (!blocked(position)) return position;
  for (let radius = 1; radius <= 30; radius += 1) {
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        if (Math.max(Math.abs(x), Math.abs(y)) !== radius) continue;
        const candidate = { x: position.x + x * MODULE_SPACING / 2, y: position.y + y * MODULE_SPACING / 2 };
        if (!blocked(candidate)) return candidate;
      }
    }
  }
  return position;
}

// The station that owns the slot a + was clicked at. Slots are offered per
// station and never overlap, so the pointer's slot names its owner.
export function stationOwningSite(state: SimState, position: Vec, dockDimensions?: Size): number {
  const owner = stationById(state, state.supplyStation);
  for (const station of state.stations) {
    if (availableModuleBuildSites(state, station.id, dockDimensions).some((site) => samePosition(site, position))) return station.id;
  }
  return owner?.id ?? 0;
}

export function startModuleBuild(state: SimState, stationId: number, type: ModuleType, position: Vec, dockDimensions?: Size): SimState {
  if (type === "Dock" && dockDimensions && !validDockDimensions(dockDimensions)) return state;
  const option = availableModuleBuilds(state, stationId, dockDimensions).find((candidate) => candidate.type === type);
  const site = availableModuleBuildSites(state, stationId, dockDimensions).find((candidate) => samePosition(candidate, position));
  if (!option?.enabled || !site) return state;
  const station = stationById(state, stationId);
  if (!station) return state;

  const dimensions = type === "Dock" ? dockDimensions : undefined;
  const width = dimensions?.width ?? (type === "Dock" ? DOCK_WIDTH : undefined);
  const height = dimensions?.height ?? (type === "Dock" ? DOCK_HEIGHT : undefined);
  const cost = moduleCost(type, width, height);
  const inventory = Object.fromEntries(
    MATERIALS.map((material) => [material, station.constructionSite.inventory[material] - cost[material]]),
  ) as Record<Material, number>;
  const construction = {
    type,
    position: { ...site },
    size: moduleSize(type, width, height),
    ...(type === "Dock" ? { width, height } : {}),
    timer: moduleBuildSeconds(type),
  };
  return replaceStation(state, { ...station, constructionSite: { ...station.constructionSite, inventory }, construction });
}
