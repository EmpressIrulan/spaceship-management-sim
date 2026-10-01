import { claimSiteBuilt } from "./claim";
import { travelSeconds } from "./motion";
import { shipStats, speedFactor, unloadingSeconds } from "./ship";
import { STORAGE_CAPACITY, gateRoute, type HaulRoute, type HaulStationId, type Ship, type SimState, type Vec } from "./state";

export interface HaulStation { id: HaulStationId; name: string }

export function haulStations(state: Pick<SimState, "station" | "claimSites" | "sectors">): HaulStation[] {
  const home = state.sectors[state.station.sectorId];
  return [
    { id: "home", name: home?.name ?? "Home" },
    ...state.claimSites.filter(claimSiteBuilt).map((site) => ({
      id: `claim:${site.id}` as const,
      name: state.sectors[site.sectorId]?.name ?? `Station ${site.id + 2}`,
    })),
  ];
}

export function haulStationDetails(state: Pick<SimState, "station" | "claimSites" | "sectors">, id: HaulStationId) {
  if (id === "home") return {
    id, sectorId: state.station.sectorId, position: state.station.dock.position,
    inventory: state.station.inventory, capacity: state.station.storage.capacity,
  };
  const site = state.claimSites.find((candidate) => `claim:${candidate.id}` === id && claimSiteBuilt(candidate));
  return site ? { id, sectorId: site.sectorId, position: site.position, inventory: site.delivered, capacity: STORAGE_CAPACITY } : null;
}

function stored(station: NonNullable<ReturnType<typeof haulStationDetails>>): number {
  return station.inventory.Metal + station.inventory.Ice;
}

function fly(ship: Ship, state: SimState, stationId: HaulStationId, kind: "outbound" | "returning"): Ship {
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
  return { ...ship, state: kind === "outbound" ? "haulOutbound" : "haulReturning", leg: { from, to: { ...to } },
    timer: travelSeconds(Math.hypot(to.x - from.x, to.y - from.y), speedFactor(ship.design)) };
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
    if (!atDestination) return fly(clean, state, destinationId, destinationId === route.from ? "returning" : "outbound");
    return stored(destination) >= destination.capacity ? { ...clean, state: "haulWaitingFull", timer: 0, leg: null }
      : { ...clean, state: "haulUnloading", timer: unloadingSeconds(ship.design), leg: null };
  }
  if (!atFrom) return fly(clean, state, route.from, "returning");
  if (stored(to) >= to.capacity) return { ...clean, state: "haulWaitingFull", timer: 0, leg: null, cargoMaterial: null };
  if (from.inventory[route.material] < shipStats(ship.design).hold) return { ...clean, state: "haulWaitingSource", timer: 0, leg: null, cargoMaterial: null };
  return { ...clean, state: "haulLoading", timer: unloadingSeconds(ship.design), leg: null, cargoMaterial: route.material };
}
