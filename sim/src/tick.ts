import { flyHaul, haulCargoDestination, haulStationDetails } from "./haul";
import { gateOutstanding } from "./gate-hauling";
import { asteroidGone, mine, miningSeconds, type Draft } from "./tick-mining";
import { beginHaulLoading, beginHaulUnloading, loadHauler, unloadHauler } from "./tick-hauling";
import { addCargo, arrivesAtPark, berth, layoutOf, storageRemaining, transferCargo, withCargo } from "./tick-shared";
import { distanceAlong, travelSeconds } from "./motion";
import { afterOrder, nextMiningRock, resumeMining, startMining, travelOrder } from "./orders";
import { nextRandom } from "./prng";
import { cargoTransferSeconds, shipStats, speedFactor } from "./ship";
import { completeDocking, syncDockedShips } from "./hangars";
import {
  constructionAttached,
  completeBuild,
  parksForEmptyQueue,
  refundDetachedBuild,
  settleQueuedBuild,
  settleStationBuild,
  supplyQueueStatus,
  unloadSupplierIntoEmptyQueue,
} from "./station-build-queue";
import {
  ABUNDANT_SHARE,
  GATE_COST,
  JUMP_SECONDS,
  HOME_SECTOR,
  INCOME_WINDOW_SECONDS,
  MATERIALS,
  RESPAWN_SECONDS,
  arrived,
  depart,
  cargoByMaterial,
  gateRoute,
  newAsteroid,
  placeInField,
  toBerth,
  toParking,
  type BerthLayout,
  type Asteroid,
  type HaulStationId,
  type Ship,
  type SimState,
  type Station,
  type Vec,
} from "./state";

interface Route {
  dock: Vec;
  site: Vec;
  length: number;
  factor: number;
  legSeconds: number;
}

function routeOf(ship: Ship, dock: Vec): Route | null {
  if (!ship.target) return null;
  const site = ship.target.site;
  const length = Math.hypot(site.x - dock.x, site.y - dock.y);
  const factor = speedFactor(ship.design);
  return { dock, site, length, factor, legSeconds: travelSeconds(length, factor) };
}

const stationKeys = ["deliveries", "dock", "stationSector", "storageCapacity", "storageLimits", "inventory", "constructionSite", "modules", "construction", "buildQueue", "shipBuilds", "dockCapacity"] as const;
type StationKey = typeof stationKeys[number];
type StationContext = Pick<Draft, StationKey>;

function currentStationContext(draft: Draft): StationContext {
  return Object.fromEntries(stationKeys.map((key) => [key, draft[key]])) as StationContext;
}

function setStationContext(draft: Draft, context: StationContext): void {
  Object.assign(draft, context);
}

function saveStationContext(draft: Draft, stationId: number): void {
  const context = currentStationContext(draft);
  if (stationId === draft.primaryStationId) return;
  draft.others = draft.others.map((station) => station.id === stationId ? {
    ...station, deliveries: context.deliveries,
    dock: { ...station.dock, capacity: context.dockCapacity }, sectorId: context.stationSector,
    storage: { ...station.storage, capacity: context.storageCapacity }, storageLimits: context.storageLimits,
    inventory: context.inventory, constructionSite: context.constructionSite, modules: context.modules,
    construction: context.construction, buildQueue: context.buildQueue, shipBuilds: context.shipBuilds,
  } : station);
}

function stationContext(draft: Draft, stationId: number): StationContext | null {
  if (stationId === draft.activeStationId) return currentStationContext(draft);
  const station = draft.others.find((candidate) => candidate.id === stationId);
  if (!station) return null;
  return {
    deliveries: station!.deliveries, dock: station!.dock.position, stationSector: station!.sectorId,
    storageCapacity: station!.storage.capacity, storageLimits: station!.storageLimits,
    inventory: station!.inventory, constructionSite: station!.constructionSite, modules: station!.modules,
    construction: station!.construction, buildQueue: station!.buildQueue, shipBuilds: station!.shipBuilds,
    dockCapacity: station!.dock.capacity,
  };
}

function forShipHome<T>(draft: Draft, ship: Ship, action: () => T): T {
  const id = ship.homeStationId ?? 0;
  if (id === draft.activeStationId) return action();
  const home = stationContext(draft, id);
  if (!home) return action();
  const prior = currentStationContext(draft);
  const priorId = draft.activeStationId;
  saveStationContext(draft, priorId);
  setStationContext(draft, home);
  draft.activeStationId = id;
  const result = action();
  saveStationContext(draft, id);
  setStationContext(draft, prior);
  draft.activeStationId = priorId;
  return result;
}

