import { travelSeconds } from "./motion";
import { cargoTransferSeconds, shipStats, speedFactor } from "./ship";
import { stationFounded } from "./station-placement";
import type { HomeHaulContext } from "./tick-mining";
import { berthLayout, gateRoute, homeStation, stationById, toBerth, toParking, type HaulDestinationId, type HaulRoute, type HaulStationId, type Ship, type SimState, type Station, type Vec } from "./state";

export interface HaulStation { id: HaulStationId; name: string }
export interface HaulDestination { id: HaulDestinationId; name: string }

interface HaulStateBase {
  sectors: SimState["sectors"];
  gateProjects: SimState["gateProjects"];
}

export type HaulState = HaulStateBase & (
  | { stations: Station[]; stationSector?: never; dock?: never; inventory?: never; storageCapacity?: never; constructionSite?: never; others?: never; activeStationId?: never; primaryStationId?: never; homeContext?: never }
  | { stations?: never; stationSector: number; dock: Vec; inventory: Station["inventory"]; storageCapacity: number; constructionSite: Station["constructionSite"]; others: Station[]; activeStationId: number; primaryStationId: number; homeContext: HomeHaulContext | null }
);

// Every station with a Dock of its own joins Home as a haul stop. A site still
// founding has no Dock, so it does not appear until it owns one. Names come
// from the station's generated name.
export function haulStations(state: Pick<SimState, "stations" | "sectors">): HaulStation[] {
  const home = stationById(state, 0);
  return [
    ...(home ? [{ id: "home" as const, name: home.name }] : []),
    ...state.stations.filter((station) => station.id !== 0 && stationFounded(station)).map((station) => ({
      id: `station:${station.id}` as const,
      name: station.name,
    })),
  ];
}

// The Storage of every haul stop, each followed by the construction site that
// stands with it, so a To dropdown shows "Home construction site" and its like.
// Both functions run the same filter in the same order, so indexes pair up.
export function haulDestinations(state: Pick<SimState, "stations" | "sectors">): HaulDestination[] {
  const sites = haulSites(state);
  return haulStations(state).flatMap((station, index) => [station, sites[index]!]);
}

export function haulSites(state: Pick<SimState, "stations" | "sectors">): HaulDestination[] {
  const home = stationById(state, 0);
  return [
    ...(home ? [{ id: "site:0" as const, name: `${home.name} construction site` }] : []),
    ...state.stations.filter((station) => station.id !== 0 && stationFounded(station)).map((station) => ({
      id: `site:${station.id}` as const,
      name: `${station.name} construction site`,
    })),
  ];
}

export function haulStationDetails(state: HaulState, id: HaulDestinationId) {
  if (id.startsWith("site:")) {
    const stationId = Number(id.slice("site:".length));
    if (state.stations) return siteDetails(id, stationById(state, stationId));
    // The tick's draft keeps the active station's context at the top level;
    // a haul runs under its ship's home station's context, so a site resolves
    // by the station its id names: the active station's site reads from the
    // top level, the primary station's is kept aside in homeContext, the rest
    // stand in others.
    if (stationId === state.activeStationId) return {
      id, sectorId: state.stationSector, position: state.constructionSite.position,
      inventory: state.constructionSite.inventory, capacity: Infinity,
    };
    if (stationId === state.primaryStationId && state.homeContext) return {
      id, sectorId: state.homeContext.stationSector, position: state.homeContext.constructionSite.position,
      inventory: state.homeContext.constructionSite.inventory, capacity: Infinity,
    };
    return siteDetails(id, state.others.find((candidate) => candidate.id === stationId));
  }
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

// The construction site of one station, resolved for the haul stop list. A
// site has no cap, so every room check sees room left and a hauler never
// waits for space there.
function siteDetails(id: HaulDestinationId, station: Station | undefined) {
  return station && (station.id === 0 || stationFounded(station))
    ? { id, sectorId: station.sectorId, position: station.constructionSite.position,
      inventory: station.constructionSite.inventory, capacity: Infinity }
    : null;
}

function stored(station: NonNullable<ReturnType<typeof haulStationDetails>>): number {
  return station.inventory.Metal + station.inventory.Ice;
}

export function flyHaul(ship: Ship, state: HaulState, stationId: HaulDestinationId, kind: "outbound" | "returning"): Ship {
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

function transferAt(state: SimState, ship: Ship, stationId: HaulDestinationId, loading: boolean): Ship {
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
  const sources = new Set(haulStations(state).map((station) => station.id));
  const destinations = new Set(haulDestinations(state).map((destination) => destination.id));
  return sources.has(route.from) && destinations.has(route.to) && route.from !== route.to;
}

// Cargo that no longer matches the configured route goes back to From before
// the ship starts loading the newly selected material.
export function haulCargoDestination(ship: Ship): HaulDestinationId | null {
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
