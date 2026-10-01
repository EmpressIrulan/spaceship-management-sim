import { claimSiteBuilt } from "./claim";
import { travelSeconds } from "./motion";
import { canMine, cargoTransferSeconds, shipSize, shipStats, speedFactor } from "./ship";
import {
  berthLayout, depart, GATE_COST, gateRoute, HOME_SECTOR, miningSite, nearestWithOre, toBerth, toParking,
  type Asteroid, type DefaultBehaviour, type Order, type Sector, type Ship, type SimState, type Vec,
} from "./state";

const SPACING = 2 * 3 * 4.5;

export function formation(point: Vec, count: number): Vec[] {
  const result: Vec[] = [];
  for (let ring = 0; result.length < count; ring += 1) {
    const slots = Math.max(1, ring * 6);
    for (let slot = 0; slot < slots && result.length < count; slot += 1) {
      const angle = slot / slots * Math.PI * 2;
      result.push({ x: point.x + Math.cos(angle) * ring * SPACING, y: point.y + Math.sin(angle) * ring * SPACING });
    }
  }
  return result;
}

function fly(ship: Ship, state: "moving" | "outbound" | "homebound", to: Vec): Ship {
  const from = { ...ship.position };
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const speed = Math.max(0.01, speedFactor(ship.design));
  return { ...ship, state, berth: null, transfer: null, leg: { from, to: { ...to } }, timer: travelSeconds(length, speed) };
}

function hold(ship: Ship): Ship {
  return { ...ship, state: "holding", berth: null, transfer: null, timer: 0, leg: null, target: null };
}

function routeHome(ship: Ship, dock: Vec, sectors: Sector[], gateProjects: SimState["gateProjects"]): Ship {
  const destination = ship.sectorId === HOME_SECTOR ? dock : gateRoute({ sectors, gateProjects }, ship.sectorId, HOME_SECTOR)?.from;
  if (!destination) return hold(ship);
  return fly(ship, "homebound", destination);
}

function startMining(ship: Ship, rock: Asteroid, dock: Vec, sectors: Sector[], gateProjects: SimState["gateProjects"]): Ship {
  const rockSector = rock.sectorId;
  const route = rockSector === HOME_SECTOR ? null : gateRoute({ sectors, gateProjects }, HOME_SECTOR, rockSector);
  if (rockSector !== HOME_SECTOR && !route) return hold(ship);
  const approach = rockSector === HOME_SECTOR ? dock : route!.to;
  const site = miningSite(approach, rock, shipSize(ship.design));
  const shipTarget = {
    ...ship,
    target: { asteroidId: rock.id, sectorId: rockSector, site },
    cargoMaterial: rock.material,
  };
  const shipRoute = rockSector === ship.sectorId ? null : gateRoute({ sectors, gateProjects }, ship.sectorId, rockSector);
  if (rockSector !== ship.sectorId && !shipRoute) return hold(ship);
  const destination = rockSector === ship.sectorId ? site : shipRoute!.from;
  return fly(shipTarget, "outbound", destination);
}

function resume(ship: Ship, dock: Vec, asteroids: Asteroid[], sectors: Sector[], gateProjects: SimState["gateProjects"]): Ship {
  if (ship.defaultBehaviour === "none") return hold(ship);
  if (ship.cargo > 0) return routeHome({ ...ship, target: null }, dock, sectors, gateProjects);
  const rock = nearestWithOre(dock, asteroids.filter((a) => a.sectorId === HOME_SECTOR));
  if (!rock || !canMine(ship.design)) return { ...ship, state: "idle", timer: 0, leg: null, target: null };
  return startMining(ship, rock, dock, sectors, gateProjects);
}

export function afterOrder(ship: Ship, dock: Vec, asteroids: Asteroid[], sectors: Sector[], gateProjects: SimState["gateProjects"]): Ship {
  const order = ship.order;
  if (order?.kind === "mine" && !order.loaded) {
    const rock = asteroids.find((a) => a.id === order.asteroidId);
    if (rock) return startMining(ship, rock, dock, sectors, gateProjects);
  }
  return resume({ ...ship, order: null }, dock, asteroids, sectors, gateProjects);
}

export type OrderTarget = { kind: "mine"; asteroidId: number } | { kind: "move"; point: Vec; sectorId?: number } | { kind: "home" } | { kind: "haulGate"; gateId: number } | { kind: "supplySite"; siteId: number };

// Where a flying order ends, for the orders that cross a gate to get there.
export function travelOrder(order: Order | null): { point: Vec; sectorId: number } | null {
  return order?.kind === "move" || order?.kind === "supplySite" ? { point: order.point, sectorId: order.sectorId } : null;
}

function apply(ship: Ship, target: OrderTarget, point: Vec, state: SimState): Ship {
  if (target.kind === "haulGate") return ship;
  if (target.kind === "supplySite") {
    const site = state.claimSites.find((candidate) => candidate.id === target.siteId);
    if (!site || ship.cargo <= 0 || !ship.cargoMaterial) return ship;
    const route = gateRoute(state, ship.sectorId, site.sectorId);
    if (site.sectorId !== ship.sectorId && !route) return ship;
    const order = { kind: "supplySite" as const, siteId: site.id, point, sectorId: site.sectorId };
    return fly({ ...ship, target: null, order }, "moving", site.sectorId === ship.sectorId ? point : route!.from);
  }
  if (target.kind === "move") {
    const sectorId = target.sectorId ?? ship.sectorId;
    const order = { kind: "move" as const, point: target.point, sectorId };
    const route = gateRoute(state, ship.sectorId, sectorId);
    if (sectorId !== ship.sectorId && !route) return ship;
    const destination = sectorId === ship.sectorId ? point : route!.from;
    return fly({ ...ship, target: null, order }, "moving", destination);
  }
  if (target.kind === "home") return routeHome({ ...ship, target: null, order: { kind: "home" } }, state.station.dock.position, state.sectors, state.gateProjects);
  if (!canMine(ship.design)) return ship;
  const rock = state.asteroids.find((a) => a.id === target.asteroidId);
  if (!rock) return ship;
  if (ship.cargo > 0 && (ship.cargoMaterial !== rock.material || ship.cargo >= shipStats(ship.design).hold)) {
    return routeHome({ ...ship, target: null, order: { kind: "mine", asteroidId: rock.id, loaded: false } }, state.station.dock.position, state.sectors, state.gateProjects);
  }
  return startMining({ ...ship, order: { kind: "mine", asteroidId: rock.id, loaded: false } }, rock, state.station.dock.position, state.sectors, state.gateProjects);
}

