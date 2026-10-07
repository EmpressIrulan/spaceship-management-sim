import { supplyQueueStatus } from "./station-build-queue";
import { haulStations, resumeHaulShip, validHaulRoute } from "./haul";
import { gateOutstanding } from "./gate-hauling";
import { travelSeconds } from "./motion";
import { canMine, cargoTransferSeconds, shipSize, shipStats, speedFactor } from "./ship";
import {
  berthLayout, MATERIALS, gateRoute, HOME_SECTOR, homeStation, miningSite, nearestMineableRock, replaceHomeStation, stationById, toBerth, toParking,
  type Asteroid, type DefaultBehaviour, type HaulRoute, type Material, type Order, type Station,
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
  const speed = Math.max(0.01, speedFactor(ship.design));
  return { ...ship, state, berth: null, transfer: null, leg: { from, to: { ...to } }, timer: travelSeconds(length, speed) };
}

function hold(ship: Ship): Ship {
  return { ...ship, state: "holding", berth: null, transfer: null, timer: 0, leg: null, target: null };
}

function routeHome(ship: Ship, dock: Vec, sectors: Sector[], gateProjects: SimState["gateProjects"], homeSector = HOME_SECTOR): Ship {
  const destination = ship.sectorId === homeSector ? dock : gateRoute({ sectors, gateProjects }, ship.sectorId, homeSector)?.from;
  if (!destination) return hold(ship);
  return fly(ship, "homebound", destination);
}

export function startMining(ship: Ship, rock: Asteroid, dock: Vec, sectors: Sector[], gateProjects: SimState["gateProjects"]): Ship {
  const rockSector = rock.sectorId;
  const route = rockSector === ship.sectorId ? null : gateRoute({ sectors, gateProjects }, ship.sectorId, rockSector);
  if (rockSector !== ship.sectorId && !route) return hold(ship);
  const approach = rockSector === ship.sectorId ? ship.position : route!.to;
  const site = miningSite(approach, rock, shipSize(ship.design));
  const shipTarget = {
    ...ship,
    target: { asteroidId: rock.id, sectorId: rockSector, site },
    cargoMaterial: rock.material,
  };
  const destination = rockSector === ship.sectorId ? site : route!.from;
  return fly(shipTarget, "outbound", destination);
}

export function nextMiningRock(
  ship: Ship,
  asteroids: Asteroid[],
  sectors: Sector[],
  gateProjects: SimState["gateProjects"],
  others: Ship[] = [],
  anyMaterial = false,
): Asteroid | null {
  return nearestMineableRock(ship, asteroids, sectors, gateProjects, others, anyMaterial);
}

export function resumeMining(ship: Ship, dock: Vec, asteroids: Asteroid[], sectors: Sector[], gateProjects: SimState["gateProjects"], others: Ship[] = [], homeSector = HOME_SECTOR): Ship {
  if (ship.defaultBehaviour === "none") return hold(ship);
  if (ship.cargo > 0) return routeHome({ ...ship, target: null }, dock, sectors, gateProjects, homeSector);
  const rock = nextMiningRock(ship, asteroids, sectors, gateProjects, others);
  if (!rock || !canMine(ship.design)) {
    // Idle means sitting at the Dock, so a ship elsewhere flies home first.
    const atDock = ship.sectorId === homeSector && (ship.berth !== null
      || (ship.position.x === dock.x && ship.position.y === dock.y));
    return atDock ? { ...ship, state: "idle", timer: 0, leg: null, target: null } : routeHome({ ...ship, target: null }, dock, sectors, gateProjects, homeSector);
  }
  return startMining(ship, rock, dock, sectors, gateProjects);
}

export function resumeDefaultShip(state: SimState, ship: Ship): Ship {
  const home = homeStation(state);
  const assignedHome = stationById(state, ship.homeStationId ?? 0) ?? home;
  // Supply ships deliver to the selected site; nothing selected means Home's
  // site, and it waits whenever that target has no build queued.
  const target = state.supplyStation === 0 ? undefined : stationById(state, state.supplyStation);
  if (supplyQueueStatus(ship, target?.buildQueue.length ?? home.buildQueue.length) === "waiting") {
    const atHome = ship.sectorId === home.sectorId
      && (ship.berth !== null || (ship.position.x === home.dock.position.x && ship.position.y === home.dock.position.y));
    // Idle where it already stands, so the tick sends it out to a parking spot
    // of its own. Holding it here would leave it on the Dock's middle, piled up
    // with every other waiting supplier.
    return atHome ? { ...ship, state: "idle", timer: 0, leg: null, target: null, berth: null, transfer: null }
      : routeHome(ship, assignedHome.dock.position, state.sectors, state.gateProjects, assignedHome.sectorId);
  }
  return ship.defaultBehaviour === "haul" ? resumeHaulShip(state, ship)
    : resumeMining(ship, assignedHome.dock.position, state.asteroids, state.sectors, state.gateProjects, state.ships, assignedHome.sectorId);
}

