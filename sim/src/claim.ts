import { ASTEROID_MIN_SPACING, BUILD_SECONDS, DOCK_SIZE, HOME_SECTOR, MATERIALS, MODULE_COST, MODULE_SPACING } from "./build-constants";
import type { ClaimSite, Material, ModuleType, Size, Vec } from "./model";
type ClaimState = { sectors: { id: number; name: string }[]; claimSites: ClaimSite[]; nextClaimSiteId: number; asteroids: { sectorId: number; position: Vec }[]; station: { modules: { position: Vec; size: Size }[]; constructionSite: { position: Vec; size: Size } } };

// Placeholders, to revisit after playing. A site builds the same Dock and
// Storage as the home station, at the same price and time.
export const CLAIM_BUILD_ORDER: readonly ModuleType[] = ["Dock", "Storage"];
export const CLAIM_MODULE_COST: Record<Material, number> = MODULE_COST;
export const CLAIM_BUILD_SECONDS = BUILD_SECONDS;
// Two module slots side by side. `position` is the middle of the pair.
export const CLAIM_SITE_SIZE: Size = { width: DOCK_SIZE.width + MODULE_SPACING, height: DOCK_SIZE.height };

export type { ClaimSite } from "./model";

export interface ClaimSiteNeeds {
  // The module being supplied or built now, and the one after it.
  building: ModuleType | null;
  next: ModuleType | null;
  // Seconds left, once the module is fully supplied and under way.
  seconds: number | null;
  remaining: Record<Material, number>;
}

export function claimSiteNeeds(site: ClaimSite): ClaimSiteNeeds {
  return {
    building: CLAIM_BUILD_ORDER[site.stage] ?? null,
    next: CLAIM_BUILD_ORDER[site.stage + 1] ?? null,
    seconds: site.timer === null ? null : Math.max(0, site.timer),
    remaining: {
      Metal: Math.max(0, CLAIM_MODULE_COST.Metal - site.delivered.Metal),
      Ice: Math.max(0, CLAIM_MODULE_COST.Ice - site.delivered.Ice),
    },
  };
}

export function claimSiteBuilt(site: ClaimSite): boolean {
  return site.stage >= CLAIM_BUILD_ORDER.length;
}

// Where each module of the site sits, so a finished one can be drawn in its slot.
export function claimSiteSlots(site: ClaimSite): { type: ModuleType; position: Vec; built: boolean }[] {
  return CLAIM_BUILD_ORDER.map((type, index) => ({
    type,
    built: index < site.stage,
    position: { x: site.position.x + (index - (CLAIM_BUILD_ORDER.length - 1) / 2) * MODULE_SPACING, y: site.position.y },
  }));
}

function overlaps(a: Vec, b: Vec, size: Size, margin: number): boolean {
  return Math.abs(a.x - b.x) < size.width / 2 + margin && Math.abs(a.y - b.y) < size.height / 2 + margin;
}

export function startClaimSite<S extends ClaimState>(state: S, sectorId: number, position: Vec): S {
  if (!state.sectors[sectorId]) return state;
  const blockedBySite = state.claimSites.some((site) => site.sectorId === sectorId
    && overlaps(site.position, position, { width: CLAIM_SITE_SIZE.width * 2, height: CLAIM_SITE_SIZE.height * 2 }, 0));
  const blockedByRock = state.asteroids.some((rock) => rock.sectorId === sectorId
    && overlaps(rock.position, position, CLAIM_SITE_SIZE, ASTEROID_MIN_SPACING / 2));
  const blockedByStation = sectorId === HOME_SECTOR
    && [...state.station.modules, state.station.constructionSite].some((module) => overlaps(module.position, position, { width: CLAIM_SITE_SIZE.width + module.size.width, height: CLAIM_SITE_SIZE.height + module.size.height }, 0));
  if (blockedBySite || blockedByRock || blockedByStation) return state;
  const site: ClaimSite = {
    id: state.nextClaimSiteId,
    sectorId,
    position: { ...position },
    stage: 0,
    delivered: { Metal: 0, Ice: 0 },
    timer: null,
  };
  return { ...state, nextClaimSiteId: state.nextClaimSiteId + 1, claimSites: [...state.claimSites, site] } as S;
}

// Only a site whose Dock and first Storage are built can be taken down.
export function removeClaimSite<S extends ClaimState>(state: S, siteId: number): S {
  const site = state.claimSites.find((candidate) => candidate.id === siteId);
  if (!site || !claimSiteBuilt(site)) return state;
  return { ...state, claimSites: state.claimSites.filter((candidate) => candidate.id !== siteId) } as S;
}

export function sectorClaimed(state: Pick<ClaimState, "claimSites">, sectorId: number): boolean {
  return state.claimSites.some((site) => site.sectorId === sectorId && claimSiteBuilt(site));
}

export function renameSector<S extends ClaimState>(state: S, sectorId: number, name: string): S {
  const trimmed = name.trim();
  if (!trimmed || !sectorClaimed(state, sectorId)) return state;
  return { ...state, sectors: state.sectors.map((sector) => (sector.id === sectorId ? { ...sector, name: trimmed } : sector)) } as S;
}

// Takes what the site still needs of one material and returns what was
// accepted. A module that is fully supplied starts its build timer.
export function deliverToSite(site: ClaimSite, material: Material, units: number): { site: ClaimSite; accepted: number } {
  const module = CLAIM_BUILD_ORDER[site.stage];
  if (!module || site.timer !== null || units <= 0) return { site, accepted: 0 };
  const accepted = Math.min(units, claimSiteNeeds(site).remaining[material]);
  const delivered = { ...site.delivered, [material]: site.delivered[material] + accepted };
  const supplied = MATERIALS.every((item) => delivered[item] >= CLAIM_MODULE_COST[item]);
  return { site: { ...site, delivered, timer: supplied ? CLAIM_BUILD_SECONDS : null }, accepted };
}

export function nextSiteEvent(sites: ClaimSite[]): number {
  return sites.reduce((soonest, site) => (site.timer === null ? soonest : Math.min(soonest, site.timer)), Infinity);
}

export function advanceSites(sites: ClaimSite[], seconds: number): ClaimSite[] {
  return sites.map((site) => (site.timer === null ? site : { ...site, timer: site.timer - seconds }));
}

export function settleSites(sites: ClaimSite[]): ClaimSite[] {
  return sites.map((site) => (site.timer !== null && site.timer <= 0
    ? { ...site, stage: site.stage + 1, delivered: { Metal: 0, Ice: 0 }, timer: null }
    : site));
}
