import { travelSeconds } from "./motion";
import { cargoTransferSeconds, shipStats, speedFactor } from "./ship";
import { stationFounded } from "./station-placement";
import { berthLayout, gateRoute, homeStation, stationById, toBerth, toParking, type HaulRoute, type HaulStationId, type Ship, type SimState, type Station, type Vec } from "./state";

export interface HaulStation { id: HaulStationId; name: string }

interface HaulStateBase {
  sectors: SimState["sectors"];
  gateProjects: SimState["gateProjects"];
}

export type HaulState = HaulStateBase & (
  | { stations: Station[]; stationSector?: never; dock?: never; inventory?: never; storageCapacity?: never; others?: never }
  | { stations?: never; stationSector: number; dock: Vec; inventory: Station["inventory"]; storageCapacity: number; others: Station[] }
);

// Every station with a Dock of its own joins Home as a haul stop. A site still
// founding has no Dock, so it does not appear until it owns one. Names come
// from the station's generated name.
export function haulStations(state: Pick<SimState, "stations" | "sectors">): HaulStation[] {
  if (state.stations.length === 0) return [];
  return [
    { id: "home", name: homeStation(state).name },
    ...state.stations.filter((station) => station.id !== 0 && stationFounded(station)).map((station) => ({
      id: `station:${station.id}` as const,
      name: station.name,
    })),
  ];
}

export function haulStationDetails(state: HaulState, id: HaulStationId) {
  if (id === "home") {
    if (state.stations) return {
      id, sectorId: homeStation(state).sectorId, position: homeStation(state).dock.position,
      inventory: homeStation(state).inventory, capacity: homeStation(state).storage.capacity,
    };
    return { id, sectorId: state.stationSector, position: state.dock, inventory: state.inventory, capacity: state.storageCapacity };
  }
  const stations = state.stations ?? state.others ?? [];
  const station = stationById({ stations }, Number(id.slice("station:".length)));
  return station && station.id !== 0 && stationFounded(station)
    ? { id, sectorId: station.sectorId, position: station.dock.position, inventory: station.inventory, capacity: station.storage.capacity }
    : null;}

function stored(station: NonNullable<ReturnType<typeof haulStationDetails>>): number {
  return station.inventory.Metal + station.inventory.Ice;
}

export function flyHaul(ship: Ship, state: HaulState, stationId: HaulStationId, kind: "outbound" | "returning"): Ship {
  const station = haulStationDetails(state, stationId);
  if (!station) return { ...ship, state: "holding", timer: 0, leg: null };
  let to: Vec;
  if (ship.sectorId === station.sectorId) to = station.position;
  else {
    const route = gateRoute(state, ship.sectorId, station.sectorId);
    if (!route) return { ...ship, state: "holding", timer: 0, leg: null };
    to = route.from;
  }
  const from = { ...ship.position };
  return { ...ship, state: kind === "outbound" ? "haulOutbound" : "haulReturning", berth: null, transfer: null, leg: { from, to: { ...to } },
    timer: travelSeconds(Math.hypot(to.x - from.x, to.y - from.y), speedFactor(ship.design)) };
}

function transferAt(state: SimState, ship: Ship, stationId: HaulStationId, loading: boolean): Ship {
  const amount = loading ? shipStats(ship.design).hold : ship.cargo;
  const planned = { ...ship, cargoMaterial: loading ? ship.haulRoute?.material ?? null : ship.cargoMaterial,
    transfer: { startingCargo: loading ? 0 : ship.cargo, amount } };
  if (stationId === "home") {
    return toBerth(berthLayout(homeStation(state)), state.ships, planned) ?? toParking(berthLayout(homeStation(state)), state.ships, planned);
  }
  return { ...planned, state: loading ? "haulLoading" : "haulUnloading", berth: null, leg: null,
    timer: cargoTransferSeconds(amount) };
}

export function validHaulRoute(state: SimState, route: HaulRoute): boolean {
  const stations = new Set(haulStations(state).map((station) => station.id));
  return route.from !== route.to && stations.has(route.from) && stations.has(route.to);
}

// Cargo that no longer matches the configured route goes back to From before
// the ship starts loading the newly selected material.
export function haulCargoDestination(ship: Ship): HaulStationId | null {
  const route = ship.haulRoute;
  if (!route) return null;
  return ship.cargo > 0 && ship.cargoMaterial && ship.cargoMaterial !== route.material ? route.from : route.to;
}

// Restarts the standing order from wherever an interruption left the ship.
export function resumeHaulShip(state: SimState, ship: Ship): Ship {
  const route = ship.haulRoute;
  if (!route || !validHaulRoute(state, route)) return { ...ship, state: "holding", timer: 0, leg: null, order: null };
  const from = haulStationDetails(state, route.from)!;
  const to = haulStationDetails(state, route.to)!;
  const atFrom = ship.sectorId === from.sectorId && ship.position.x === from.position.x && ship.position.y === from.position.y;
  const clean = { ...ship, order: null, target: null };
  if (ship.cargo > 0) {
    const destinationId = haulCargoDestination(ship)!;
    const destination = destinationId === route.from ? from : to;
    const atDestination = ship.sectorId === destination.sectorId
      && ship.position.x === destination.position.x && ship.position.y === destination.position.y;
    if (!atDestination) return flyHaul(clean, state, destinationId, destinationId === route.from ? "returning" : "outbound");
    return stored(destination) >= destination.capacity ? { ...clean, state: "haulWaitingFull", timer: 0, leg: null }
      : transferAt(state, clean, destinationId, false);
  }
  if (!atFrom) return flyHaul(clean, state, route.from, "returning");
  if (stored(to) >= to.capacity) return { ...clean, state: "haulWaitingFull", timer: 0, leg: null, cargoMaterial: null };
  if (from.inventory[route.material] < shipStats(ship.design).hold) return { ...clean, state: "haulWaitingSource", timer: 0, leg: null, cargoMaterial: null };
  return transferAt(state, clean, route.from, true);
}