function pointAlong(from: Vec, to: Vec, route: Route, elapsed: number): Vec {
  const fraction = distanceAlong(route.length, elapsed, route.factor) / route.length;
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

// Cargo moves in whole units, in step with how far through the timer the ship is.
function unitsDone(timer: number, duration: number, hold: number): number {
  return duration <= 0 ? hold : Math.floor(hold * (1 - timer / duration) + 1e-9);
}

function transferDone(ship: Ship, timer: number): number {
  return ship.transfer ? unitsDone(timer, cargoTransferSeconds(ship.transfer.amount), ship.transfer.amount) : 0;
}

function unloadMaterial(draft: Draft, material: "Metal" | "Ice", units: number): number {
  if (units <= 0) return 0;
  const limit = draft.storageLimits[material];
  const materialRoom = limit === null ? Infinity : Math.max(0, limit - draft.inventory[material]);
  const accepted = Math.min(units, storageRemaining(draft), materialRoom);
  if (accepted > 0) draft.deliveries = [...draft.deliveries, { at: draft.time, material, amount: accepted }];
  draft.inventory = {
    ...draft.inventory,
    [material]: draft.inventory[material] + accepted,
  };
  const atLimit = limit !== null && draft.inventory[material] >= limit;
  return accepted + (atLimit ? units - accepted : 0);
}

function unloadCargo(draft: Draft, ship: Ship, units: number): Ship {
  const cargo = cargoByMaterial(ship);
  let left = units;
  let removed = 0;
  for (const material of MATERIALS) {
    const amount = Math.min(left, cargo[material]);
    const processed = unloadMaterial(draft, material, amount);
    cargo[material] -= processed;
    removed += processed;
    left -= processed;
  }
  const total = ship.cargo - removed;
  const cargoMaterial = total === 0 ? null : MATERIALS.find((material) => cargo[material] > 0) ?? ship.cargoMaterial;
  return { ...ship, cargo: total, cargoByMaterial: cargo, cargoMaterial };
}

function canProcessCargo(draft: Draft, ship: Ship): boolean {
  const cargo = cargoByMaterial(ship);
  return storageRemaining(draft) > 0 || MATERIALS.some((material) => cargo[material] > 0
    && draft.storageLimits[material] !== null && draft.inventory[material] >= draft.storageLimits[material]!);
}

// Moves a ship partway through its current state, leaving `timer` seconds.
function progress(draft: Draft, ship: Ship, timer: number): Ship {
  const route = routeOf(ship, draft.dock);
  switch (ship.state) {
    case "idle":
    case "waiting":
    case "holding":
    case "jumpingOut":
    case "jumpingHome":
    case "haulJumpingOutbound":
    case "haulJumpingReturning":
      return { ...ship, timer };
    case "docked":
      return { ...ship, timer: 0 };
    case "outbound":
    case "homebound":
    case "berthing":
    case "moving":
    case "docking":
    case "gateHauling":
    case "gateReturning":
    case "haulOutbound":
    case "haulReturning": {
      if (ship.leg) {
        const length = Math.hypot(ship.leg.to.x - ship.leg.from.x, ship.leg.to.y - ship.leg.from.y);
        const total = travelSeconds(length, speedFactor(ship.design));
        const fraction = total === 0 ? 1 : distanceAlong(length, total - timer, speedFactor(ship.design)) / length;
        return { ...ship, timer, position: { x: ship.leg.from.x + (ship.leg.to.x - ship.leg.from.x) * fraction, y: ship.leg.from.y + (ship.leg.to.y - ship.leg.from.y) * fraction } };
      }
      return {
        ...ship,
        timer,
        position: route ? pointAlong(ship.state === "homebound" ? route.site : route.dock, ship.state === "homebound" ? route.dock : route.site, route, route.legSeconds - timer) : ship.position,
      };
    }
    case "working": {
      const { hold } = shipStats(ship.design);
      const next = addCargo(ship, ship.cargoMaterial, mine(draft, ship, unitsDone(timer, miningSeconds(ship), hold) - ship.cargo));
      // A depleted rock ends this mining timer early; finish() chooses another
      // allowed rock or heads home if none can be reached.
      const done = next.cargo < hold && asteroidGone(draft, ship);
      return { ...next, timer: done ? 0 : timer };
    }
    case "loading": {
      if (!ship.transfer || !ship.cargoMaterial) return { ...ship, timer };
      const targetCargo = ship.transfer.startingCargo + transferDone(ship, timer);
      const loaded = Math.min(Math.max(0, targetCargo - ship.cargo), draft.inventory[ship.cargoMaterial]);
      draft.inventory = { ...draft.inventory, [ship.cargoMaterial]: draft.inventory[ship.cargoMaterial] - loaded };
      return { ...addCargo(ship, ship.cargoMaterial, loaded), timer };
    }
    case "unloading": {
      if (ship.transfer?.destination === "constructionSite") {
        const returning = unloadSupplierIntoEmptyQueue(ship, draft.supplyQueue, draft.dock);
        if (returning) return returning;
        const targetCargo = Math.max(0, ship.transfer.startingCargo - transferDone(ship, timer));
        return { ...giveToBuildSite(draft, ship, ship.cargo - targetCargo, deliverySiteStation(draft, ship)), timer };
      }
      const targetCargo = Math.max(0, (ship.transfer?.startingCargo ?? ship.cargo) - transferDone(ship, timer));
      return { ...unloadCargo(draft, ship, ship.cargo - targetCargo), timer };
    }
    case "gateUnloading": {
      const targetCargo = Math.max(0, (ship.transfer?.startingCargo ?? ship.cargo) - transferDone(ship, timer));
      return { ...giveToGate(draft, ship, ship.cargo - targetCargo), timer };
    }
    case "haulLoading": {
      const targetCargo = (ship.transfer?.startingCargo ?? 0) + transferDone(ship, timer);
      return { ...addCargo(ship, ship.haulRoute?.material ?? null,
        loadHauler(draft, ship, Math.max(0, targetCargo - ship.cargo))), timer };
    }
    case "haulUnloading": {
      const targetCargo = Math.max(0, (ship.transfer?.startingCargo ?? ship.cargo) - transferDone(ship, timer));
      return { ...unloadHauler(draft, ship, ship.cargo - targetCargo), timer };
    }
    case "haulWaitingSource":
    case "haulWaitingFull":
      return { ...ship, timer };
  }
}

function carryCargoToGate(draft: Draft, ship: Ship): Ship | null {
  const gateId = ship.order?.kind === "haulGate" ? ship.order.gateId : -1;
  const project = draft.gateProjects.find((candidate) => candidate.id === gateId && !candidate.complete);
  const end = project?.ends.find((candidate) => candidate.sectorId === HOME_SECTOR);
  const cargo = cargoByMaterial(ship);
  const material = MATERIALS.find((item) => cargo[item] > 0 && gateOutstanding(draft, gateId, item, ship.id) > 0);
  if (!project || !end || !material) return null;
  const from = { ...ship.position }; const to = { ...end.position };
  return { ...ship, state: "gateHauling", position: from, cargoMaterial: material, berth: null, transfer: null,
    leg: { from, to }, timer: travelSeconds(Math.hypot(to.x - from.x, to.y - from.y), speedFactor(ship.design)) };
}

function loadGateHauler(draft: Draft, ship: Ship): Ship {
  const gateId = ship.order?.kind === "haulGate" ? ship.order.gateId : -1;
  const project = draft.gateProjects.find((candidate) => candidate.id === gateId && !candidate.complete);
  const end = project?.ends.find((candidate) => candidate.sectorId === HOME_SECTOR);
  if (!project || !end) return { ...ship, state: "holding", order: null, berth: null, transfer: null, timer: 0, leg: null };
  if (ship.cargo > 0) return carryCargoToGate(draft, ship) ?? toParking(layoutOf(draft), draft.ships, ship);
  const outstanding = (material: "Metal" | "Ice") => gateOutstanding(draft, gateId, material, ship.id);
  const available = (material: "Metal" | "Ice") => draft.inventory[material] - draft.ships.reduce((sum, other) =>
    sum + (other.id !== ship.id && other.cargoMaterial === material && other.transfer?.startingCargo === 0
      && (other.state === "berthing" || other.state === "waiting" || other.state === "loading")
      ? Math.max(0, other.transfer.amount - other.cargo) : 0), 0);
  const material = (["Metal", "Ice"] as const).find((item) => outstanding(item) > 0 && available(item) > 0);
  if (!material) {
    const mining = depart({ ...ship, position: { ...draft.dock }, berth: null, transfer: null, cargo: 0, cargoMaterial: null, target: null, leg: null }, draft.dock, draft.asteroids, draft.ships);
    return mining.state === "idle" ? { ...mining, state: "holding", timer: 0 } : mining;
  }
  const amount = Math.min(shipStats(ship.design).hold, available(material), outstanding(material));
  const planned = { ...ship, position: { ...draft.dock }, cargo: 0, cargoByMaterial: { Metal: 0, Ice: 0 }, cargoMaterial: material,
    target: null, leg: null, transfer: { startingCargo: 0, amount } };
  return toBerth(layoutOf(draft), draft.ships, planned) ?? toParking(layoutOf(draft), draft.ships, planned);
}

// Puts up to `units` of a hauler's cargo into its gate project, which takes
// only what is still outstanding of each material.
function giveToGate(draft: Draft, ship: Ship, units: number): Ship {
  const gateId = ship.order?.kind === "haulGate" ? ship.order.gateId : -1;
  const gate = draft.gateProjects.find((candidate) => candidate.id === gateId);
  if (!gate || units <= 0) return ship;
  const delivered = { ...gate.delivered };
  const next = transferCargo(ship, units, (material, amount) => {
    const accepted = Math.min(amount, Math.max(0, GATE_COST[material] - delivered[material]));
    delivered[material] += accepted;
    return accepted;
  });
  const complete = delivered.Metal >= GATE_COST.Metal && delivered.Ice >= GATE_COST.Ice;
  draft.gateProjects = draft.gateProjects.map((candidate) => candidate.id === gate.id ? { ...candidate, delivered, complete } : candidate);
  return next;
}

// Which station's construction site this unloading feeds: the one named in
// the ship's supplyBuild order, else the one the supply default targets.
function deliverySiteStation(draft: Draft, ship: Ship): number {
  if (ship.order?.kind === "supplyBuild") return ship.order.stationId;
  if (draft.storageCapacity <= 0) return draft.activeStationId;
  return draft.supplyStation;
}

// The construction site of the station with `stationId`, Home's for 0.
function buildSiteOf(draft: Draft, stationId: number): Station["constructionSite"] {
  if (stationId === draft.activeStationId) return draft.constructionSite;
  return draft.others.find((station) => station.id === stationId)?.constructionSite ?? draft.constructionSite;
}

// Puts up to `units` of the ship's cargo into the named station's construction
// site, each material from its own count in the hold. The site has no cap, so
// it takes all.
function giveToBuildSite(draft: Draft, ship: Ship, units: number, stationId: number): Ship {
  if (units <= 0) return ship;
  const inventory = { ...buildSiteOf(draft, stationId).inventory };
  const next = transferCargo(ship, units, (material, amount) => {
    inventory[material] += amount;
    return amount;
  });
  if (stationId === draft.activeStationId) draft.constructionSite = { ...draft.constructionSite, inventory };
  else draft.others = draft.others.map((station) => (station.id === stationId
    ? { ...station, constructionSite: { ...station.constructionSite, inventory } } : station));
  return next;
}

// Where a ship that has just finished an order goes next: back along its Haul
// route if that is its default, otherwise to mining or to hold.
function resumeAfterBuildOrder(draft: Draft, ship: Ship): Ship {
  const done = { ...ship, order: null, target: null };
  const route = done.haulRoute;
  if (done.defaultBehaviour !== "haul") return afterOrder(ship, draft.dock, draft.asteroids, draft.sectors, draft.gateProjects, draft.stationSector);
  const from = route ? haulStationDetails(draft, route.from) : null;
  if (!route || !from || !haulStationDetails(draft, route.to)) return { ...done, state: "holding", timer: 0, leg: null };
  const atFrom = done.sectorId === from.sectorId && samePoint(done.position, from.position);
  return atFrom ? beginHaulLoading(draft, done) : flyHaul(done, draft, route.from, "returning");
}

// A ship on Supply construction site, with no order of its own, takes what it
// mines to the site the supply default targets instead of the Dock.
function supplying(draft: Draft, ship: Ship): boolean {
  return supplyQueueStatus(ship, draft.supplyQueue) === "supplying";
}

function samePoint(a: Vec, b: Vec): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < 0.01;
}

