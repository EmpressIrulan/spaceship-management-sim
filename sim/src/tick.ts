import { advanceSites, deliverToSite, nextSiteEvent, settleSites, claimSiteSlots } from "./claim";
import { haulCargoDestination } from "./haul";
import { distanceAlong, travelSeconds } from "./motion";
import { afterOrder, nextMiningRock, resumeMining, startMining, travelOrder } from "./orders";
import { nextRandom } from "./prng";
import { cargoTransferSeconds, shipStats, speedFactor } from "./ship";
import {
  ABUNDANT_SHARE,
  DOCK_CAPACITY,
  GATE_COST,
  JUMP_SECONDS,
  HOME_SECTOR,
  INCOME_WINDOW_SECONDS,
  MATERIALS,
  RESPAWN_SECONDS,
  STORAGE_CAPACITY,
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

// Only called for a ship that can mine, so it has a Laser.
function miningSeconds(ship: Ship): number {
  return shipStats(ship.design).miningSeconds ?? 0;
}

// Mutable copy of the parts of SimState that one tick changes. Built fresh
// from the input, so the caller's state is never touched.
interface Draft {
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
  inventory: SimState["station"]["inventory"];
  asteroids: Asteroid[];
  respawns: SimState["respawns"];
  fields: SimState["fields"];
  ships: Ship[];
  modules: Station["modules"];
  construction: Station["construction"];
  shipBuilds: Station["shipBuilds"];
  dockCapacity: number;
  sectors: SimState["sectors"];
  gateProjects: SimState["gateProjects"];
  claimSites: SimState["claimSites"];
}

// Takes up to `units` of ore from the asteroid a ship is mining and returns
// how many it got, removing the asteroid and queueing its replacement once it
// is empty. A ship whose asteroid is already gone gets nothing.
function mine(draft: Draft, ship: Ship, units: number): number {
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

function asteroidGone(draft: Draft, ship: Ship): boolean {
  return !draft.asteroids.some((a) => a.id === ship.target?.asteroidId);
}

function storageRemaining(draft: Draft): number {
  const stored = Object.values(draft.inventory).reduce((total, amount) => total + amount, 0);
  return Math.max(0, draft.storageCapacity - stored);
}

function layoutOf(draft: Draft): BerthLayout {
  return { dock: draft.dock, modules: draft.modules, capacity: draft.dockCapacity };
}

// Puts a ship home with cargo on a free pad, or parks it to wait for one.
function berth(draft: Draft, ship: Ship): Ship {
  return toBerth(layoutOf(draft), draft.ships, ship) ?? toParking(layoutOf(draft), draft.ships, ship);
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

function withCargo(ship: Ship, cargo: Record<"Metal" | "Ice", number>): Ship {
  const total = cargo.Metal + cargo.Ice;
  const active = ship.cargoMaterial && cargo[ship.cargoMaterial] > 0 ? ship.cargoMaterial
    : MATERIALS.find((material) => cargo[material] > 0) ?? null;
  return { ...ship, cargo: total, cargoByMaterial: cargo, cargoMaterial: active };
}

function transferCargo(
  ship: Ship,
  units: number,
  transfer: (material: "Metal" | "Ice", amount: number) => number,
): Ship {
  const cargo = cargoByMaterial(ship);
  let left = units;
  for (const material of MATERIALS) {
    const moved = transfer(material, Math.min(left, cargo[material]));
    cargo[material] -= moved;
    left -= moved;
  }
  return withCargo(ship, cargo);
}

function addCargo(ship: Ship, material: "Metal" | "Ice" | null, amount: number): Ship {
  if (!material || amount <= 0) return ship;
  const cargo = cargoByMaterial(ship);
  cargo[material] += amount;
  return { ...withCargo(ship, cargo), cargoMaterial: ship.cargoMaterial ?? material };
}

function canProcessCargo(draft: Draft, ship: Ship): boolean {
  const cargo = cargoByMaterial(ship);
  return storageRemaining(draft) > 0 || MATERIALS.some((material) => cargo[material] > 0
    && draft.storageLimits[material] !== null && draft.inventory[material] >= draft.storageLimits[material]!);
}

function haulEnd(draft: Draft, id: HaulStationId) {
  if (id === "home") return { id, sectorId: draft.stationSector, position: draft.dock, inventory: draft.inventory, capacity: draft.storageCapacity };
  const site = draft.claimSites.find((candidate) => `claim:${candidate.id}` === id && candidate.stage >= 2);
  return site ? { id, sectorId: site.sectorId, position: site.position, inventory: site.delivered, capacity: STORAGE_CAPACITY } : null;
}

function haulStored(end: NonNullable<ReturnType<typeof haulEnd>>): number {
  return end.inventory.Metal + end.inventory.Ice;
}

function changeHaulInventory(draft: Draft, id: HaulStationId, material: "Metal" | "Ice", amount: number): void {
  if (id === "home") {
    draft.inventory = { ...draft.inventory, [material]: draft.inventory[material] + amount };
    return;
  }
  const siteId = Number(id.slice("claim:".length));
  draft.claimSites = draft.claimSites.map((site) => site.id === siteId
    ? { ...site, delivered: { ...site.delivered, [material]: site.delivered[material] + amount } } : site);
}

function loadHauler(draft: Draft, ship: Ship, units: number): number {
  const route = ship.haulRoute;
  const source = route ? haulEnd(draft, route.from) : null;
  if (!route || !source || units <= 0) return 0;
  const taken = Math.min(units, source.inventory[route.material]);
  changeHaulInventory(draft, route.from, route.material, -taken);
  return taken;
}

function unloadHauler(draft: Draft, ship: Ship, units: number): Ship {
  const destinationId = haulCargoDestination(ship);
  const destination = destinationId ? haulEnd(draft, destinationId) : null;
  if (!destinationId || !destination || units <= 0) return ship;
  let room = Math.max(0, destination.capacity - haulStored(destination));
  return transferCargo(ship, units, (material, amount) => {
    const accepted = Math.min(amount, room);
    changeHaulInventory(draft, destinationId, material, accepted);
    room -= accepted;
    return accepted;
  });
}

function flyHaul(draft: Draft, ship: Ship, id: HaulStationId, state: "haulOutbound" | "haulReturning"): Ship {
  const end = haulEnd(draft, id);
  if (!end) return { ...ship, state: "holding", timer: 0, leg: null };
  const route = ship.sectorId === end.sectorId ? null : gateRoute(draft, ship.sectorId, end.sectorId);
  if (ship.sectorId !== end.sectorId && !route) return { ...ship, state: "holding", timer: 0, leg: null };
  const from = { ...ship.position }; const to = { ...(route?.from ?? end.position) };
  return { ...ship, state, berth: null, transfer: null, leg: { from, to },
    timer: travelSeconds(Math.hypot(to.x - from.x, to.y - from.y), speedFactor(ship.design)) };
}

function startHaulTransfer(draft: Draft, ship: Ship, stationId: HaulStationId, loading: boolean): Ship {
  const amount = loading ? shipStats(ship.design).hold : ship.cargo;
  const planned = { ...ship, cargoMaterial: loading ? ship.haulRoute?.material ?? null : ship.cargoMaterial,
    transfer: { startingCargo: loading ? 0 : ship.cargo, amount } };
  if (stationId === "home") return berth(draft, planned);
  return { ...planned, state: loading ? "haulLoading" : "haulUnloading", berth: null, leg: null,
    timer: cargoTransferSeconds(amount) };
}

function beginHaulLoading(draft: Draft, ship: Ship): Ship {
  const route = ship.haulRoute;
  const source = route ? haulEnd(draft, route.from) : null;
  const destination = route ? haulEnd(draft, route.to) : null;
  if (!route || !source || !destination) return { ...ship, state: "holding", timer: 0, leg: null };
  if (haulStored(destination) >= destination.capacity) return { ...ship, state: "haulWaitingFull", timer: 0, leg: null, cargoMaterial: null };
  if (source.inventory[route.material] < shipStats(ship.design).hold) return { ...ship, state: "haulWaitingSource", timer: 0, leg: null, cargoMaterial: null };
  return startHaulTransfer(draft, ship, route.from, true);
}

function beginHaulUnloading(draft: Draft, ship: Ship): Ship {
  const destinationId = haulCargoDestination(ship);
  const destination = destinationId ? haulEnd(draft, destinationId) : null;
  return !destinationId || !destination || haulStored(destination) >= destination.capacity
    ? { ...ship, state: "haulWaitingFull", timer: 0, leg: null }
    : startHaulTransfer(draft, ship, destinationId, false);
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
    case "outbound":
    case "homebound":
    case "berthing":
    case "moving":
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
      if (ship.order?.kind === "supplySite") {
        const targetCargo = Math.max(0, (ship.transfer?.startingCargo ?? ship.cargo) - transferDone(ship, timer));
        return { ...giveToSite(draft, ship, ship.cargo - targetCargo), timer };
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

function gateOutstanding(draft: Draft, gateId: number, material: "Metal" | "Ice", shipId: number): number {
  const project = draft.gateProjects.find((candidate) => candidate.id === gateId);
  if (!project) return 0;
  return GATE_COST[material] - project.delivered[material]
    - draft.ships.reduce((sum, other) => {
      if (other.id === shipId || other.order?.kind !== "haulGate" || other.order.gateId !== gateId) return sum;
      if ((other.state === "berthing" || other.state === "waiting" || other.state === "loading")
        && other.transfer?.startingCargo === 0) return other.cargoMaterial === material ? sum + other.transfer.amount : sum;
      return other.state === "gateHauling" || other.state === "gateUnloading" ? sum + cargoByMaterial(other)[material] : sum;
    }, 0);
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

// Puts up to `units` of the ship's cargo into the site it is ordered to and
// returns how many the site took.
function giveToSite(draft: Draft, ship: Ship, units: number): Ship {
  const siteId = ship.order?.kind === "supplySite" ? ship.order.siteId : -1;
  let site = draft.claimSites.find((candidate) => candidate.id === siteId);
  if (!site) return ship;
  const next = transferCargo(ship, units, (material, amount) => {
    const delivered = deliverToSite(site!, material, amount);
    site = delivered.site;
    return delivered.accepted;
  });
  draft.claimSites = draft.claimSites.map((candidate) => (candidate.id === siteId ? site! : candidate));
  return next;
}

// Arrival at a site starts the same unloading countdown as at the Dock.
function arriveAtSite(draft: Draft, ship: Ship): Ship {
  return ship.cargo > 0
    ? { ...ship, state: "unloading", transfer: { startingCargo: ship.cargo, amount: ship.cargo }, timer: cargoTransferSeconds(ship.cargo) }
    : afterOrder(ship, draft.dock, draft.asteroids, draft.sectors, draft.gateProjects);
}

// The countdown is over: the site takes what it can of the rest and the ship moves on.
function finishSupply(draft: Draft, ship: Ship): Ship {
  return afterOrder({ ...giveToSite(draft, ship, ship.cargo), transfer: null }, draft.dock, draft.asteroids, draft.sectors, draft.gateProjects);
}

// Moves a ship whose timer has run out into its next state.
function finish(draft: Draft, ship: Ship): Ship {
  const route = routeOf(ship, draft.dock);
  switch (ship.state) {
    case "idle":
      return ship.defaultBehaviour === "none" ? ship
        : resumeMining(ship, draft.dock, draft.asteroids, draft.sectors, draft.gateProjects, draft.ships);
    case "holding":
      if (ship.order?.kind === "haulGate") return loadGateHauler(draft, ship);
      return ship;
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
        ? flyHaul(draft, { ...ship, berth: null, transfer: null }, ship.haulRoute.to, "haulOutbound")
        : { ...ship, state: "haulWaitingSource", berth: null, transfer: null, timer: 0, leg: null };
    case "haulOutbound": {
      if (!ship.haulRoute) return { ...ship, state: "holding", timer: 0, leg: null };
      const destinationId = haulCargoDestination(ship);
      const destination = destinationId ? haulEnd(draft, destinationId) : null;
      if (!destination) return { ...ship, state: "holding", timer: 0, leg: null };
      if (ship.sectorId !== destination.sectorId) return { ...ship, state: "haulJumpingOutbound", timer: JUMP_SECONDS,
        position: { ...(ship.leg?.to ?? ship.position) }, leg: null };
      return beginHaulUnloading(draft, { ...ship, position: { ...destination.position }, leg: null });
    }
    case "haulJumpingOutbound": {
      const destination = ship.haulRoute ? haulEnd(draft, ship.haulRoute.to) : null;
      if (!destination) return { ...ship, state: "holding", timer: 0, leg: null };
      const gate = gateRoute(draft, ship.sectorId, destination.sectorId)?.to;
      if (!gate) return { ...ship, state: "holding", timer: 0, leg: null };
      return flyHaul(draft, { ...ship, sectorId: destination.sectorId, position: { ...gate } }, destination.id, "haulOutbound");
    }
    case "haulUnloading":
      if (ship.cargo > 0) return { ...ship, state: "haulWaitingFull", berth: null, transfer: null, timer: 0, leg: null };
      return ship.haulRoute
        ? flyHaul(draft, { ...ship, cargoMaterial: null, berth: null, transfer: null }, ship.haulRoute.from, "haulReturning")
        : { ...ship, state: "holding", berth: null, transfer: null, timer: 0, leg: null };
    case "haulReturning": {
      if (!ship.haulRoute) return { ...ship, state: "holding", timer: 0, leg: null };
      const source = haulEnd(draft, ship.haulRoute.from);
      if (!source) return { ...ship, state: "holding", timer: 0, leg: null };
      if (ship.sectorId !== source.sectorId) return { ...ship, state: "haulJumpingReturning", timer: JUMP_SECONDS,
        position: { ...(ship.leg?.to ?? ship.position) }, leg: null };
      const arrived = { ...ship, position: { ...source.position }, leg: null };
      return ship.cargo > 0 ? beginHaulUnloading(draft, arrived) : beginHaulLoading(draft, arrived);
    }
    case "haulJumpingReturning": {
      const source = ship.haulRoute ? haulEnd(draft, ship.haulRoute.from) : null;
      if (!source) return { ...ship, state: "holding", timer: 0, leg: null };
      const gate = gateRoute(draft, ship.sectorId, source.sectorId)?.to;
      if (!gate) return { ...ship, state: "holding", timer: 0, leg: null };
      return flyHaul(draft, { ...ship, sectorId: source.sectorId, position: { ...gate } }, source.id, "haulReturning");
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
      const gate = gateRoute(draft, ship.sectorId, HOME_SECTOR)?.to ?? draft.sectors[HOME_SECTOR]!.gate.position;
      const length = Math.hypot(draft.dock.x - gate.x, draft.dock.y - gate.y);
      return { ...ship, sectorId: HOME_SECTOR, position: { ...gate }, state: "homebound", leg: { from: gate, to: draft.dock }, timer: travelSeconds(length, speedFactor(ship.design)) };
    }
    case "moving":
      if (ship.order && (travelOrder(ship.order)?.sectorId ?? ship.sectorId) !== ship.sectorId) {
        return { ...ship, state: "jumpingOut", timer: JUMP_SECONDS, position: { ...(ship.leg?.to ?? ship.position) }, leg: null };
      }
      if (ship.order?.kind === "supplySite") return arriveAtSite(draft, { ...ship, position: ship.leg ? { ...ship.leg.to } : ship.position, leg: null });
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
      return arrived(ship);
    case "waiting":
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
      if (ship.sectorId !== HOME_SECTOR) {
        const gate = gateRoute(draft, ship.sectorId, HOME_SECTOR)?.from ?? draft.sectors[ship.sectorId]!.gate.position;
        const length = Math.hypot(gate.x - ship.position.x, gate.y - ship.position.y);
        return { ...ship, state: "homebound", leg: { from: { ...ship.position }, to: { ...gate } }, timer: travelSeconds(length, speedFactor(ship.design)),
          order: ship.order?.kind === "mine" ? { ...ship.order, loaded: true } : ship.order };
      }
      return {
        ...ship,
        state: "homebound",
        timer: route ? route.legSeconds : 0,
        leg: null,
        order: ship.order?.kind === "mine" ? { ...ship.order, loaded: true } : ship.order,
      };
    case "homebound":
      if (ship.sectorId !== HOME_SECTOR) return { ...ship, state: "jumpingHome", timer: JUMP_SECONDS, position: { ...(ship.leg?.to ?? ship.position) }, leg: null };
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
      if (ship.order?.kind === "supplySite") return finishSupply(draft, ship);
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
  return ship.order ? afterOrder(empty, draft.dock, draft.asteroids, draft.sectors, draft.gateProjects)
    : ship.defaultBehaviour === "none" ? { ...empty, state: "holding", order: null, leg: null, timer: 0 }
      : resumeMining(empty, draft.dock, draft.asteroids, draft.sectors, draft.gateProjects, draft.ships);
}

// Seconds until the next timer anywhere in the sector runs out.
function nextEvent(draft: Draft): number {
  let soonest = Infinity;
  for (const ship of draft.ships) {
    if (ship.state !== "idle" && ship.state !== "waiting" && ship.state !== "holding"
      && ship.state !== "haulWaitingSource" && ship.state !== "haulWaitingFull") soonest = Math.min(soonest, ship.timer);
  }
  for (const respawn of draft.respawns) soonest = Math.min(soonest, respawn.timer);
  if (draft.construction) soonest = Math.min(soonest, draft.construction.timer);
  for (const job of draft.shipBuilds) soonest = Math.min(soonest, job.timer);
  return Math.min(soonest, nextSiteEvent(draft.claimSites));
}

function advance(draft: Draft, seconds: number): void {
  draft.time += seconds;
  draft.respawns = draft.respawns.map((r) => ({ ...r, timer: r.timer - seconds }));
  draft.ships = draft.ships.map((ship) => progress(draft, ship, ship.timer - seconds));
  if (draft.construction) {
    draft.construction = { ...draft.construction, timer: draft.construction.timer - seconds };
  }
  draft.shipBuilds = draft.shipBuilds.map((job) => ({ ...job, timer: job.timer - seconds }));
  draft.claimSites = advanceSites(draft.claimSites, seconds);
}

// Fires every timer that has reached zero. Respawns go first so a ship that
// becomes free at the same moment can head for the new asteroid.
function settle(draft: Draft): void {
  draft.claimSites = settleSites(draft.claimSites);
  if (draft.construction && draft.construction.timer <= 0) {
    const { timer: _timer, ...module } = draft.construction;
    draft.modules = [...draft.modules, module];
    if (module.type === "Storage") draft.storageCapacity += STORAGE_CAPACITY;
    if (module.type === "Dock") draft.dockCapacity += DOCK_CAPACITY;
    draft.construction = null;
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
          ? [...draft.modules.map((module) => module.position), ...(draft.construction ? [draft.construction.position] : [])]
          : []),
        ...draft.claimSites.filter((site) => site.sectorId === respawn.sectorId)
          .flatMap((site) => [site.position, ...claimSiteSlots(site).map((slot) => slot.position)]),
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
  for (const job of draft.shipBuilds.filter((j) => j.timer <= 0)) {
    draft.ships = [...draft.ships, {
      id: draft.nextShipId,
      sectorId: 0,
      design: job.design,
      state: "idle",
      position: { ...draft.dock },
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
  // In place and in fleet order, so each ship sees the berths and rocks the
  // ships before it have just taken.
  draft.ships = [...draft.ships];
  for (let i = 0; i < draft.ships.length; i += 1) {
    const ship = draft.ships[i]!;
    if (ship.timer <= 0) draft.ships[i] = finish(draft, ship);
  }
}

// Steps from one timer running out to the next, so a large dt (a tab coming
// back from the background) plays out every trip and respawn it covers, in
// the order they would have happened.
export function tick(state: SimState, dt: number): SimState {
  const draft: Draft = {
    time: state.time,
    deliveries: state.station.deliveries,
    rng: state.rng,
    nextAsteroidId: state.nextAsteroidId,
    nextShipId: state.nextShipId,
    dock: state.station.dock.position,
    stationSector: state.station.sectorId,
    storageCapacity: state.station.storage.capacity,
    storageLimits: state.station.storageLimits,
    inventory: state.station.inventory,
    asteroids: state.asteroids,
    respawns: state.respawns,
    fields: state.fields,
    ships: state.ships,
    modules: state.station.modules,
    construction: state.station.construction,
    shipBuilds: state.station.shipBuilds,
    dockCapacity: state.station.dock.capacity,
    sectors: state.sectors,
    gateProjects: state.gateProjects,
    claimSites: state.claimSites,
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
    station: {
      ...state.station,
      dock: { ...state.station.dock, capacity: draft.dockCapacity },
      storage: { ...state.station.storage, capacity: draft.storageCapacity },
      inventory: draft.inventory,
      deliveries: draft.deliveries.filter((delivery) => delivery.at > draft.time - INCOME_WINDOW_SECONDS),
      modules: draft.modules,
      construction: draft.construction,
      shipBuilds: draft.shipBuilds,
    },
    asteroids: draft.asteroids,
    respawns: draft.respawns,
    ships: draft.ships,
    gateProjects: draft.gateProjects,
    claimSites: draft.claimSites,
  };
}
