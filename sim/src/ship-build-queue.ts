import { MATERIALS } from "./model";
import type { Material, ShipBuild, ShipDesign, SimState, Station } from "./model";
import { dockWaitingShips, replaceHomeStation, replaceStation, stationById } from "./state";
import { shipBuildCost, shipBuildSeconds, validDesign } from "./ship";

// Each Builder works through its own queue of ships, held in order in the
// station's `shipBuilds`. The first ship for a Builder is the one building;
// the ones behind it are marked waiting and have paid nothing yet. A ship pays
// for itself from Storage when its build starts, so a queue can hold more than
// the station can afford and has no length limit.

type ShipYard = Pick<Station, "inventory" | "shipBuilds">;

function canPay(inventory: Record<Material, number>, design: ShipDesign): boolean {
  const cost = shipBuildCost(design);
  return MATERIALS.every((material) => inventory[material] >= cost[material]);
}

function isBuilder(station: Station, builder: number): boolean {
  return station.modules[builder]?.type === "Builder";
}

// Starts the first waiting ship at every idle Builder that Storage can pay
// for. A Builder that can't pay waits on that ship rather than skipping to a
// cheaper one behind it. Returns the same object when nothing starts.
export function startWaitingShipBuilds<T extends ShipYard>(station: T): T {
  let inventory = station.inventory;
  let changed = false;
  const busy = new Set<number>();
  const shipBuilds = station.shipBuilds.map((job) => {
    if (busy.has(job.builder)) return job;
    busy.add(job.builder);
    if (!job.waiting || !canPay(inventory, job.design)) return job;
    const cost = shipBuildCost(job.design);
    inventory = Object.fromEntries(
      MATERIALS.map((material) => [material, inventory[material] - cost[material]]),
    ) as Record<Material, number>;
    changed = true;
    const { waiting: _, ...started } = job;
    return started;
  });
  return changed ? { ...station, inventory, shipBuilds } : station;
}

// A Builder can take a job straight away when it is built, idle, and Storage
// can pay.
export function availableShipBuild(state: SimState, builder: number, design: ShipDesign, stationId = 0): boolean {
  const home = stationById(state, stationId);
  if (!home || !isBuilder(home, builder) || !validDesign(design)) return false;
  if (home.shipBuilds.some((job) => job.builder === builder)) return false;
  return canPay(home.inventory, design);
}

// Puts `count` ships of one design on the end of a Builder's queue. Queuing is
// free; the ship at the front starts at once if Storage can pay for it.
export function queueShipBuild(state: SimState, builder: number, design: ShipDesign, count = 1, stationId = 0): SimState {
  const home = stationById(state, stationId);
  if (!home || !isBuilder(home, builder) || !validDesign(design) || !(count >= 1)) return state;
  const queued: ShipBuild[] = Array.from({ length: Math.floor(count) }, () => ({
    stationId,
    builder,
    design: { ...design, slots: [...design.slots] },
    timer: shipBuildSeconds(design),
    waiting: true,
  }));
  return withShipYard(state, startWaitingShipBuilds({ ...home, shipBuilds: [...home.shipBuilds, ...queued] }));
}

// Puts a station back after its queue changed. Paying for a ship frees space
// in Storage, so ships waiting off the Dock to unload may now berth.
function withShipYard(state: SimState, station: Station): SimState {
  const next = { ...replaceStation(state, station), ships: dockWaitingShips(station, state.ships) };
  return station.id === 0 ? replaceHomeStation(next, station) : next;
}

function sameDesign(a: ShipDesign, b: ShipDesign): boolean {
  return a.width === b.width && a.height === b.height && a.slots.every((slot, i) => slot === b.slots[i]);
}

// Cancels the line at `place` in a Builder's queue, counted as in
// `shipBuildQueue`. The ship being built is a line of its own: it stops and
// all its materials go back to Storage. A waiting line is the run of identical
// waiting ships around `place`, as the panel shows it ("Miner x3"); they have
// paid nothing, so Storage is untouched. Either way the next ship then starts
// if Storage can pay, and the rest of the queue keeps its order.
export function cancelShipBuild(state: SimState, builder: number, place: number, stationId = 0): SimState {
  const home = stationById(state, stationId);
  const queue = shipBuildQueue(state, builder, stationId);
  const target = queue[place];
  if (!home || !target) return state;
  const inLine = (job: ShipBuild | undefined) => job?.waiting === true && sameDesign(job.design, target.design);
  let first = place;
  let last = place;
  if (target.waiting) {
    while (inLine(queue[first - 1])) first -= 1;
    while (inLine(queue[last + 1])) last += 1;
  }
  const cancelled = new Set(queue.slice(first, last + 1));
  let inventory = home.inventory;
  if (!target.waiting) {
    const cost = shipBuildCost(target.design);
    inventory = Object.fromEntries(
      MATERIALS.map((material) => [material, inventory[material] + cost[material]]),
    ) as Record<Material, number>;
  }
  const shipBuilds = home.shipBuilds.filter((job) => !cancelled.has(job));
  return withShipYard(state, startWaitingShipBuilds({ ...home, inventory, shipBuilds }));
}

// The single-ship entry point: a queue of one, taken only when it can start now.
export function startShipBuild(state: SimState, builder: number, design: ShipDesign, stationId = 0): SimState {
  if (!availableShipBuild(state, builder, design, stationId)) return state;
  return queueShipBuild(state, builder, design, 1, stationId);
}

// A Builder's ships in build order: the one building, if any, then the waiting ones.
export function shipBuildQueue(state: SimState, builder: number, stationId = 0): ShipBuild[] {
  return stationById(state, stationId)?.shipBuilds.filter((job) => job.builder === builder) ?? [];
}

// What Storage still lacks for the ship a Builder is waiting on, e.g.
// { Metal: 40 } for "Waiting: 40 more Metal". Only short materials appear.
// Null while the Builder is building or has nothing queued.
export function shipBuildShortfall(state: SimState, builder: number, stationId = 0): Partial<Record<Material, number>> | null {
  const station = stationById(state, stationId);
  const next = shipBuildQueue(state, builder, stationId)[0];
  if (!station || !next?.waiting) return null;
  const cost = shipBuildCost(next.design);
  const missing: Partial<Record<Material, number>> = {};
  for (const material of MATERIALS) {
    const short = cost[material] - station.inventory[material];
    if (short > 0) missing[material] = short;
  }
  return missing;
}