function flyTo(ship: Ship, from: Vec, to: Vec): Ship {
  return { ...ship, state: "homebound", position: { ...from }, berth: null, transfer: null, leg: { from: { ...from }, to: { ...to } },
    timer: travelSeconds(Math.hypot(to.x - from.x, to.y - from.y), speedFactor(ship.design)) };
}

// Arrival at the construction site starts the same unloading countdown as at
// the Dock, but takes no berth.
function arriveAtBuildSite(draft: Draft, ship: Ship): Ship {
  const site = buildSiteOf(draft, deliverySiteStation(draft, ship));
  const arrived = { ...ship, position: { ...site.position }, leg: null, berth: null };
  return arrived.cargo > 0
    ? { ...arrived, state: "unloading", transfer: { startingCargo: arrived.cargo, amount: arrived.cargo, destination: "constructionSite" }, timer: cargoTransferSeconds(arrived.cargo) }
    : resumeAfterBuildOrder(draft, { ...arrived, transfer: null });
}

// The countdown is over: the site takes the rest and the ship goes back to its
// default, or on to its next order.
function finishBuildSupply(draft: Draft, ship: Ship): Ship {
  const emptied = giveToBuildSite(draft, ship, ship.cargo, deliverySiteStation(draft, ship));
  return resumeAfterBuildOrder(draft, { ...emptied, cargo: 0, cargoByMaterial: { Metal: 0, Ice: 0 }, cargoMaterial: null, transfer: null });
}

