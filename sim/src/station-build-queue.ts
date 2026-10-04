import { BUILD_SECONDS, MODULE_COST, MODULE_SPACING } from "./build-constants";
import { MATERIALS } from "./model";
import type { Material, ModuleConstruction, ModuleType, QueuedModuleBuild, SimState, Station, Vec, Ship } from "./model";
import { DOCK_CAPACITY, STORAGE_CAPACITY } from "./state";
import { availableModuleBuildSites } from "./station-building";
import { moduleSize, samePosition } from "./station-module-geometry";
import { travelSeconds } from "./motion";
import { speedFactor } from "./ship";
import type { Draft } from "./tick-mining";

type QueueState = Pick<Station, "constructionSite" | "construction" | "buildQueue">;
// What the queue needs to know about how the station hangs together: the
// finished modules, the one under construction and what is still waiting.
type StationGraph = Pick<Station, "modules" | "construction" | "buildQueue">;

export function supplyQueueStatus(ship: Pick<Ship, "defaultBehaviour" | "order">, queuedCount: number): "waiting" | "supplying" | null {
  if (ship.defaultBehaviour !== "supply" || ship.order !== null) return null;
  return queuedCount === 0 ? "waiting" : "supplying";
}

// True for a supply ship with nothing queued that has run out of reason to sit
// at the Dock: idle, or home with nothing left to deliver. Such a ship waits out
// the empty queue from a parking spot beside the Dock rather than on the Dock
// itself, so several of them wait in a row where each can be picked out on its
// own. The spot itself is chosen by the caller, the one place that knows where
// the other ships are.
export function parksForEmptyQueue(ship: Ship, queuedCount: number): boolean {
  if (supplyQueueStatus(ship, queuedCount) !== "waiting") return false;
  return ship.state === "idle" || ship.state === "homebound";
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

// A build that lost its footing while it was running, e.g. because the ghost it
// hung off was cancelled: the materials go back to the site and the slot is given
// up, rather than leaving a module standing off the station or holding the queue
// behind a build that can never finish.
export function refundDetachedBuild(draft: Pick<Draft, "construction" | "constructionSite">): void {
  if (!draft.construction) return;
  const inventory = adjustInventory(draft.constructionSite.inventory, 1);
  draft.construction = null;
  draft.constructionSite = { ...draft.constructionSite, inventory };
}

function adjustInventory(inventory: Record<Material, number>, direction: 1 | -1): Record<Material, number> {
  return Object.fromEntries(MATERIALS.map((material) => [material, inventory[material] + direction * MODULE_COST[material]])) as Record<Material, number>;
}

function canPay(inventory: Record<Material, number>): boolean {
  return MATERIALS.every((material) => inventory[material] >= MODULE_COST[material]);
}

export function startNextQueuedModule<T extends QueueState>(station: T): T {
  const next = station.buildQueue[0];
  if (station.construction || !next || !canPay(station.constructionSite.inventory)) return station;
  const inventory = adjustInventory(station.constructionSite.inventory, -1);
  const construction: ModuleConstruction = { ...next, timer: BUILD_SECONDS };
  return {
    ...station,
    constructionSite: { ...station.constructionSite, inventory },
    construction,
    buildQueue: station.buildQueue.slice(1),
  };
}

// Stands the module under construction up as part of the station.
export function completeBuild(draft: Draft): void {
  if (!draft.construction) return;
  const { timer: _timer, ...module } = draft.construction;
  draft.modules = [...draft.modules, module];
  if (module.type === "Storage") draft.storageCapacity += STORAGE_CAPACITY;
  if (module.type === "Dock") draft.dockCapacity += DOCK_CAPACITY;
  draft.construction = null;
}

export function queueModuleBuild(state: SimState, type: ModuleType, position: Vec): SimState {
  const site = availableModuleBuildSites(state).find((candidate) => samePosition(candidate, position));
  if (!site) return state;
  const queued: QueuedModuleBuild = { type, position: { ...site }, size: moduleSize(type) };
  const station = startNextQueuedModule({ ...state.station, buildQueue: [...state.station.buildQueue, queued] });
  return { ...state, station };
}

function touching(a: Vec, b: Vec): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) === MODULE_SPACING;
}

// The modules the station already stands on.
function standingPositions(station: StationGraph): Vec[] {
  return station.modules.map((module) => module.position);
}

// The slots in `order` that will be standing attached to the station by the time
// they are built: each one touches something the station already stands on, or
// an earlier slot in the order that does. A slot cannot lean on one built after
// it, so this is a single pass in build order rather than a fill that runs until
// nothing new connects. That difference is what keeps a ghost that only reaches
// the station through a ghost behind it out of the queue, since it would finish
// a module off the station while it waited its turn. The cancel cascade and the
// guard on a module finishing both read this, so attached means one thing here.
function attachedInOrder(anchors: Vec[], order: Vec[]): Vec[] {
  const attached: Vec[] = [];
  for (const position of order) {
    if ([...anchors, ...attached].some((other) => touching(other, position))) attached.push(position);
  }
  return attached;
}

// The ghosts still waiting once the one at `index` is cancelled: every other
// queued ghost that will be attached when it is built, through the finished
// modules, the module under construction, or a ghost ahead of it that is too.
function queueAfterCancel(station: StationGraph, index: number): QueuedModuleBuild[] {
  const remaining = station.buildQueue.filter((_, at) => at !== index);
  const anchors = [...standingPositions(station), ...(station.construction ? [station.construction.position] : [])];
  const attached = attachedInOrder(anchors, remaining.map((queued) => queued.position));
  return remaining.filter((queued) => attached.includes(queued.position));
}

// Every ghost that reaches the station only through the one at `index`, so
// cancelling that ghost takes these with it and nothing is left queued that
// could never attach. The cancel and the hover highlight read this one set, so
// the ghosts one promises to highlight are exactly the ghosts one removes.
export function queuedDependents(station: StationGraph, index: number): QueuedModuleBuild[] {
  if (index < 0 || index >= station.buildQueue.length) return [];
  const kept = queueAfterCancel(station, index);
  return station.buildQueue.filter((queued, at) => at !== index && !kept.includes(queued));
}

// True when the module under construction will be standing attached when its
// timer runs out. Only the finished modules count: it comes first in build
// order, so nothing still queued can be what it hangs off.
export function constructionAttached(station: StationGraph): boolean {
  if (!station.construction) return false;
  return attachedInOrder(standingPositions(station), [station.construction.position]).length > 0;
}

export function cancelQueuedModuleBuild(state: SimState, target: Vec | number): SimState {
  const index = typeof target === "number"
    ? target
    : state.station.buildQueue.findIndex((queued) => samePosition(queued.position, target));
  if (index < 0 || index >= state.station.buildQueue.length) return state;
  const station = startNextQueuedModule({ ...state.station, buildQueue: queueAfterCancel(state.station, index) });
  return { ...state, station };
}