export function afterOrder(ship: Ship, dock: Vec, asteroids: Asteroid[], sectors: Sector[], gateProjects: SimState["gateProjects"], homeSector = HOME_SECTOR): Ship {
  const order = ship.order;
  if (order?.kind === "mine" && !order.loaded) {
    const rock = asteroids.find((a) => a.id === order.asteroidId);
    if (rock) return startMining(ship, rock, dock, sectors, gateProjects);
  }
  return resumeMining({ ...ship, order: null }, dock, asteroids, sectors, gateProjects, [], homeSector);
}

export type OrderTarget = { kind: "mine"; asteroidId: number } | { kind: "move"; point: Vec; sectorId?: number } | { kind: "home" } | { kind: "haulGate"; gateId: number } | { kind: "supplyBuild"; stationId: number };

export function setShipHome(state: SimState, ids: number[], stationId: number | null): SimState {
  if (stationId !== null && !stationById(state, stationId)) return state;
  let changed = false;
  const ships = state.ships.map((ship) => {
    if (!ids.includes(ship.id) || (ship.homeStationId ?? 0) === stationId) return ship;
    changed = true;
    return { ...ship, homeStationId: stationId };
  });
  return changed ? { ...state, ships } : state;
}

// Where a flying order ends, for the orders that cross a gate to get there.
export function travelOrder(order: Order | null): { point: Vec; sectorId: number } | null {
  return order?.kind === "move" || order?.kind === "supplyBuild" ? { point: order.point, sectorId: order.sectorId } : null;
}

// The station whose construction site this delivery is for: the one in the
// ship's supplyBuild order, or the site the supply default targets. Null means
// the site ships deliver to is Home's.
function supplyTargetStation(state: SimState, target: OrderTarget | null): Station | undefined {
  if (target?.kind === "supplyBuild") return stationById(state, target.stationId);
  if (state.supplyStation === 0) return undefined;
  return stationById(state, state.supplyStation);
}

function apply(ship: Ship, target: OrderTarget, point: Vec, state: SimState): Ship {
  const home = homeStation(state);
  const assignedHome = stationById(state, ship.homeStationId ?? 0) ?? home;
  if (target.kind === "haulGate") return ship;
  if (target.kind === "supplyBuild") {
    if (ship.cargo <= 0 || !ship.cargoMaterial) return ship;
    const station = stationById(state, target.stationId);
    if (!station) return ship;
    const route = gateRoute(state, ship.sectorId, station.sectorId);
    if (station.sectorId !== ship.sectorId && !route) return ship;
    const order = { kind: "supplyBuild" as const, stationId: target.stationId, point, sectorId: station.sectorId };
    return fly({ ...ship, target: null, order }, "moving", station.sectorId === ship.sectorId ? point : route!.from);
  }
  if (target.kind === "move") {
    const sectorId = target.sectorId ?? ship.sectorId;
    const order = { kind: "move" as const, point: target.point, sectorId };
    const route = gateRoute(state, ship.sectorId, sectorId);
    if (sectorId !== ship.sectorId && !route) return ship;
    const destination = sectorId === ship.sectorId ? point : route!.from;
    return fly({ ...ship, target: null, order }, "moving", destination);
  }
  if (target.kind === "home") return routeHome({ ...ship, target: null, order: { kind: "home" } }, assignedHome.dock.position, state.sectors, state.gateProjects, assignedHome.sectorId);
  if (!canMine(ship.design)) return ship;
  const rock = state.asteroids.find((a) => a.id === target.asteroidId);
  if (!rock) return ship;
  if (ship.cargo >= shipStats(ship.design).hold) {
    return routeHome({ ...ship, target: null, order: { kind: "mine", asteroidId: rock.id, loaded: false } }, assignedHome.dock.position, state.sectors, state.gateProjects, assignedHome.sectorId);
  }
  return startMining({ ...ship, order: { kind: "mine", asteroidId: rock.id, loaded: false } }, rock, home.dock.position, state.sectors, state.gateProjects);
}