// A supply ship with a full hold flies to the site the supply default
// targets: straight there when it is already in the site's sector, otherwise
// out to the gate first. No gate reaches the site and the hold goes home like
// any miner's, rather than the ship circling forever.
function headForBuildSite(draft: Draft, ship: Ship): Ship {
  const station = draft.supplyStation === draft.activeStationId ? undefined : draft.others.find((candidate) => candidate.id === draft.supplyStation);
  const sectorId = station ? station.sectorId : draft.stationSector;
  const point = buildSiteOf(draft, draft.supplyStation).position;
  if (ship.sectorId === sectorId) return flyTo({ ...ship, target: null }, ship.position, point);
  const route = gateRoute(draft, ship.sectorId, sectorId);
  if (!route) {
    if (ship.sectorId === HOME_SECTOR) return berth(draft, { ...ship, position: { ...draft.dock }, leg: null });
    const gate = gateRoute(draft, ship.sectorId, HOME_SECTOR)?.from ?? draft.sectors[ship.sectorId]!.gate.position;
    return flyTo(ship, ship.position, gate);
  }
  const from = { ...ship.position };
  return { ...ship, target: null, state: "moving", order: { kind: "supplyBuild", stationId: draft.supplyStation, point: { ...point }, sectorId },
    leg: { from, to: { ...route.from } }, timer: travelSeconds(Math.hypot(route.from.x - from.x, route.from.y - from.y), speedFactor(ship.design)) };
}

