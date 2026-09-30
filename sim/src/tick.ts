import { distanceAlong, travelSeconds } from "./motion";
import { afterOrder } from "./orders";
import { nextRandom } from "./prng";
import { shipStats, speedFactor, unloadingSeconds } from "./ship";
import {
  ASTEROID_ORE,
  ASTEROID_SIZE,
  DOCK_CAPACITY,
  GATE_COST,
  JUMP_SECONDS,
  HOME_SECTOR,
  RESPAWN_SECONDS,
  STORAGE_CAPACITY,
  depart,
  gateRoute,
  placeAsteroid,
  type Asteroid,
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
  return Math.floor(hold * (1 - timer / duration) + 1e-9);
}

// Only called for a ship that can mine, so it has a Laser.
function miningSeconds(ship: Ship): number {
  return shipStats(ship.design).miningSeconds ?? 0;
}

// Mutable copy of the parts of SimState that one tick changes. Built fresh
// from the input, so the caller's state is never touched.
interface Draft {
  rng: number;
  nextAsteroidId: number;
  nextShipId: number;
  // The Dock module's position, the station's home point and route origin.
  dock: Vec;
  storageCapacity: number;
  inventory: SimState["station"]["inventory"];
  asteroids: Asteroid[];
  respawns: SimState["respawns"];
  ships: Ship[];
  modules: Station["modules"];
  construction: Station["construction"];
  shipBuilds: Station["shipBuilds"];
  dockCapacity: number;
  sectors: SimState["sectors"];
  gateProjects: SimState["gateProjects"];
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
  draft.respawns = [...draft.respawns, { sectorId: asteroid.sectorId, timer: RESPAWN_SECONDS, lastPosition: asteroid.position }];
  return taken;
}

function asteroidGone(draft: Draft, ship: Ship): boolean {
  return !draft.asteroids.some((a) => a.id === ship.target?.asteroidId);
}

function storageRemaining(draft: Draft): number {
  const stored = Object.values(draft.inventory).reduce((total, amount) => total + amount, 0);
  return Math.max(0, draft.storageCapacity - stored);
}

function berthFree(draft: Draft): boolean {
  return draft.ships.filter((ship) => ship.state === "unloading").length < draft.dockCapacity;
}

function unload(draft: Draft, ship: Ship, units: number): number {
  if (units <= 0 || !ship.cargoMaterial) return 0;
  const accepted = Math.min(units, storageRemaining(draft));
  draft.inventory = {
    ...draft.inventory,
    [ship.cargoMaterial]: draft.inventory[ship.cargoMaterial] + accepted,
  };
  return accepted;
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
      return { ...ship, timer };
    case "outbound":
    case "homebound":
    case "moving":
    case "gateHauling":
    case "gateReturning": {
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
      const cargo = ship.cargo + mine(draft, ship, unitsDone(timer, miningSeconds(ship), hold) - ship.cargo);
      // Out of ore before the hold is full: stop now and head home with what is aboard.
      const done = cargo < hold && asteroidGone(draft, ship);
      return { ...ship, timer: done ? 0 : timer, cargo };
    }
    case "unloading": {
      // A partial load unloads at the same rate per unit, so it only starts
      // dropping once the countdown reaches what is aboard.
      const { hold } = shipStats(ship.design);
      const targetCargo = Math.min(ship.cargo, hold - unitsDone(timer, unloadingSeconds(ship.design), hold));
      const unloaded = unload(draft, ship, ship.cargo - targetCargo);
      return { ...ship, timer, cargo: ship.cargo - unloaded };
    }
  }
}

function gateOutstanding(draft: Draft, gateId: number, material: "Metal" | "Ice", shipId: number): number {
  const project = draft.gateProjects.find((candidate) => candidate.id === gateId);
  if (!project) return 0;
  return GATE_COST[material] - project.delivered[material]
    - draft.ships.reduce((sum, other) => sum + (other.id !== shipId && other.state === "gateHauling" && other.order?.kind === "haulGate"
      && other.order.gateId === gateId && other.cargoMaterial === material ? other.cargo : 0), 0);
}

