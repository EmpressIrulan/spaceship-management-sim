import { travelSeconds } from "./motion";
import { resumeDefaultShip } from "./orders";
import { pixelCount, shipSize, speedFactor, type ShipDesign } from "./ship";
import type { Ship, SimState, Vec } from "./state";

export function hangarCapacity(design: ShipDesign): number {
  return design.slots.filter((slot) => slot === "Hangar").length;
}

export function hangarContents(state: SimState, carrierId: number): Ship[] {
  return state.ships.filter((ship) => ship.hangarId === carrierId && ship.state === "docked");
}

export function hangarUsed(state: SimState, carrierId: number): number {
  return hangarContents(state, carrierId).reduce((sum, ship) => sum + pixelCount(ship.design), 0);
}

function reserved(ships: Ship[], carrierId: number): number {
  return ships.filter((ship) => ship.hangarId === carrierId || ship.order?.kind === "dock" && ship.order.carrierId === carrierId)
    .reduce((sum, ship) => sum + pixelCount(ship.design), 0);
}

export function giveDockOrder(state: SimState, ids: number[], carrierId: number): SimState {
  const carrier = state.ships.find((ship) => ship.id === carrierId);
  if (!carrier || carrier.hangarId != null || hangarCapacity(carrier.design) === 0) return state;
  let room = hangarCapacity(carrier.design) - reserved(state.ships, carrierId);
  let accepted = false;
  const ships = state.ships.map((ship) => {
    const size = pixelCount(ship.design);
    if (!ids.includes(ship.id) || ship.id === carrierId || ship.hangarId != null || ship.sectorId !== carrier.sectorId || size > room) return ship;
    room -= size;
    accepted = true;
    const from = { ...ship.position };
    const to = { ...carrier.position };
    return {
      ...ship,
      state: "docking" as const,
      order: { kind: "dock" as const, carrierId },
      target: null,
      berth: null,
      transfer: null,
      leg: { from, to },
      timer: travelSeconds(Math.hypot(to.x - from.x, to.y - from.y), speedFactor(ship.design)),
    };
  });
  return accepted ? { ...state, ships } : state;
}

export function completeDocking(ships: Ship[], ship: Ship): Ship {
  const carrierId = ship.order?.kind === "dock" ? ship.order.carrierId : null;
  const carrier = ships.find((candidate) => candidate.id === carrierId);
  const occupied = carrierId === null ? Infinity : ships.filter((candidate) => candidate.id !== ship.id && candidate.hangarId === carrierId)
    .reduce((sum, candidate) => sum + pixelCount(candidate.design), 0);
  if (!carrier || carrier.hangarId != null || occupied + pixelCount(ship.design) > hangarCapacity(carrier.design)) {
    return { ...ship, state: "holding", order: null, leg: null, timer: 0 };
  }
  if (carrier.sectorId !== ship.sectorId) return { ...ship, state: "holding", order: null, leg: null, timer: 0 };
  const distance = Math.hypot(carrier.position.x - ship.position.x, carrier.position.y - ship.position.y);
  if (distance > 0.01) {
    const from = { ...ship.position };
    const to = { ...carrier.position };
    return { ...ship, state: "docking", leg: { from, to }, timer: travelSeconds(distance, speedFactor(ship.design)) };
  }
  return { ...ship, state: "docked", sectorId: carrier.sectorId, position: { ...carrier.position }, hangarId: carrier.id,
    order: null, leg: null, timer: 0 };
}

export function syncDockedShips(ships: Ship[]): Ship[] {
  return ships.map((ship) => {
    if (ship.hangarId == null) return ship;
    const carrier = ships.find((candidate) => candidate.id === ship.hangarId);
    return carrier ? { ...ship, sectorId: carrier.sectorId, position: { ...carrier.position } }
      : { ...ship, hangarId: null, state: "holding", timer: 0 };
  });
}

function launchPoint(carrier: Ship, ship: Ship, index: number, count: number): Vec {
  const carrierSize = shipSize(carrier.design);
  const fighterSize = shipSize(ship.design);
  const radius = Math.hypot(carrierSize.width, carrierSize.height) / 2 + Math.hypot(fighterSize.width, fighterSize.height);
  const angle = count === 1 ? 0 : index / count * Math.PI * 2;
  return { x: carrier.position.x + Math.cos(angle) * radius, y: carrier.position.y + Math.sin(angle) * radius };
}

export function launchAll(state: SimState, carrierId: number): SimState {
  const carrier = state.ships.find((ship) => ship.id === carrierId);
  if (!carrier || carrier.state === "jumpingOut" || carrier.state === "jumpingHome") return state;
  const contents = hangarContents(state, carrierId);
  if (contents.length === 0) return state;
  const released = new Map(contents.map((ship, index) => [ship.id, {
    ...ship,
    state: "holding" as const,
    sectorId: carrier.sectorId,
    position: launchPoint(carrier, ship, index, contents.length),
    hangarId: null,
    order: null,
    leg: null,
    timer: 0,
  }]));
  let next = { ...state, ships: state.ships.map((ship) => released.get(ship.id) ?? ship) };
  next = { ...next, ships: next.ships.map((ship) => released.has(ship.id) ? resumeDefaultShip(next, ship) : ship) };
  return next;
}