// Moves a ship whose timer has run out into its next state.
function finish(draft: Draft, ship: Ship): Ship {
  const route = routeOf(ship, draft.dock);
  switch (ship.state) {
    case "idle":
      // Nothing queued: a supply ship waits it out on a parking spot beside the
      // Dock, in a row of its own rather than piled on the Dock.
      if (parksForEmptyQueue(ship, draft.supplyQueue)) return toParking(layoutOf(draft), draft.ships, ship);
      return ship.defaultBehaviour === "none" ? ship
        : resumeMining(ship, draft.dock, draft.asteroids, draft.sectors, draft.gateProjects, draft.ships, draft.stationSector);
    case "holding":
      if (ship.order?.kind === "haulGate") return loadGateHauler(draft, ship);
      if (supplyQueueStatus(ship, draft.supplyQueue) === "supplying") {
        return resumeMining(ship, draft.dock, draft.asteroids, draft.sectors, draft.gateProjects, draft.ships, draft.stationSector);
      }
      return ship;
    case "docked":
      return ship;
    case "docking":
      return completeDocking(draft.ships, ship);
    case "loading": {
      const loaded = { ...ship, berth: null, transfer: null };
      return loaded.cargo > 0 ? carryCargoToGate(draft, loaded) ?? loadGateHauler(draft, loaded) : loadGateHauler(draft, loaded);
    }
    case "haulWaitingSource":
      return beginHaulLoading(draft, ship);
    case "haulWaitingFull":
      return ship.cargo > 0 ? beginHaulUnloading(draft, ship) : beginHaulLoading(draft, ship);
    case "haulLoading":
      return ship.cargo > 0 && ship.haulRoute
        ? flyHaul({ ...ship, berth: null, transfer: null }, draft, ship.haulRoute.to, "outbound")
        : { ...ship, state: "haulWaitingSource", berth: null, transfer: null, timer: 0, leg: null };
    case "haulOutbound": {
      if (!ship.haulRoute) return { ...ship, state: "holding", timer: 0, leg: null };
      const destinationId = haulCargoDestination(ship);
      const destination = destinationId ? haulStationDetails(draft, destinationId) : null;
      if (!destination) return { ...ship, state: "holding", timer: 0, leg: null };
      if (ship.sectorId !== destination.sectorId) return { ...ship, state: "haulJumpingOutbound", timer: JUMP_SECONDS,
        position: { ...(ship.leg?.to ?? ship.position) }, leg: null };
      return beginHaulUnloading(draft, { ...ship, position: { ...destination.position }, leg: null });
    }
    case "haulJumpingOutbound": {
      const destination = ship.haulRoute ? haulStationDetails(draft, ship.haulRoute.to) : null;
      if (!destination) return { ...ship, state: "holding", timer: 0, leg: null };
      const gate = gateRoute(draft, ship.sectorId, destination.sectorId)?.to;
      if (!gate) return { ...ship, state: "holding", timer: 0, leg: null };
      return flyHaul({ ...ship, sectorId: destination.sectorId, position: { ...gate } }, draft, destination.id, "outbound");
    }
    case "haulUnloading":
      if (ship.cargo > 0) return { ...ship, state: "haulWaitingFull", berth: null, transfer: null, timer: 0, leg: null };
      return ship.haulRoute
        ? flyHaul({ ...ship, cargoMaterial: null, berth: null, transfer: null }, draft, ship.haulRoute.from, "returning")
        : { ...ship, state: "holding", berth: null, transfer: null, timer: 0, leg: null };
    case "haulReturning": {
      if (!ship.haulRoute) return { ...ship, state: "holding", timer: 0, leg: null };
      const source = haulStationDetails(draft, ship.haulRoute.from);
      if (!source) return { ...ship, state: "holding", timer: 0, leg: null };
      if (ship.sectorId !== source.sectorId) return { ...ship, state: "haulJumpingReturning", timer: JUMP_SECONDS,
        position: { ...(ship.leg?.to ?? ship.position) }, leg: null };
      const arrived = { ...ship, position: { ...source.position }, leg: null };
      return ship.cargo > 0 ? beginHaulUnloading(draft, arrived) : beginHaulLoading(draft, arrived);
    }
    case "haulJumpingReturning": {
      const source = ship.haulRoute ? haulStationDetails(draft, ship.haulRoute.from) : null;
      if (!source) return { ...ship, state: "holding", timer: 0, leg: null };
      const gate = gateRoute(draft, ship.sectorId, source.sectorId)?.to;
      if (!gate) return { ...ship, state: "holding", timer: 0, leg: null };
      return flyHaul({ ...ship, sectorId: source.sectorId, position: { ...gate } }, draft, source.id, "returning");
    }
    case "jumpingOut": {
      const travel = travelOrder(ship.order);
      const targetSector = ship.target?.sectorId ?? travel?.sectorId ?? ship.sectorId;
      const routeGate = gateRoute(draft, ship.sectorId, targetSector);
      const gate = routeGate?.to ?? draft.sectors[targetSector]!.gate.position;
      const to = ship.target?.site ?? travel?.point ?? gate;
      const length = Math.hypot(to.x - gate.x, to.y - gate.y);
      return { ...ship, sectorId: targetSector, position: { ...gate }, state: ship.target ? "outbound" : "moving", leg: { from: gate, to }, timer: travelSeconds(length, speedFactor(ship.design)) };
    }
    case "jumpingHome": {
      const gate = gateRoute(draft, ship.sectorId, draft.stationSector)?.to ?? draft.sectors[draft.stationSector]!.gate.position;
      const length = Math.hypot(draft.dock.x - gate.x, draft.dock.y - gate.y);
      return { ...ship, sectorId: draft.stationSector, position: { ...gate }, state: "homebound", leg: { from: gate, to: draft.dock }, timer: travelSeconds(length, speedFactor(ship.design)) };
    }
    case "moving":
      if (ship.order && (travelOrder(ship.order)?.sectorId ?? ship.sectorId) !== ship.sectorId) {
        return { ...ship, state: "jumpingOut", timer: JUMP_SECONDS, position: { ...(ship.leg?.to ?? ship.position) }, leg: null };
      }
      if (ship.order?.kind === "supplyBuild") return arriveAtBuildSite(draft, ship);
      return { ...ship, state: "holding", position: ship.leg ? { ...ship.leg.to } : ship.position, leg: null, timer: 0 };
    case "gateHauling": {
      const position = ship.leg ? { ...ship.leg.to } : ship.position;
      if (ship.cargo > 0) return { ...ship, state: "gateUnloading", position, leg: null,
        transfer: { startingCargo: ship.cargo, amount: ship.cargo }, timer: cargoTransferSeconds(ship.cargo) };
      ship = { ...ship, position };
      const from = position;
      const to = draft.dock;
      return { ...ship, state: "gateReturning", leg: { from: { ...from }, to: { ...to } },
        timer: travelSeconds(Math.hypot(to.x - from.x, to.y - from.y), speedFactor(ship.design)) };
    }
    case "gateUnloading": {
      const gateId = ship.order?.kind === "haulGate" ? ship.order.gateId : -1;
      ship = giveToGate(draft, ship, ship.cargo);
      const complete = draft.gateProjects.find((gate) => gate.id === gateId)?.complete ?? true;
      if (complete && ship.cargo === 0) return { ...ship, state: "holding", order: null, leg: null, transfer: null, timer: 0 };
      ship = { ...ship, transfer: null };
      const from = ship.leg ? ship.leg.to : ship.position;
      const to = draft.dock;
      return { ...ship, state: "gateReturning", position: { ...from },
        leg: { from: { ...from }, to: { ...to } }, timer: travelSeconds(Math.hypot(to.x - from.x, to.y - from.y), speedFactor(ship.design)) };
    }
    case "gateReturning":
      return ship.cargo > 0
        ? berth(draft, { ...ship, position: { ...draft.dock }, leg: null })
        : loadGateHauler(draft, { ...ship, position: { ...draft.dock }, leg: null });
    case "berthing":
      return arrivesAtPark(draft, ship) ?? arrived(ship);
    case "waiting":
      // A module queued while this ship was still flying out to park, or while
      // it was waiting for a pad, means it has somewhere to be.
      if (supplyQueueStatus(ship, draft.supplyQueue) === "supplying") {
        return resumeMining(ship, draft.dock, draft.asteroids, draft.sectors, draft.gateProjects, draft.ships, draft.stationSector);
      }
      // Room can appear without any ship moving, when a Storage module
      // completes, and a berth frees up when another ship finishes unloading.
      if (ship.cargo > 0 && canProcessCargo(draft, ship)) {
        return toBerth(layoutOf(draft), draft.ships, ship) ?? ship;
      }
      if (ship.cargo === 0 && ship.order?.kind === "haulGate" && ship.transfer) {
        return toBerth(layoutOf(draft), draft.ships, ship) ?? ship;
      }
      if (ship.defaultBehaviour === "haul" && ship.transfer) {
        return toBerth(layoutOf(draft), draft.ships, ship) ?? ship;
      }
      return ship;
    case "outbound":
      if (ship.target && ship.target.sectorId !== ship.sectorId) return { ...ship, state: "jumpingOut", timer: JUMP_SECONDS, position: { ...(ship.leg?.to ?? ship.position) }, leg: null };
      const { hold } = shipStats(ship.design);
      const remainingMining = miningSeconds(ship) * (hold > 0 ? (hold - ship.cargo) / hold : 0);
      return {
        ...ship,
        state: "working",
        position: ship.leg ? { ...ship.leg.to } : route ? { ...route.site } : ship.position,
        leg: null,
        timer: remainingMining,
      };
    case "working":
      ship = addCargo(ship, ship.cargoMaterial, mine(draft, ship, shipStats(ship.design).hold - ship.cargo));
      if (ship.cargo < shipStats(ship.design).hold) {
        const rock = nextMiningRock(ship, draft.asteroids, draft.sectors, draft.gateProjects, draft.ships, ship.order?.kind === "mine");
        if (rock) return startMining(ship, rock, draft.dock, draft.sectors, draft.gateProjects);
      }
      if (ship.sectorId !== draft.stationSector) {
        const gate = gateRoute(draft, ship.sectorId, draft.stationSector)?.from ?? draft.sectors[ship.sectorId]!.gate.position;
        const length = Math.hypot(gate.x - ship.position.x, gate.y - ship.position.y);
        return { ...ship, state: "homebound", leg: { from: { ...ship.position }, to: { ...gate } }, timer: travelSeconds(length, speedFactor(ship.design)),
          order: ship.order?.kind === "mine" ? { ...ship.order, loaded: true } : ship.order };
      }
      // The site it supplies comes before the flight home, so a supplier works
      // for the selected site whatever sector it is mining in.
      if (supplying(draft, ship)) return headForBuildSite(draft, { ...ship, cargo: ship.cargo + mine(draft, ship, shipStats(ship.design).hold - ship.cargo) });
      return {
        ...ship,
        state: "homebound",
        timer: route ? route.legSeconds : 0,
        leg: null,
        order: ship.order?.kind === "mine" ? { ...ship.order, loaded: true } : ship.order,
      };
    case "homebound":
      {
        if (draft.storageCapacity <= 0 && ship.cargo > 0) {
          const ownSite = buildSiteOf(draft, draft.activeStationId);
          if (!samePoint(ship.position, ownSite.position)) return flyTo(ship, ship.position, ownSite.position);
          return arriveAtBuildSite(draft, ship);
        }
        const site = buildSiteOf(draft, draft.supplyStation).position;
        const headingForSite = ship.leg !== null && samePoint(ship.leg.to, site);
        if (supplying(draft, ship) && (headingForSite || ship.cargo > 0)) {
          return headingForSite ? arriveAtBuildSite(draft, ship) : headForBuildSite(draft, ship);
        }
        if (ship.sectorId !== draft.stationSector) return { ...ship, state: "jumpingHome", timer: JUMP_SECONDS, position: { ...(ship.leg?.to ?? ship.position) }, leg: null };
        // Heading for the site on a default it has since lost: on to the Dock.
        if (headingForSite) return flyTo(ship, ship.position, draft.dock);
      }
      // A supply ship home with nothing queued waits on a parking spot instead.
      if (parksForEmptyQueue(ship, draft.supplyQueue)) {
        return toParking(layoutOf(draft), draft.ships, { ...ship, position: { ...draft.dock }, leg: null });
      }
      if (ship.cargo > 0 && !canProcessCargo(draft, ship)) {
        return toParking(layoutOf(draft), draft.ships, { ...ship, position: { ...draft.dock }, leg: null });
      }
      const docked = { ...ship, position: { ...draft.dock }, leg: null };
      // An empty ship sent home has nothing to wait for, so with no pad free
      // it unloads at the Dock's middle rather than wait forever.
      return ship.cargo > 0 ? berth(draft, docked)
        : toBerth(layoutOf(draft), draft.ships, docked) ?? { ...docked, state: "unloading", berth: null,
          transfer: { startingCargo: 0, amount: 0 }, timer: cargoTransferSeconds(0) };
    case "unloading": {
      if (ship.transfer?.destination === "constructionSite") return finishBuildSupply(draft, ship);
      const left = afterUnloading(draft, ship);
      // The pad is free from here on. A ship with nowhere to go stays at the
      // Dock's middle, where it would have been before there were pads.
      const stays = left.state === "holding" || left.state === "idle";
      return { ...left, berth: left.state === "berthing" ? left.berth : null, position: stays ? { ...draft.dock } : left.position };
    }
  }
}

