import { ASTEROID_MIN_SPACING, DOCK_SIZE, MODULE_COST, MODULE_SPACING, STORAGE_SIZE } from "./build-constants";
import type { SimState, Size, Station, Vec } from "./model";
import { nextRandom } from "./prng";
import { CONSTRUCTION_SITE_SIZE, replaceStation } from "./state";

// A placed site spans the pair of slots its first Dock and Storage will stand
// in, with the pointer landing on the middle of the pair, like a claim site
// did before it was replaced.
export const STATION_SITE_SIZE: Size = { width: DOCK_SIZE.width + MODULE_SPACING, height: DOCK_SIZE.height };
const STATION_NAME_WORDS = ["Kestrel", "Meridian", "Aster", "Vega", "Pioneer", "Solace", "Atlas", "Juniper", "Cinder", "Lumen"];

export function placeStation(state: SimState, sectorId: number, position: Vec): SimState {
  if (!state.sectors[sectorId]) return state;
  if (blockedByRock(state, sectorId, position) || blockedByStationBody(state, sectorId, position)) return state;
  const nameRoll = nextRandom(state.rng);
  const dockPosition = { x: position.x - MODULE_SPACING / 2, y: position.y };
  const storagePosition = { x: position.x + MODULE_SPACING / 2, y: position.y };
  const station: Station = {
    id: state.nextStationId,
    name: `${STATION_NAME_WORDS[Math.floor(nameRoll.value * STATION_NAME_WORDS.length)]} Station`,
    founding: true,
    sectorId,
    dock: { position: dockPosition, size: DOCK_SIZE, capacity: 0 },
    storage: { position: storagePosition, size: STORAGE_SIZE, capacity: 0 },
    inventory: { Metal: 0, Ice: 0 },
    constructionSite: { position: { ...position }, size: CONSTRUCTION_SITE_SIZE, inventory: { Metal: 0, Ice: 0 } },
    storageLimits: { Metal: null, Ice: null },
    deliveries: [],
    modules: [],
    construction: null,
    buildQueue: [
      { type: "Dock", position: dockPosition, size: DOCK_SIZE },
      { type: "Storage", position: storagePosition, size: STORAGE_SIZE },
    ],
    shipBuilds: [],
  };
  return { ...state, rng: nameRoll.state, nextStationId: state.nextStationId + 1, stations: [...state.stations, station] };
}

function overlap(a: Vec, b: Vec, aSize: Size, bSize: Size, margin: number): boolean {
  return Math.abs(a.x - b.x) < (aSize.width + bSize.width) / 2 + margin
    && Math.abs(a.y - b.y) < (aSize.height + bSize.height) / 2 + margin;
}

function blockedByRock(state: SimState, sectorId: number, position: Vec): boolean {
  return state.asteroids.some((rock) => rock.sectorId === sectorId
    && overlap(rock.position, position, rock.size, STATION_SITE_SIZE, ASTEROID_MIN_SPACING / 2));
}

function blockedByStationBody(state: SimState, sectorId: number, position: Vec): boolean {
  for (const station of state.stations) {
    if (station.sectorId !== sectorId) continue;
    const bodies = [
      ...station.modules,
      station.constructionSite,
      ...(station.construction ? [station.construction] : []),
      ...station.buildQueue,
    ];
    if (bodies.some((body) => overlap(body.position, position, body.size, STATION_SITE_SIZE, 0))) return true;
  }
  return false;
}

// The station a ship supplies comes from the player's selection, never from
// an automatic pick between several sites. Setting an unknown id is ignored,
// so a stale selection cannot redirect supply.
export function setSupplyStation(state: SimState, stationId: number): SimState {
  return state.stations.some((station) => station.id === stationId)
    ? { ...state, supplyStation: stationId }
    : state;
}

export function renameStation(state: SimState, stationId: number, name: string): SimState {
  const station = state.stations.find((candidate) => candidate.id === stationId);
  const trimmed = name.trim();
  return !station || !trimmed || station.name === trimmed ? state : replaceStation(state, { ...station, name: trimmed });
}

export function removeStation(state: SimState, stationId: number): SimState {
  const station = state.stations.find((candidate) => candidate.id === stationId);
  if (!station) return state;
  const ships = state.ships.map((ship) => {
    const buildingThere = ship.order?.kind === "supplyBuild" && ship.order.stationId === stationId;
    const dockedHere = ship.sectorId === station.sectorId && ship.state === "docked"
      && Math.abs(ship.position.x - station.dock.position.x) <= station.dock.size.width / 2
      && Math.abs(ship.position.y - station.dock.position.y) <= station.dock.size.height / 2;
    if (!buildingThere && !dockedHere) return ship;
    const nearby = { x: station.dock.position.x + station.dock.size.width / 2 + 12, y: station.dock.position.y };
    return { ...ship, sectorId: station.sectorId, position: nearby, state: "holding" as const, order: null, target: null, leg: null, berth: null, transfer: null, timer: 0 };
  });
  const stations = state.stations.filter((candidate) => candidate.id !== stationId);
  const supplyStation = state.supplyStation === stationId ? (stations[0]?.id ?? 0) : state.supplyStation;
  return { ...state, stations, ships, supplyStation };
}

// A station is founded once it stands on its own Dock: that is when it can
// take a sector name and a haul route, the way a built-out claim site did.
export function stationFounded(station: Station): boolean {
  return station.modules.some((module) => module.type === "Dock");
}

export function sectorClaimed(state: Pick<SimState, "stations">, sectorId: number): boolean {
  return state.stations.some((station) => station.sectorId === sectorId && station.id !== 0 && stationFounded(station));
}

export function renameSector(state: SimState, sectorId: number, name: string): SimState {
  const trimmed = name.trim();
  const sector = state.sectors[sectorId];
  // No name, or the name it already has: nothing changes, so the state is kept.
  if (!trimmed || !sectorClaimed(state, sectorId) || trimmed === sector?.name) return state;
  return { ...state, sectors: state.sectors.map((candidate) => (candidate.id === sectorId ? { ...candidate, name: trimmed } : candidate)) };
}
