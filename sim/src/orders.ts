import { travelSeconds } from "./motion";
import { canMine, shipSize, shipStats } from "./ship";
import {
  depart, miningSite, nearestWithOre, type Asteroid, type DefaultBehaviour, type Order,
  type Sector, type Ship, type SimState, type Vec,
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
  const speed = Math.max(0.01, ship.design.slots.filter((part) => part === "Engine").length / (ship.design.width * ship.design.height) * 4);
  return { ...ship, state, leg: { from, to: { ...to } }, timer: travelSeconds(length, speed) };
}

function hold(ship: Ship): Ship {
  return { ...ship, state: "holding", timer: 0, leg: null, target: null };
}

function routeHome(ship: Ship, dock: Vec, sectors: Sector[]): Ship {
  const destination = ship.sectorId === 0 ? dock : sectors[ship.sectorId]!.gate.position;
  return fly(ship, "homebound", destination);
}

function startMining(ship: Ship, rock: Asteroid, dock: Vec, sectors: Sector[]): Ship {
  const rockSector = rock.sectorId;
  const approach = rockSector === 0 ? dock : sectors[rockSector]!.gate.position;
  const site = miningSite(approach, rock, shipSize(ship.design));
  const shipTarget = {
    ...ship,
    target: { asteroidId: rock.id, sectorId: rockSector, site },
    cargoMaterial: rock.material,
  };
  const destination = rockSector === ship.sectorId ? site : sectors[ship.sectorId]!.gate.position;
  return fly(shipTarget, "outbound", destination);
}

function resume(ship: Ship, dock: Vec, asteroids: Asteroid[], sectors: Sector[]): Ship {
  if (ship.defaultBehaviour === "none") return hold(ship);
  if (ship.cargo > 0) return routeHome({ ...ship, target: null }, dock, sectors);
  const rock = nearestWithOre(dock, asteroids.filter((a) => a.sectorId === 0));
  if (!rock || !canMine(ship.design)) return { ...ship, state: "idle", timer: 0, leg: null, target: null };
  return startMining(ship, rock, dock, sectors);
}

export function afterOrder(ship: Ship, dock: Vec, asteroids: Asteroid[], sectors: Sector[]): Ship {
  const order = ship.order;
  if (order?.kind === "mine" && !order.loaded) {
    const rock = asteroids.find((a) => a.id === order.asteroidId);
    if (rock) return startMining(ship, rock, dock, sectors);
  }
  return resume({ ...ship, order: null }, dock, asteroids, sectors);
}

export type OrderTarget = { kind: "mine"; asteroidId: number } | { kind: "move"; point: Vec; sectorId?: number } | { kind: "home" };

function apply(ship: Ship, target: OrderTarget, point: Vec, state: SimState): Ship {
  if (target.kind === "move") {
    const sectorId = target.sectorId ?? ship.sectorId;
    const order = { kind: "move" as const, point: target.point, sectorId };
    const destination = sectorId === ship.sectorId ? point : state.sectors[ship.sectorId]!.gate.position;
    return fly({ ...ship, target: null, order }, "moving", destination);
  }
  if (target.kind === "home") return routeHome({ ...ship, target: null, order: { kind: "home" } }, state.station.dock.position, state.sectors);
  if (!canMine(ship.design)) return ship;
  const rock = state.asteroids.find((a) => a.id === target.asteroidId);
  if (!rock) return ship;
  if (ship.cargo > 0 && (ship.cargoMaterial !== rock.material || ship.cargo >= shipStats(ship.design).hold)) {
    return routeHome({ ...ship, target: null, order: { kind: "mine", asteroidId: rock.id, loaded: false } }, state.station.dock.position, state.sectors);
  }
  return startMining({ ...ship, order: { kind: "mine", asteroidId: rock.id, loaded: false } }, rock, state.station.dock.position, state.sectors);
}

export function giveOrder(state: SimState, ids: number[], target: OrderTarget): SimState {
  const selected = state.ships.filter((ship) => ids.includes(ship.id));
  if (!selected.length) return state;
  const point = target.kind === "move" ? target.point : target.kind === "home"
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
    ? resume({ ...ship, order: null }, state.station.dock.position, state.asteroids, state.sectors) : ship) };
}

export function setDefaultBehaviour(state: SimState, ids: number[], behaviour: DefaultBehaviour): SimState {
  return { ...state, ships: state.ships.map((ship) => {
    if (!ids.includes(ship.id)) return ship;
    const next = { ...ship, defaultBehaviour: behaviour };
    return next.state === "holding" && !next.order ? resume(next, state.station.dock.position, state.asteroids, state.sectors) : next;
  }) };
}