function afterUnloading(draft: Draft, ship: Ship): Ship {
  const remaining = { ...unloadCargo(draft, ship, ship.cargo), transfer: null };
  if (remaining.cargo > 0) {
    if (ship.order?.kind === "haulGate") return carryCargoToGate(draft, remaining) ?? toParking(layoutOf(draft), draft.ships, remaining);
    return toParking(layoutOf(draft), draft.ships, remaining);
  }
  const empty = { ...remaining, cargo: 0, cargoByMaterial: { Metal: 0, Ice: 0 }, cargoMaterial: null };
  if (ship.order?.kind === "haulGate") return loadGateHauler(draft, empty);
  return ship.order ? afterOrder(empty, draft.dock, draft.asteroids, draft.sectors, draft.gateProjects, draft.stationSector)
    : ship.defaultBehaviour === "none" ? { ...empty, state: "holding", order: null, leg: null, timer: 0 }
      : resumeMining(empty, draft.dock, draft.asteroids, draft.sectors, draft.gateProjects, draft.ships, draft.stationSector);
}

// Seconds until the next timer anywhere in the sector runs out.
function nextEvent(draft: Draft): number {
  let soonest = Infinity;
  for (const ship of draft.ships) {
    if (ship.state !== "idle" && ship.state !== "waiting" && ship.state !== "holding" && ship.state !== "docked"
      && ship.state !== "haulWaitingSource" && ship.state !== "haulWaitingFull") soonest = Math.min(soonest, ship.timer);
  }
  for (const respawn of draft.respawns) soonest = Math.min(soonest, respawn.timer);
  if (draft.construction) soonest = Math.min(soonest, draft.construction.timer);
  for (const station of draft.others) {
    if (station.construction) soonest = Math.min(soonest, station.construction.timer);
    for (const job of station.shipBuilds) soonest = Math.min(soonest, job.timer);
  }
  for (const job of draft.shipBuilds) soonest = Math.min(soonest, job.timer);
  return soonest;
}