export function giveOrder(state: SimState, ids: number[], target: OrderTarget): SimState {
  const selected = state.ships.filter((ship) => ids.includes(ship.id));
  if (!selected.length) return state;
  if (target.kind === "haulGate") {
    const project = state.gateProjects.find((candidate) => candidate.id === target.gateId && !candidate.complete);
    const end = project?.ends.find((candidate) => candidate.sectorId === state.station.sectorId);
    if (!project || !end) return state;
    let inventory = { ...state.station.inventory };
    const ships = [...state.ships];
    for (let index = 0; index < ships.length; index += 1) {
      const ship = ships[index]!;
      if (!ids.includes(ship.id) || shipStats(ship.design).hold <= 0) continue;
      const order = { kind: "haulGate" as const, gateId: project.id };
      const atStorage = ship.sectorId === state.station.sectorId
        && ship.position.x === state.station.dock.position.x && ship.position.y === state.station.dock.position.y;
      if (ship.cargo > 0) {
        ships[index] = atStorage
          ? { ...ship, state: "unloading", order, target: null, leg: null,
            transfer: { startingCargo: ship.cargo, amount: ship.cargo }, timer: cargoTransferSeconds(ship.cargo) }
          : { ...fly({ ...ship, target: null, order }, "moving", state.station.dock.position), state: "gateReturning" as const };
        continue;
      }
      if (!atStorage) {
        ships[index] = { ...fly({ ...ship, target: null, order }, "moving", state.station.dock.position), state: "gateReturning" as const };
        continue;
      }
      const outstanding = (material: "Metal" | "Ice") => GATE_COST[material] - project.delivered[material]
        - ships.reduce((sum, other) => {
          if (other.id === ship.id || other.order?.kind !== "haulGate" || other.order.gateId !== project.id || other.cargoMaterial !== material) return sum;
          if ((other.state === "berthing" || other.state === "waiting" || other.state === "loading")
            && other.transfer?.startingCargo === 0) return sum + other.transfer.amount;
          return other.state === "gateHauling" || other.state === "gateUnloading" ? sum + other.cargo : sum;
        }, 0);
      const available = (material: "Metal" | "Ice") => inventory[material] - ships.reduce((sum, other) =>
        sum + (other.id !== ship.id && other.cargoMaterial === material && other.transfer?.startingCargo === 0
          && (other.state === "berthing" || other.state === "waiting" || other.state === "loading")
          ? Math.max(0, other.transfer.amount - other.cargo) : 0), 0);
      const material = (["Metal", "Ice"] as const).find((item) => outstanding(item) > 0 && available(item) > 0);
      if (!material) {
        ships[index] = { ...ship, state: "holding", order, berth: null, transfer: null, timer: 0, leg: null };
        continue;
      }
      const amount = Math.min(shipStats(ship.design).hold, available(material), outstanding(material));
      const planned = { ...ship, cargo: 0, cargoMaterial: material, order, target: null,
        transfer: { startingCargo: 0, amount } };
      ships[index] = toBerth(berthLayout(state.station), ships, planned) ?? toParking(berthLayout(state.station), ships, planned);
    }
    return { ...state, station: { ...state.station, inventory }, ships };
  }
  const site = target.kind === "supplySite" ? state.claimSites.find((candidate) => candidate.id === target.siteId) : null;
  if (target.kind === "supplySite" && (!site || claimSiteBuilt(site))) return state;
  const point = target.kind === "move" ? target.point : target.kind === "supplySite" ? site!.position : target.kind === "home"
    ? state.station.dock.position
    : (() => { const rock = state.asteroids.find((a) => a.id === target.asteroidId); return rock ? miningSite(state.station.dock.position, rock, shipSize(selected[0]!.design)) : null; })();
  if (!point) return state;
  const spots = formation(point, ids.length);
  return { ...state, ships: state.ships.map((ship) => {
    const slot = ids.indexOf(ship.id);
    return slot < 0 ? ship : apply(ship, target, target.kind === "home" ? point : spots[slot]!, state);
  }) };
}

export function resumeDefault(state: SimState, ids: number[]): SimState {
  return { ...state, ships: state.ships.map((ship) => ids.includes(ship.id) && ship.order
    ? resume({ ...ship, order: null }, state.station.dock.position, state.asteroids, state.sectors, state.gateProjects) : ship) };
}

export function setDefaultBehaviour(state: SimState, ids: number[], behaviour: DefaultBehaviour): SimState {
  return { ...state, ships: state.ships.map((ship) => {
    if (!ids.includes(ship.id)) return ship;
    const next = { ...ship, defaultBehaviour: behaviour };
    return next.state === "holding" && !next.order ? resume(next, state.station.dock.position, state.asteroids, state.sectors, state.gateProjects) : next;
  }) };
}