function carryCargoToGate(draft: Draft, ship: Ship): Ship | null {
  const gateId = ship.order?.kind === "haulGate" ? ship.order.gateId : -1;
  const project = draft.gateProjects.find((candidate) => candidate.id === gateId && !candidate.complete);
  const end = project?.ends.find((candidate) => candidate.sectorId === HOME_SECTOR);
  if (!project || !end || !ship.cargoMaterial || gateOutstanding(draft, gateId, ship.cargoMaterial, ship.id) <= 0) return null;
  const from = { ...draft.dock }; const to = { ...end.position };
  return { ...ship, state: "gateHauling", position: from,
    leg: { from, to }, timer: travelSeconds(Math.hypot(to.x - from.x, to.y - from.y), speedFactor(ship.design)) };
}

function loadGateHauler(draft: Draft, ship: Ship): Ship {
  const gateId = ship.order?.kind === "haulGate" ? ship.order.gateId : -1;
  const project = draft.gateProjects.find((candidate) => candidate.id === gateId && !candidate.complete);
  const end = project?.ends.find((candidate) => candidate.sectorId === HOME_SECTOR);
  if (!project || !end) return { ...ship, state: "holding", order: null, timer: 0, leg: null };
  if (ship.cargo > 0) return carryCargoToGate(draft, ship) ?? { ...ship, state: "waiting", timer: 0, leg: null };
  const outstanding = (material: "Metal" | "Ice") => gateOutstanding(draft, gateId, material, ship.id);
  const material = (["Metal", "Ice"] as const).find((item) => outstanding(item) > 0 && draft.inventory[item] > 0);
  if (!material) {
    const mining = depart({ ...ship, position: { ...draft.dock }, cargo: 0, cargoMaterial: null, target: null, leg: null }, draft.dock, draft.asteroids, draft.ships);
    return mining.state === "idle" ? { ...mining, state: "holding", timer: 0 } : mining;
  }
  const cargo = Math.min(shipStats(ship.design).hold, draft.inventory[material], outstanding(material));
  draft.inventory = { ...draft.inventory, [material]: draft.inventory[material] - cargo };
  const from = { ...draft.dock }; const to = { ...end.position };
  return { ...ship, state: "gateHauling", position: from, cargo, cargoMaterial: material,
    leg: { from, to }, timer: travelSeconds(Math.hypot(to.x - from.x, to.y - from.y), speedFactor(ship.design)) };
}