function advance(draft: Draft, seconds: number): void {
  draft.time += seconds;
  draft.respawns = draft.respawns.map((r) => ({ ...r, timer: r.timer - seconds }));
  draft.ships = draft.ships.map((ship) => forShipHome(draft, ship, () => progress(draft, ship, ship.timer - seconds)));
  if (draft.construction) {
    draft.construction = { ...draft.construction, timer: draft.construction.timer - seconds };
  }
  draft.shipBuilds = draft.shipBuilds.map((job) => ({ ...job, timer: job.timer - seconds }));
  // A founding station's own first Dock and Storage build on its site stock.
  draft.others = draft.others.map((station) => (station.construction
    ? { ...station, construction: { ...station.construction, timer: station.construction.timer - seconds }, shipBuilds: station.shipBuilds.map((job) => ({ ...job, timer: job.timer - seconds })) }
    : { ...station, shipBuilds: station.shipBuilds.map((job) => ({ ...job, timer: job.timer - seconds })) }));
}

// Fires every timer that has reached zero. Respawns go first so a ship that
// becomes free at the same moment can head for the new asteroid.
function settle(draft: Draft): void {
  draft.others = draft.others.map(settleStationBuild);
  if (draft.construction && draft.construction.timer <= 0) {
    // A module that has lost its footing is given back to the site rather than
    // finished off the station, which is the one place a build can end up
    // unattached no matter how the queue got there.
    if (constructionAttached(draft)) completeBuild(draft);
    else refundDetachedBuild(draft);
  }
  const due = draft.respawns.filter((r) => r.timer <= 0);
  draft.respawns = draft.respawns.filter((r) => r.timer > 0);
  for (const respawn of due) {
    const field = draft.fields.find((candidate) => candidate.id === respawn.fieldId)!;
    const placed = placeInField(
      draft.rng,
      field,
      [respawn.lastPosition, ...draft.asteroids.filter((a) => a.sectorId === respawn.sectorId).map((a) => a.position)],
      [
        ...(respawn.sectorId === HOME_SECTOR
          ? [...draft.modules.map((module) => module.position), draft.constructionSite.position, ...(draft.construction ? [draft.construction.position] : [])]
          : []),
        // Every station body in the sector keeps the field clear, the way a
        // built site's slots did.
        ...draft.others.filter((station) => station.sectorId === respawn.sectorId)
          .flatMap((station) => [
            ...station.modules.map((module) => module.position),
            station.constructionSite.position,
            ...(station.construction ? [station.construction.position] : []),
            ...station.buildQueue.map((queued) => queued.position),
          ]),
      ],
    );
    if (!placed) {
      // The station covers the field. Ask again later instead of putting the
      // rock outside its belt or cluster.
      draft.respawns = [...draft.respawns, { ...respawn, timer: RESPAWN_SECONDS }];
      continue;
    }
    draft.rng = placed.rng;
    const material = nextRandom(draft.rng);
    draft.rng = material.state;
    const { abundant } = draft.sectors[respawn.sectorId]!.character;
    const other = abundant === "Metal" ? "Ice" : "Metal";
    draft.asteroids = [
      ...draft.asteroids,
      newAsteroid(draft.nextAsteroidId, respawn.sectorId, respawn.fieldId, placed.position,
        material.value < ABUNDANT_SHARE ? abundant : other, respawn.rich),
    ];
    draft.nextAsteroidId += 1;
  }
  // A finished ship appears at the Dock with nothing to do, and the loop
  // below sends it out in the same step.
  const completedShipBuilds = [
    ...draft.shipBuilds.filter((job) => job.timer <= 0).map((job) => ({ ...job, stationId: job.stationId ?? 0 })),
    ...draft.others.flatMap((station) => station.shipBuilds.filter((job) => job.timer <= 0).map((job) => ({ ...job, stationId: station.id }))),
  ];
  for (const job of completedShipBuilds) {
    const station = job.stationId === 0 ? null : draft.others.find((candidate) => candidate.id === job.stationId);
    const dock = station?.dock.position ?? draft.dock;
    draft.ships = [...draft.ships, {
      id: draft.nextShipId,
      homeStationId: job.stationId,
      sectorId: station?.sectorId ?? draft.stationSector,
      design: job.design,
      state: "idle",
      position: { ...dock },
      timer: 0,
      cargo: 0,
      cargoByMaterial: { Metal: 0, Ice: 0 },
      cargoMaterial: null,
      target: null,
      defaultBehaviour: "mine",
      mineMaterials: [],
      mineOtherSectors: false,
      order: null,
      leg: null,
      berth: null,
      transfer: null,
    }];
    draft.nextShipId += 1;
  }
  draft.shipBuilds = draft.shipBuilds.filter((job) => job.timer > 0);
  draft.others = draft.others.map((station) => ({ ...station, shipBuilds: station.shipBuilds.filter((job) => job.timer > 0) }));
  // In place and in fleet order, so each ship sees the berths and rocks the
  // ships before it have just taken.
  draft.ships = [...draft.ships];
  for (let i = 0; i < draft.ships.length; i += 1) {
    const ship = draft.ships[i]!;
    if (ship.timer <= 0) draft.ships[i] = forShipHome(draft, ship, () => finish(draft, ship));
  }
  settleQueuedBuild(draft);
}

