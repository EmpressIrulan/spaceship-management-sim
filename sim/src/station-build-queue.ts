import { BUILD_SECONDS, MODULE_COST, MODULE_SPACING } from "./build-constants";
import { MATERIALS } from "./model";
import type { Material, ModuleConstruction, ModuleType, QueuedModuleBuild, SimState, Station, Vec, Ship } from "./model";
import { availableModuleBuildSites } from "./station-building";
import { moduleSize, samePosition } from "./station-module-geometry";
import { travelSeconds } from "./motion";
import { speedFactor } from "./ship";
import type { Draft } from "./tick-mining";

type QueueState = Pick<Station, "constructionSite" | "construction" | "buildQueue">;

export function supplyQueueStatus(ship: Pick<Ship, "defaultBehaviour" | "order">, queuedCount: number): "waiting" | "supplying" | null {
  if (ship.defaultBehaviour !== "supply" || ship.order !== null) return null;
  return queuedCount === 0 ? "waiting" : "supplying";
}

export function waitEmptyQueueSupplier(ship: Ship, queuedCount: number): Ship | null {
  if (supplyQueueStatus(ship, queuedCount) !== "waiting" || ship.state !== "idle") return null;
  return { ...ship, state: "holding", timer: 0, leg: null, target: null };
}

export function holdReturnedSupplier(ship: Ship, queuedCount: number, dock: Vec): Ship | null {
  if (supplyQueueStatus(ship, queuedCount) !== "waiting" || ship.state !== "homebound") return null;
  return { ...ship, state: "holding", position: { ...dock }, timer: 0, leg: null, target: null, berth: null, transfer: null };
}

export function unloadSupplierIntoEmptyQueue(ship: Ship, queuedCount: number, dock: Vec): Ship | null {
  if (supplyQueueStatus(ship, queuedCount) !== "waiting" || ship.state !== "unloading") return null;
  const from = { ...ship.position };
  const to = { ...dock };
  return { ...ship, state: "homebound", transfer: null, position: from, leg: { from, to },
    timer: travelSeconds(Math.hypot(to.x - from.x, to.y - from.y), speedFactor(ship.design)) };
}

export function settleQueuedBuild(draft: Pick<Draft, "constructionSite" | "construction" | "buildQueue">): void {
  const next = startNextQueuedModule(draft);
  draft.constructionSite = next.constructionSite;
  draft.construction = next.construction;
  draft.buildQueue = next.buildQueue;
}

function canPay(inventory: Record<Material, number>): boolean {
  return MATERIALS.every((material) => inventory[material] >= MODULE_COST[material]);
}

export function startNextQueuedModule<T extends QueueState>(station: T): T {
  const next = station.buildQueue[0];
  if (station.construction || !next || !canPay(station.constructionSite.inventory)) return station;
  const inventory = Object.fromEntries(MATERIALS.map((material) => [
    material,
    station.constructionSite.inventory[material] - MODULE_COST[material],
  ])) as Record<Material, number>;
  const construction: ModuleConstruction = { ...next, timer: BUILD_SECONDS };
  return {
    ...station,
    constructionSite: { ...station.constructionSite, inventory },
    construction,
    buildQueue: station.buildQueue.slice(1),
  };
}

export function queueModuleBuild(state: SimState, type: ModuleType, position: Vec): SimState {
  const site = availableModuleBuildSites(state).find((candidate) => samePosition(candidate, position));
  if (!site) return state;
  const queued: QueuedModuleBuild = { type, position: { ...site }, size: moduleSize(type) };
  const station = startNextQueuedModule({ ...state.station, buildQueue: [...state.station.buildQueue, queued] });
  return { ...state, station };
}

function attached(a: Vec, b: Vec): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) === MODULE_SPACING;
}

function connectedQueue(station: Station, without: number): QueuedModuleBuild[] {
  const remaining = station.buildQueue.filter((_, index) => index !== without);
  const anchors = [...station.modules.map((module) => module.position), ...(station.construction ? [station.construction.position] : [])];
  const connected: QueuedModuleBuild[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const queued of remaining) {
      if (connected.includes(queued)) continue;
      if ([...anchors, ...connected.map((item) => item.position)].some((position) => attached(position, queued.position))) {
        connected.push(queued);
        changed = true;
      }
    }
  }
  return remaining.filter((queued) => connected.includes(queued));
}

export function cancelQueuedModuleBuild(state: SimState, target: Vec | number): SimState {
  const index = typeof target === "number"
    ? target
    : state.station.buildQueue.findIndex((queued) => samePosition(queued.position, target));
  if (index < 0 || index >= state.station.buildQueue.length) return state;
  const station = startNextQueuedModule({ ...state.station, buildQueue: connectedQueue(state.station, index) });
  return { ...state, station };
}