// Moves a ship whose timer has run out into its next state.
function finish(draft: Draft, ship: Ship): Ship {
  const route = routeOf(ship, draft.dock);
  switch (ship.state) {
    case "idle":
      return ship.defaultBehaviour === "none" ? ship : depart(ship, draft.dock, draft.asteroids, draft.ships);
    case "holding":
      if (ship.order?.kind === "haulGate") return loadGateHauler(draft, ship);
      return ship;
    case "jumpingOut": {
      const targetSector = ship.target?.sectorId ?? (ship.order?.kind === "move" ? ship.order.sectorId : ship.sectorId);
      const routeGate = gateRoute(draft, ship.sectorId, targetSector);
      const gate = routeGate?.to ?? draft.sectors[targetSector]!.gate.position;
      const to = ship.target?.site ?? (ship.order?.kind === "move" ? ship.order.point : gate);
      const length = Math.hypot(to.x - gate.x, to.y - gate.y);
      return { ...ship, sectorId: targetSector, position: { ...gate }, state: ship.target ? "outbound" : "moving", leg: { from: gate, to }, timer: travelSeconds(length, speedFactor(ship.design)) };
    }
    case "jumpingHome": {
      const gate = gateRoute(draft, ship.sectorId, HOME_SECTOR)?.to ?? draft.sectors[HOME_SECTOR]!.gate.position;
      const length = Math.hypot(draft.dock.x - gate.x, draft.dock.y - gate.y);
      return { ...ship, sectorId: HOME_SECTOR, position: { ...gate }, state: "homebound", leg: { from: gate, to: draft.dock }, timer: travelSeconds(length, speedFactor(ship.design)) };
    }
    case "moving":
      if (ship.order?.kind === "move" && ship.order.sectorId !== ship.sectorId) {
        return { ...ship, state: "jumpingOut", timer: JUMP_SECONDS, position: { ...(ship.leg?.to ?? ship.position) }, leg: null };
      }
      return { ...ship, state: "holding", position: ship.leg ? { ...ship.leg.to } : ship.position, leg: null, timer: 0 };
    case "gateHauling": {
      const gateId = ship.order?.kind === "haulGate" ? ship.order.gateId : -1;
      const gate = draft.gateProjects.find((candidate) => candidate.id === gateId);
      if (gate && ship.cargoMaterial) {
        const amount = Math.min(ship.cargo, Math.max(0, GATE_COST[ship.cargoMaterial] - gate.delivered[ship.cargoMaterial]));
        const delivered = { ...gate.delivered, [ship.cargoMaterial]: gate.delivered[ship.cargoMaterial] + amount };
        const complete = delivered.Metal >= GATE_COST.Metal && delivered.Ice >= GATE_COST.Ice;
        draft.gateProjects = draft.gateProjects.map((candidate) => candidate.id === gate.id ? { ...candidate, delivered, complete } : candidate);
        const cargo = ship.cargo - amount;
        if (complete && cargo === 0) return { ...ship, state: "holding", position: ship.leg ? { ...ship.leg.to } : ship.position, cargo: 0, cargoMaterial: null, order: null, leg: null, timer: 0 };
        ship = { ...ship, cargo, cargoMaterial: cargo > 0 ? ship.cargoMaterial : null };
      }
      const from = ship.leg ? ship.leg.to : ship.position;
      const to = draft.dock;
      return { ...ship, state: "gateReturning", position: { ...from },
        leg: { from: { ...from }, to: { ...to } }, timer: travelSeconds(Math.hypot(to.x - from.x, to.y - from.y), speedFactor(ship.design)) };
    }
    case "gateReturning":
      return ship.cargo > 0
        ? { ...ship, state: "unloading", position: { ...draft.dock }, leg: null, timer: unloadingSeconds(ship.design) }
        : loadGateHauler(draft, { ...ship, position: { ...draft.dock }, leg: null });
    case "waiting":
      // Room can appear without any ship moving, when a Storage module
      // completes, and a berth frees up when another ship finishes unloading.
      if (ship.cargo > 0 && storageRemaining(draft) > 0 && berthFree(draft)) {
        return { ...ship, state: "unloading", timer: unloadingSeconds(ship.design) };
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
      if (ship.sectorId !== HOME_SECTOR) {
        const gate = gateRoute(draft, ship.sectorId, HOME_SECTOR)?.from ?? draft.sectors[ship.sectorId]!.gate.position;
        const length = Math.hypot(gate.x - ship.position.x, gate.y - ship.position.y);
        return { ...ship, state: "homebound", leg: { from: { ...ship.position }, to: { ...gate } }, timer: travelSeconds(length, speedFactor(ship.design)),
          cargo: ship.cargo + mine(draft, ship, shipStats(ship.design).hold - ship.cargo),
          order: ship.order?.kind === "mine" ? { ...ship.order, loaded: true } : ship.order };
      }
      return {
        ...ship,
        state: "homebound",
        timer: route ? route.legSeconds : 0,
        leg: null,
        cargo: ship.cargo + mine(draft, ship, shipStats(ship.design).hold - ship.cargo),
        order: ship.order?.kind === "mine" ? { ...ship.order, loaded: true } : ship.order,
      };
    case "homebound":
      if (ship.sectorId !== HOME_SECTOR) return { ...ship, state: "jumpingHome", timer: JUMP_SECONDS, position: { ...(ship.leg?.to ?? ship.position) }, leg: null };
      if (ship.cargo > 0 && (storageRemaining(draft) === 0 || !berthFree(draft))) {
        return { ...ship, state: "waiting", position: { ...draft.dock }, timer: 0 };
      }
      return { ...ship, state: "unloading", position: { ...draft.dock }, leg: null, timer: unloadingSeconds(ship.design) };
    case "unloading":
      const unloaded = unload(draft, ship, ship.cargo);
      if (unloaded < ship.cargo) {
        const remaining = { ...ship, cargo: ship.cargo - unloaded };
        if (ship.order?.kind === "haulGate") return carryCargoToGate(draft, remaining) ?? { ...remaining, state: "waiting", timer: 0 };
        return { ...remaining, state: "waiting", timer: 0 };
      }
      if (ship.order?.kind === "haulGate") return loadGateHauler(draft, { ...ship, cargo: 0, cargoMaterial: null });
      return ship.order ? afterOrder({ ...ship, cargo: 0 }, draft.dock, draft.asteroids, draft.sectors, draft.gateProjects)
        : ship.defaultBehaviour === "none" ? { ...ship, state: "holding", cargo: 0, order: null, leg: null, timer: 0 }
          : depart({ ...ship, cargo: 0 }, draft.dock, draft.asteroids, draft.ships);
  }
}

// Seconds until the next timer anywhere in the sector runs out.
function nextEvent(draft: Draft): number {
  let soonest = Infinity;
  for (const ship of draft.ships) {
    if (ship.state !== "idle" && ship.state !== "waiting" && ship.state !== "holding") soonest = Math.min(soonest, ship.timer);
  }
  for (const respawn of draft.respawns) soonest = Math.min(soonest, respawn.timer);
  if (draft.construction) soonest = Math.min(soonest, draft.construction.timer);
  for (const job of draft.shipBuilds) soonest = Math.min(soonest, job.timer);
  return soonest;
}

function advance(draft: Draft, seconds: number): void {
  draft.respawns = draft.respawns.map((r) => ({ ...r, timer: r.timer - seconds }));
  draft.ships = draft.ships.map((ship) => progress(draft, ship, ship.timer - seconds));
  if (draft.construction) {
    draft.construction = { ...draft.construction, timer: draft.construction.timer - seconds };
  }
  draft.shipBuilds = draft.shipBuilds.map((job) => ({ ...job, timer: job.timer - seconds }));
}

// Fires every timer that has reached zero. Respawns go first so a ship that
// becomes free at the same moment can head for the new asteroid.
function settle(draft: Draft): void {
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
    const respawnSector = respawn.sectorId;
    const centre = respawnSector === 0 ? draft.dock : { x: 0, y: 0 };
    const placed = placeAsteroid(draft.rng, centre, [
      respawn.lastPosition,
      ...draft.asteroids.filter((a) => a.sectorId === respawnSector).map((a) => a.position),
      ...draft.modules.map((module) => module.position),
      ...(draft.construction ? [draft.construction.position] : []),
    ]);
    draft.rng = placed.rng;
    const material = nextRandom(draft.rng);
    draft.rng = material.state;
    draft.asteroids = [
      ...draft.asteroids,
      { id: draft.nextAsteroidId, sectorId: respawn.sectorId, position: placed.position, size: ASTEROID_SIZE, ore: ASTEROID_ORE,
        material: material.value < 0.5 ? "Metal" : "Ice" },
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
      cargoMaterial: null,
      target: null,
      defaultBehaviour: "mine",
      order: null,
      leg: null,
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
    rng: state.rng,
    nextAsteroidId: state.nextAsteroidId,
    nextShipId: state.nextShipId,
    dock: state.station.dock.position,
    storageCapacity: state.station.storage.capacity,
    inventory: state.station.inventory,
    asteroids: state.asteroids,
    respawns: state.respawns,
    ships: state.ships,
    modules: state.station.modules,
    construction: state.station.construction,
    shipBuilds: state.station.shipBuilds,
    dockCapacity: state.station.dock.capacity,
    sectors: state.sectors,
    gateProjects: state.gateProjects,
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
    rng: draft.rng,
    nextAsteroidId: draft.nextAsteroidId,
    nextShipId: draft.nextShipId,
    station: {
      ...state.station,
      dock: { ...state.station.dock, capacity: draft.dockCapacity },
      storage: { ...state.station.storage, capacity: draft.storageCapacity },
      inventory: draft.inventory,
      modules: draft.modules,
      construction: draft.construction,
      shipBuilds: draft.shipBuilds,
    },
    asteroids: draft.asteroids,
    respawns: draft.respawns,
    ships: draft.ships,
    gateProjects: draft.gateProjects,
  };
}