// Steps from one timer running out to the next, so a large dt (a tab coming
// back from the background) plays out every trip and respawn it covers, in
// the order they would have happened.
export function tick(state: SimState, dt: number): SimState {
  if (state.stations.length === 0) return {
    ...state,
    tickCount: state.tickCount + 1,
    time: state.time + (dt > 0 ? dt : 0),
    ships: state.ships.map((ship) => ({ ...ship, state: "holding", timer: 0, order: null, target: null, leg: null, berth: null, transfer: null })),
  };
  const home = state.stations.find((station) => station.id === 0) ?? state.stations[0]!;
  const primaryStationId = home.id;
  const draft: Draft = {
    time: state.time,
    activeStationId: primaryStationId,
    primaryStationId,
    deliveries: home.deliveries,
    rng: state.rng,
    nextAsteroidId: state.nextAsteroidId,
    nextShipId: state.nextShipId,
    dock: home.dock.position,
    stationSector: home.sectorId,
    storageCapacity: home.storage.capacity,
    storageLimits: home.storageLimits,
    inventory: home.inventory,
    constructionSite: home.constructionSite,
    asteroids: state.asteroids,
    respawns: state.respawns,
    fields: state.fields,
    ships: state.ships,
    modules: home.modules,
    construction: home.construction,
    buildQueue: home.buildQueue,
    shipBuilds: home.shipBuilds,
    dockCapacity: home.dock.capacity,
    sectors: state.sectors,
    gateProjects: state.gateProjects,
    // Every non-Home station, kept whole. Founding ones advance their own
    // first Dock and Storage; founded ones only move haul stock this tick.
    others: state.stations.filter((station) => station.id !== primaryStationId),
    supplyStation: state.supplyStation,
    supplyQueue: state.supplyStation === 0 ? home.buildQueue.length
      : state.stations.find((station) => station.id === state.supplyStation)?.buildQueue.length ?? 0,
  };

  // A negative or NaN dt would wind timers backwards, so it counts as no time.
  let remaining = dt > 0 ? dt : 0;
  do {
    const step = Math.min(remaining, nextEvent(draft));
    advance(draft, step);
    remaining -= step;
    settle(draft);
  } while (remaining > 0);

  return {
    ...state,
    tickCount: state.tickCount + 1,
    time: draft.time,
    rng: draft.rng,
    nextAsteroidId: draft.nextAsteroidId,
    nextShipId: draft.nextShipId,
    stations: state.stations.map((station) => station.id === primaryStationId ? {
      ...home,
      dock: { ...home.dock, capacity: draft.dockCapacity },
      storage: { ...home.storage, capacity: draft.storageCapacity },
      inventory: draft.inventory,
      constructionSite: draft.constructionSite,
      deliveries: draft.deliveries.filter((delivery) => delivery.at > draft.time - INCOME_WINDOW_SECONDS),
      modules: draft.modules,
      construction: draft.construction,
      buildQueue: draft.buildQueue,
      shipBuilds: draft.shipBuilds,
    } : draft.others.find((other) => other.id === station.id) ?? station),
    asteroids: draft.asteroids,
    respawns: draft.respawns,
    ships: syncDockedShips(draft.ships),
    gateProjects: draft.gateProjects,
  };
}