export function giveOrder(state: SimState, ids: number[], target: OrderTarget): SimState {
  if (state.stations.length === 0) return state;
  const home = homeStation(state);
  const selected = state.ships.filter((ship) => ids.includes(ship.id) && ship.hangarId == null);
  if (!selected.length) return state;
  if (target.kind === "haulGate") {
    const project = state.gateProjects.find((candidate) => candidate.id === target.gateId && !candidate.complete);
    const end = project?.ends.find((candidate) => candidate.sectorId === home.sectorId);
    if (!project || !end) return state;
    let inventory = { ...home.inventory };
    const ships = [...state.ships];
    for (let index = 0; index < ships.length; index += 1) {
      const ship = ships[index]!;
      if (!ids.includes(ship.id) || ship.hangarId != null || shipStats(ship.design).hold <= 0) continue;
      const order = { kind: "haulGate" as const, gateId: project.id };
      const atStorage = ship.sectorId === home.sectorId
        && ship.position.x === home.dock.position.x && ship.position.y === home.dock.position.y;
      if (ship.cargo > 0) {
        ships[index] = atStorage
          ? { ...ship, state: "unloading", order, target: null, leg: null,
            transfer: { startingCargo: ship.cargo, amount: ship.cargo }, timer: cargoTransferSeconds(ship.cargo) }
          : { ...fly({ ...ship, target: null, order }, "moving", home.dock.position), state: "gateReturning" as const };
        continue;
      }
      if (!atStorage) {
        ships[index] = { ...fly({ ...ship, target: null, order }, "moving", home.dock.position), state: "gateReturning" as const };
        continue;
      }
      const outstanding = (material: "Metal" | "Ice") => gateOutstanding({ ...state, ships }, project.id, material, ship.id);
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
      const planned = { ...ship, cargo: 0, cargoByMaterial: { Metal: 0, Ice: 0 }, cargoMaterial: material, order, target: null,
        transfer: { startingCargo: 0, amount } };
      ships[index] = toBerth(berthLayout(home), ships, planned) ?? toParking(berthLayout(home), ships, planned);
    }
    return { ...replaceHomeStation(state, { ...home, inventory }), ships };
  }
  const station = target.kind === "supplyBuild" ? stationById(state, target.stationId) : undefined;
  if (target.kind === "supplyBuild" && !station) return state;
  const point = target.kind === "move" ? target.point : target.kind === "supplyBuild" ? station!.constructionSite.position
    : target.kind === "home" ? home.dock.position
    : (() => { const rock = state.asteroids.find((a) => a.id === target.asteroidId); return rock ? miningSite(home.dock.position, rock, shipSize(selected[0]!.design)) : null; })();
  if (!point) return state;
  const spots = formation(point, ids.length);
  return { ...state, ships: state.ships.map((ship) => {
    const slot = ids.indexOf(ship.id);
    return slot < 0 ? ship : apply(ship, target, target.kind === "home" ? point : spots[slot]!, state);
  }) };
}

export function resumeDefault(state: SimState, ids: number[]): SimState {
  return { ...state, ships: state.ships.map((ship) => ids.includes(ship.id) && ship.order
     ? resumeDefaultShip(state, { ...ship, order: null }) : ship) };
}

export function setDefaultBehaviour(state: SimState, ids: number[], behaviour: DefaultBehaviour): SimState {
  if (behaviour === "haul" && haulStations(state).length < 2) return state;
  return { ...state, ships: state.ships.map((ship) => {
    if (!ids.includes(ship.id)) return ship;
    const stations = haulStations(state);
    const haulRoute = ship.haulRoute ?? (stations[1] ? { from: stations[0]!.id, to: stations[1].id, material: "Metal" as const } : undefined);
    const next = { ...ship, defaultBehaviour: behaviour, haulRoute };
    const wasHauling = ship.state.startsWith("haul");
    if (!next.order && (behaviour === "haul" || wasHauling || next.state === "holding")) return resumeDefaultShip(state, next);
    return next;
  }) };
}

export function configureHaul(state: SimState, ids: number[], route: HaulRoute): SimState {
  if (!validHaulRoute(state, route)) return state;
  return { ...state, ships: state.ships.map((ship) => {
    if (!ids.includes(ship.id)) return ship;
    const next = { ...ship, defaultBehaviour: "haul" as const, haulRoute: { ...route } };
    return next.order ? next : resumeHaulShip(state, next);
  }) };
}

export { haulStations };

// Ticks or unticks a material for each named ship. A ship on its own default
// that is flying to or mining a rock it may no longer take drops it, and
// picks another or heads home.
export function setMineMaterial(state: SimState, ids: number[], material: Material, on: boolean): SimState {
  return { ...state, ships: state.ships.map((ship) => {
    if (!ids.includes(ship.id) || ship.mineMaterials.includes(material) === on) return ship;
    const mineMaterials = MATERIALS.filter((item) => item === material ? on : ship.mineMaterials.includes(item));
    const next = { ...ship, mineMaterials };
    if (next.defaultBehaviour !== "mine" || next.order) return next;
    const droppedRock = (next.state === "outbound" || next.state === "working") && next.cargoMaterial && !mineMaterials.includes(next.cargoMaterial);
    const stuck = next.state === "holding";
    return droppedRock || stuck
      ? resumeMining({ ...next, target: null }, homeStation(state).dock.position, state.asteroids, state.sectors, state.gateProjects, state.ships) : next;
  }) };
}

export function setMineOtherSectors(state: SimState, ids: number[], on: boolean): SimState {
  return { ...state, ships: state.ships.map((ship) => {
    if (!ids.includes(ship.id) || !!ship.mineOtherSectors === on) return ship;
    const next = { ...ship, mineOtherSectors: on };
    if (next.defaultBehaviour !== "mine" || next.order) return next;
    if (next.state !== "idle") return next;
    return resumeMining({ ...next, target: null }, homeStation(state).dock.position, state.asteroids, state.sectors, state.gateProjects, state.ships);
  }) };
}
