import {
  ASTEROID_MIN_SPACING, BUILD_SECONDS, DOCK_SIZE, HOME_SECTOR,
  MODULE_COST, BUILDER_SIZE, STORAGE_SIZE, HIVE_SECTOR,
} from "./build-constants";
import { MATERIALS, MODULE_TYPES } from "./model";
import { freeBerth, berthPoint, DOCK_AREA } from "./dock-packing";
export { freeBerth, berthPoint, dockBerths } from "./dock-packing";
import type {
  Asteroid, AsteroidField, Beam, BerthLayout, CargoTransfer,
  DefaultBehaviour, Density, Delivery, GateEnd, GateProject, HaulRoute,
  HaulStationId, Leg, Material, ModuleConstruction, ModuleType, Order, Respawn,
  Sector, SectorCharacter, Ship, ShipBuild, ShipDesign, ShipState, SimState,
  Size, Station, StationModule, Target, Vec,
} from "./model";
export type * from "./model";
export { ASTEROID_MIN_SPACING, BUILD_SECONDS, DOCK_SIZE, HOME_SECTOR, MODULE_COST, BUILDER_SIZE, STORAGE_SIZE } from "./build-constants";
export {
  BUG_ATTACK_THRESHOLD, BUG_BITE_DAMAGE, BUG_BITE_RANGE, BUG_BITE_SECONDS,
  BUG_HOVER_MIN_REACH, BUG_HOVER_RADIUS, BUG_HP,
  BUG_SPAWN_SECONDS, BUG_SIZE, BUG_SPEED_FACTOR, HIVE_GATE_FRACTION, HIVE_HP,
  HIVE_SECTOR, HIVE_SIZE,
} from "./build-constants";
export { MATERIALS, MODULE_TYPES } from "./model";
export { MODULE_SPACING } from "./build-constants";
export function homeStation(state: Pick<SimState, "stations">): Station {
  const station = state.stations[0];
  if (!station) throw new Error("Simulation state has no Home station");
  return station;
}

export function stationById(state: Pick<SimState, "stations">, id: number): Station | undefined {
  return state.stations.find((candidate) => candidate.id === id);
}

export function replaceStation<T extends Pick<SimState, "stations">>(state: T, station: Station): T {
  return { ...state, stations: state.stations.map((candidate) => (candidate.id === station.id ? station : candidate)) };
}

export function replaceHomeStation<T extends Pick<SimState, "stations">>(state: T, station: Station): T {
  return { ...state, stations: [station, ...state.stations.slice(1)] };
}
import { distance, makeFields, placeInField, rocksInField } from "./fields";
export { availableModuleBuildSites, availableModuleBuilds, startModuleBuild, type ModuleBuildOption } from "./station-building";
export {
  FIELD_LAYOUT, BELT_ROCKS, CLUSTER_ROCKS, SPARSE_BELT_ROCKS,
  SPARSE_CLUSTER_ROCKS, BELT_RADIUS, BELT_SWEEP, BELT_WIDTH, CLUSTER_RADIUS,
  FIELD_MIN_REACH, FIELD_MAX_REACH, FIELD_SEPARATION, FIELD_GATE_CLEARANCE,
} from "./fields";
export { placeInField } from "./fields";
import { travelSeconds } from "./motion";
import { nextRandom } from "./prng";
import { hivePosition, makeHive } from "./enemies";
import {
  MINING_GAP,
  STARTING_SHIP,
  canMine,
  shipBuildCost,
  shipBuildSeconds,
  shipSize,
  speedFactor,
  cargoTransferSeconds,
  validDesign,
} from "./ship";

// Ship speed lives in motion.ts, and the mining and unloading rates in ship.ts.
export { CARGO_PER_TRIP, MINING_GAP, UNLOADING_SECONDS, WORKING_SECONDS } from "./ship";
// Three full trips per asteroid.
export const ASTEROID_ORE = 30;
// Placeholder, to tune at the demo.
export const RESPAWN_SECONDS = 30;

export const DOCK_CAPACITY = DOCK_AREA;
export const STORAGE_CAPACITY = 100;
// The construction site sits off the Dock's north-east corner. Placed between
// two module slots, so it takes none of the ones Home offers at the start.
export const CONSTRUCTION_SITE_POSITION: Vec = { x: 75, y: -60 };
export const CONSTRUCTION_SITE_SIZE = { width: 28, height: 28 };
// Placeholder: the site starts empty, so the first module needs a ship supplying
// it. Raise this if the first minute of play feels stuck before anything is built.
export const CONSTRUCTION_SITE_START: Record<Material, number> = { Metal: 0, Ice: 0 };
export const ASTEROID_SIZE = { width: 13, height: 10 };
// A rich rock is bigger and holds four times the ore of a plain one.
export const RICH_ORE_FACTOR = 4;
export const RICH_ORE = ASTEROID_ORE * RICH_ORE_FACTOR;
export const RICH_ASTEROID_SIZE = { width: 21, height: 16 };
// Share of a sector's rocks in its abundant material.
export const ABUNDANT_SHARE = 0.75;
export const JUMP_SECONDS = 2;
export const GATE_SIZE = { width: 24, height: 24 };
export const GATE_DISTANCE = 480;
export const SECTOR_COUNT = 4;
export const GATE_COST: Record<Material, number> = { Metal: 200, Ice: 200 };
export const SECTOR_MAP_POINTS = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }] as const;

// The home sector takes the first entry. It has no rich rocks, so the first
// mining trips are the same on every seed. The other sectors get the rest in
// an order picked from the seed, so a map always offers every kind of sector.
const SECTOR_CHARACTERS: readonly SectorCharacter[] = [
  { abundant: "Metal", density: "dense", richRocks: 0 },
  { abundant: "Ice", density: "sparse", richRocks: 2 },
  { abundant: "Metal", density: "sparse", richRocks: 3 },
  { abundant: "Ice", density: "dense", richRocks: 0 },
];
export function sectorInGateRange(a: number, b: number): boolean {
  const left = SECTOR_MAP_POINTS[a]; const right = SECTOR_MAP_POINTS[b];
  return !!left && !!right && Math.hypot(left.x - right.x, left.y - right.y) <= 1.5;
}

export function startGateBuild(state: SimState, fromSector: number, from: Vec, toSector: number, to: Vec): SimState {
  if (fromSector === toSector || !state.sectors[fromSector] || !state.sectors[toSector]
    || (fromSector !== HOME_SECTOR && toSector !== HOME_SECTOR) || !sectorInGateRange(fromSector, toSector)) return state;
  const project: GateProject = {
    id: state.nextGateId,
    ends: [{ sectorId: fromSector, position: { ...from } }, { sectorId: toSector, position: { ...to } }],
    delivered: { Metal: 0, Ice: 0 },
    complete: false,
  };
  return { ...state, nextGateId: state.nextGateId + 1, gateProjects: [...state.gateProjects, project] };
}

export function gateRoute(state: Pick<SimState, "sectors" | "gateProjects">, fromSector: number, toSector: number): { from: Vec; to: Vec } | null {
  const built = state.gateProjects.find((project) => project.complete
    && project.ends.some((end) => end.sectorId === fromSector)
    && project.ends.some((end) => end.sectorId === toSector));
  if (built) return {
    from: { ...built.ends.find((end) => end.sectorId === fromSector)!.position },
    to: { ...built.ends.find((end) => end.sectorId === toSector)!.position },
  };
  const from = state.sectors[fromSector]; const to = state.sectors[toSector];
  return from?.gate.to === toSector && to?.gate.to === fromSector
    ? { from: { ...from.gate.position }, to: { ...to.gate.position } } : null;
}

// Where the straight line from `from` to the asteroid's centre crosses its
// outline.
function edgeToward(asteroid: Asteroid, from: Vec): Vec {
  const dx = from.x - asteroid.position.x;
  const dy = from.y - asteroid.position.y;
  const scale = Math.min(
    asteroid.size.width / 2 / Math.abs(dx),
    asteroid.size.height / 2 / Math.abs(dy),
  );
  return { x: asteroid.position.x + dx * scale, y: asteroid.position.y + dy * scale };
}

// The point on the side of the asteroid facing the Dock, where a ship stops
// to mine it, with MINING_GAP between the ship's nose and the asteroid's edge.
export function miningSite(dock: Vec, asteroid: Asteroid, ship: Size = shipSize(STARTING_SHIP)): Vec {
  const edge = edgeToward(asteroid, dock);
  const d = distance(dock, asteroid.position);
  const ux = (dock.x - asteroid.position.x) / d;
  const uy = (dock.y - asteroid.position.y) / d;
  // Centre to outline of the ship along the line it flies in on.
  const nose = Math.min(ship.width / 2 / Math.abs(ux), ship.height / 2 / Math.abs(uy));
  return { x: edge.x + ux * (MINING_GAP + nose), y: edge.y + uy * (MINING_GAP + nose) };
}

// Rocks this ship may pick on its own. Other sectors are included only when
// the ship has explicitly been allowed to cross gates for mining.
export function minableRocks(ship: Ship, asteroids: Asteroid[]): Asteroid[] {
  return asteroids.filter((rock) => rock.sectorId === HOME_SECTOR
    && (ship.defaultBehaviour !== "mine" || ship.mineMaterials.includes(rock.material)));
}

// Older cargo-producing paths are deliberately still represented by a total
// and one material. Normalising here lets mining use a manifest without making
// hauling, gate supply and existing saved state dependent on it.
export function cargoByMaterial(ship: Pick<Ship, "cargo" | "cargoMaterial" | "cargoByMaterial">): Record<Material, number> {
  const listed = MATERIALS.reduce((total, material) => total + (ship.cargoByMaterial?.[material] ?? 0), 0);
  if (listed === ship.cargo && ship.cargoByMaterial) return { Metal: ship.cargoByMaterial.Metal, Ice: ship.cargoByMaterial.Ice };
  return {
    Metal: ship.cargoMaterial === "Metal" ? ship.cargo : 0,
    Ice: ship.cargoMaterial === "Ice" ? ship.cargo : 0,
  };
}

export function mineRouteDistance(
  ship: Ship,
  asteroid: Asteroid,
  sectors: Sector[],
  gateProjects: GateProject[],
): number {
  if (ship.sectorId === asteroid.sectorId) return distance(ship.position, asteroid.position);
  const route = gateRoute({ sectors, gateProjects }, ship.sectorId, asteroid.sectorId);
  return route ? distance(ship.position, route.from) + distance(route.to, asteroid.position) : Infinity;
}

export function nearestMineableRock(
  ship: Ship,
  asteroids: Asteroid[],
  sectors: Sector[],
  gateProjects: GateProject[],
  others: Ship[] = [],
  anyMaterial = false,
): Asteroid | null {
  const taken = new Set(others.filter((other) => other.id !== ship.id && (other.state === "outbound" || other.state === "working"))
    .map((other) => other.target?.asteroidId));
  let best: Asteroid | null = null;
  let bestTaken = true;
  let bestDistance = Infinity;
  for (const rock of asteroids) {
    if (rock.ore <= 0 || (!ship.mineOtherSectors && rock.sectorId !== ship.sectorId)
      || (!anyMaterial && !ship.mineMaterials.includes(rock.material))) continue;
    const routeDistance = mineRouteDistance(ship, rock, sectors, gateProjects);
    if (!Number.isFinite(routeDistance)) continue;
    const isTaken = taken.has(rock.id);
    if (!best || (bestTaken && !isTaken) || (bestTaken === isTaken && routeDistance < bestDistance)) {
      best = rock;
      bestTaken = isTaken;
      bestDistance = routeDistance;
    }
  }
  return best;
}

// The asteroid with ore left that is closest to the Dock, or null. Rocks no
// other ship is heading for or mining come first, so a fleet spreads out
// while there are rocks to go round.
export function nearestWithOre(dock: Vec, asteroids: Asteroid[], others: Ship[] = []): Asteroid | null {
  const taken = new Set(
    others
      .filter((other) => other.state === "outbound" || other.state === "working")
      .map((other) => other.target?.asteroidId),
  );
  let best: Asteroid | null = null;
  let bestTaken = true;
  for (const asteroid of asteroids) {
    if (asteroid.ore <= 0) continue;
    const isTaken = taken.has(asteroid.id);
    if (
      !best
      || (bestTaken && !isTaken)
      || (bestTaken === isTaken && distance(dock, asteroid.position) < distance(dock, best.position))
    ) {
      best = asteroid;
      bestTaken = isTaken;
    }
  }
  return best;
}

// Sends a ship sitting at the Dock to the nearest asteroid with ore, or
// leaves it idle if there is none or it can't mine.
// A ship leaving a pad flies out from the pad, not from the Dock's middle.
export function depart(ship: Ship, dock: Vec, asteroids: Asteroid[], others: Ship[] = []): Ship {
  const asteroid = canMine(ship.design) ? nearestWithOre(dock, minableRocks(ship, asteroids), others) : null;
  if (!asteroid) {
    return {
      ...ship,
      state: "idle",
      position: { ...dock },
      timer: 0,
      cargo: 0,
      cargoByMaterial: { Metal: 0, Ice: 0 },
      cargoMaterial: null,
      target: null,
      leg: null,
      transfer: null,
    };
  }
  const site = miningSite(dock, asteroid, shipSize(ship.design));
  const from = ship.berth === null ? dock : ship.position;
  return {
    ...ship,
    state: "outbound",
    position: { ...from },
    timer: travelSeconds(distance(from, site), speedFactor(ship.design)),
    cargo: 0,
    cargoByMaterial: { Metal: 0, Ice: 0 },
    cargoMaterial: asteroid.material,
    target: { asteroidId: asteroid.id, sectorId: HOME_SECTOR, site },
    leg: ship.berth === null ? null : { from: { ...from }, to: site },
    transfer: null,
  };
}

export function newAsteroid(id: number, sectorId: number, fieldId: number, position: Vec, material: Material, rich: boolean): Asteroid {
  return {
    id, sectorId, fieldId, position, material, rich,
    size: rich ? RICH_ASTEROID_SIZE : ASTEROID_SIZE,
    ore: rich ? RICH_ORE : ASTEROID_ORE,
  };
}

export function createInitialState(seed: number): SimState {
  const dockPosition = { x: 0, y: 0 };
  const storagePosition = { x: 40, y: 0 };
  let rng = seed >>> 0;

  const nameChoices = ["Kael", "Vela", "Oris", "Thara", "Mira", "Zorin", "Selen", "Draco", "Hyron", "Corin", "Neris", "Ulmar"];
  const sectorNames: string[] = [];
  while (sectorNames.length < SECTOR_COUNT) {
    const roll = nextRandom(rng); rng = roll.state;
    const name = nameChoices[Math.floor(roll.value * nameChoices.length)]!;
    if (!sectorNames.includes(name)) sectorNames.push(name);
  }
  // Character and rich rocks draw from a stream of their own, so the layout
  // the main stream gives a seed does not move when they change.
  let traits = (seed ^ 0x9e3779b9) >>> 0;
  const characters = [...SECTOR_CHARACTERS];
  for (let i = characters.length - 1; i > 1; i -= 1) {
    const choice = nextRandom(traits); traits = choice.state;
    const j = 1 + Math.floor(choice.value * i);
    [characters[i], characters[j]] = [characters[j]!, characters[i]!];
  }
  const sectors: Sector[] = Array.from({ length: SECTOR_COUNT }, (_, id) => {
    const roll = nextRandom(rng); rng = roll.state;
    const angle = roll.value * Math.PI * 2;
    return { id, name: sectorNames[id]!, generatedName: sectorNames[id]!,
      gate: { position: { x: Math.cos(angle) * GATE_DISTANCE, y: Math.sin(angle) * GATE_DISTANCE }, size: GATE_SIZE, to: id < 2 ? 1 - id : id },
      character: characters[id]! };
  });

  const fields: AsteroidField[] = [];
  const asteroids: Asteroid[] = [];
  for (const sector of sectors) {
    const made = makeFields(rng, sector.id, fields.length, sector.gate.position);
    rng = made.rng;
    fields.push(...made.fields);
    // Only the home sector has a station to keep clear of.
    const station = sector.id === HOME_SECTOR ? [dockPosition, storagePosition] : [];
    const blocked = sector.id === HOME_SECTOR ? [...station, CONSTRUCTION_SITE_POSITION] : [];
    const placed: { field: AsteroidField; position: Vec }[] = [];
    for (const field of made.fields) {
      const count = rocksInField(field.kind, sector.character.density);
      for (let i = 0; i < count; i += 1) {
        const taken = placed.map((rock) => rock.position);
        // A belt that happens to run across Home has no room left once the
        // construction site is kept clear too. Those seeds give the site up
        // rather than a rock.
        const spot = placeInField(rng, field, taken, blocked) ?? placeInField(rng, field, taken, station);
        // Starting fields are otherwise wide open, so there is always room.
        rng = spot!.rng;
        placed.push({ field, position: spot!.position });
      }
    }
    // The sector's mix shuffled independently of where the rocks are, so either
    // material can be the closest. Both always appear, so every sector has
    // something of each.
    const abundantCount = Math.min(placed.length - 1, Math.max(1, Math.round(placed.length * ABUNDANT_SHARE)));
    const other: Material = sector.character.abundant === "Metal" ? "Ice" : "Metal";
    const materials: Material[] = placed.map((_, i) => (i < abundantCount ? sector.character.abundant : other));
    const richFlags = placed.map((_, i) => i < sector.character.richRocks);
    for (let i = placed.length - 1; i > 0; i -= 1) {
      const choice = nextRandom(rng);
      rng = choice.state;
      const j = Math.floor(choice.value * (i + 1));
      [materials[i], materials[j]] = [materials[j]!, materials[i]!];
    }
    for (let i = richFlags.length - 1; i > 0; i -= 1) {
      const pick = nextRandom(traits);
      traits = pick.state;
      const k = Math.floor(pick.value * (i + 1));
      [richFlags[i], richFlags[k]] = [richFlags[k]!, richFlags[i]!];
    }
    asteroids.push(...placed.map(({ field, position }, i) => newAsteroid(
      asteroids.length + i, sector.id, field.id, position, materials[i]!, richFlags[i]!,
    )));
  }

  // The hive sits in the sector next to home, ready to breed bugs.
  const hive = makeHive(0, HIVE_SECTOR, hivePosition(sectors[HIVE_SECTOR]!.gate.position));
  const idle: Ship = {
    id: 0,
    design: STARTING_SHIP,
    state: "idle",
    sectorId: HOME_SECTOR,
    position: { ...dockPosition },
    timer: 0,
    cargo: 0,
    cargoByMaterial: { Metal: 0, Ice: 0 },
    cargoMaterial: null,
    target: null,
    homeStationId: 0,
    defaultBehaviour: "mine",
    mineMaterials: [],
    mineOtherSectors: false,
    order: null,
    leg: null,
    berth: null,
    transfer: null,
  };
  return {
    tickCount: 0,
    time: 0,
    rng,
    enemyRng: (seed ^ 0x5bf03635) >>> 0,
    nextAsteroidId: asteroids.length,
    sectors,
    fields,
    nextGateId: 0,
    gateProjects: [],
    nextStationId: 1,
    supplyStation: 0,
    nextShipId: 1,
    stations: [{
      id: 0,
      name: "Home",
      founding: false,
      sectorId: HOME_SECTOR,
      dock: { position: dockPosition, size: DOCK_SIZE, capacity: DOCK_CAPACITY },
      storage: { position: storagePosition, size: STORAGE_SIZE, capacity: STORAGE_CAPACITY },
      inventory: { Metal: 20, Ice: 20 },
      constructionSite: { position: { ...CONSTRUCTION_SITE_POSITION }, size: CONSTRUCTION_SITE_SIZE, inventory: { ...CONSTRUCTION_SITE_START } },
      storageLimits: { Metal: null, Ice: null },
      deliveries: [],
      modules: [
        { type: "Dock", position: dockPosition, size: DOCK_SIZE },
        { type: "Storage", position: storagePosition, size: STORAGE_SIZE },
      ],
      construction: null,
      buildQueue: [],
      shipBuilds: [],
    }],
    asteroids,
    respawns: [],
    ships: [depart(idle, dockPosition, asteroids)],
    hives: [hive],
    bugs: [],
    nextBugId: 0,
    finishedClaims: [],
  };
}

function storedTotal(inventory: Record<Material, number>): number {
  return MATERIALS.reduce((total, material) => total + inventory[material], 0);
}

// Parking spots fan out west of the Dock, six to an arc, one arc further out
// for each six ships parked.
const PARKING_RADIUS = 70;
const PARKING_ARC_STEP = 22;
const PARKING_ARC_SLOTS = 6;

export function berthLayout(station: Station): BerthLayout {
  return { dock: station.dock.position, sectorId: station.sectorId, modules: station.modules, capacity: station.dock.capacity };
}

function parkingPoint(dock: Vec, index: number): Vec {
  const arc = Math.floor(index / PARKING_ARC_SLOTS);
  const slot = index % PARKING_ARC_SLOTS;
  const angle = Math.PI + (slot - (PARKING_ARC_SLOTS - 1) / 2) * (Math.PI / 6);
  const radius = PARKING_RADIUS + arc * PARKING_ARC_STEP;
  return { x: dock.x + Math.cos(angle) * radius, y: dock.y + Math.sin(angle) * radius };
}

function hop(ship: Ship, to: Vec, berth: number | null): Ship {
  const from = { ...ship.position };
  const speed = Math.max(0.01, speedFactor(ship.design));
  return { ...ship, state: "berthing", berth, leg: { from, to: { ...to } }, timer: travelSeconds(distance(from, to), speed) };
}

// Reserves the first free rectangle and flies the ship to its centre.
export function toBerth(layout: BerthLayout, ships: Ship[], ship: Ship): Ship | null {
  const index = freeBerth(layout, ships.filter((other) => other.id !== ship.id), ship.design);
  return index === null ? null : hop(ship, berthPoint(layout, index, ship.design), index);
}

// The first parking spot nobody is on or flying to. `ship` is left out of the
// count, so a ship choosing a spot ignores the one it is standing on. A ship
// holding counts as being on its spot, which is what keeps a supply ship parked
// for want of a build and a ship waiting for a pad off one another.
function freeParkingSpot(layout: BerthLayout, ships: Ship[], ship: Ship): Vec {
  const claimed = ships
    .filter((other) => other.id !== ship.id)
    .flatMap((other) => other.state === "waiting" || other.state === "holding" ? [other.position]
      : other.state === "berthing" && other.berth === null && other.leg ? [other.leg.to] : []);
  let index = 0;
  while (claimed.some((spot) => distance(spot, parkingPoint(layout.dock, index)) < 1)) index += 1;
  return parkingPoint(layout.dock, index);
}

// Sends a ship to the first parking spot nobody is on or flying to.
export function toParking(layout: BerthLayout, ships: Ship[], ship: Ship): Ship {
  return hop(ship, freeParkingSpot(layout, ships, ship), null);
}

// A ship that has reached its parking spot or reserved Dock rectangle.
export function arrived(ship: Ship): Ship {
  const position = ship.leg ? { ...ship.leg.to } : ship.position;
  return ship.berth === null
    ? { ...ship, state: "waiting", position, leg: null, timer: 0 }
    : ship.order?.kind === "haulGate" && ship.cargo === 0 && ship.transfer
      ? { ...ship, state: "loading", position, leg: null, timer: cargoTransferSeconds(ship.transfer.amount) }
      : ship.defaultBehaviour === "haul" && ship.transfer?.startingCargo === 0
        ? { ...ship, state: "haulLoading", position, leg: null, timer: cargoTransferSeconds(ship.transfer.amount) }
        : ship.defaultBehaviour === "haul" && ship.transfer
          ? { ...ship, state: "haulUnloading", position, leg: null, timer: cargoTransferSeconds(ship.transfer.amount) }
      : { ...ship, state: "unloading", position, leg: null, transfer: { startingCargo: ship.cargo, amount: ship.cargo }, timer: cargoTransferSeconds(ship.cargo) };
}

// Whether a ship home with cargo can start unloading now: Storage has room
// and the Dock has a free berth.
export function canUnload(station: Station, ships: Ship[], material: Material | null = null, design: ShipDesign = STARTING_SHIP): boolean {
  const hasRoom = storedTotal(station.inventory) < station.storage.capacity;
  const canDiscard = material !== null
    && station.storageLimits[material] !== null
    && station.inventory[material] >= station.storageLimits[material]!;
  return (hasRoom || canDiscard) && freeBerth(berthLayout(station), ships, design) !== null;
}

// Admits waiting ships into free rectangles in fleet order.
export function dockWaitingShips(station: Station, ships: Ship[]): Ship[] {
  const next = [...ships];
  for (let i = 0; i < next.length; i += 1) {
    const ship = next[i]!;
    const canLoad = ship.state === "waiting" && ship.cargo === 0 && ship.order?.kind === "haulGate" && ship.transfer;
    if (ship.state === "waiting" && ((ship.cargo > 0 && canUnload(station, next, ship.cargoMaterial, ship.design)) || canLoad)) {
      next[i] = toBerth(berthLayout(station), next, ship) ?? ship;
    }
  }
  return next;
}

export function setStorageLimit(state: SimState, material: Material, limit: number | null): SimState {
  const home = homeStation(state);
  const normalized = limit === null ? null : Math.max(0, Math.floor(limit));
  const inventory = normalized === null || home.inventory[material] <= normalized
    ? home.inventory
    : { ...home.inventory, [material]: normalized };
  const station = {
    ...home,
    inventory,
    storageLimits: { ...home.storageLimits, [material]: normalized },
  };
  return { ...replaceHomeStation(state, station), ships: dockWaitingShips(station, state.ships) };
}

export function deleteStock(state: SimState, material: Material, amount: number): SimState {
  const home = homeStation(state);
  const removed = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const station = {
    ...home,
    inventory: {
      ...home.inventory,
      [material]: Math.max(0, home.inventory[material] - removed),
    },
  };
  return { ...replaceHomeStation(state, station), ships: dockWaitingShips(station, state.ships) };
}

// A Builder can take a job when it is built, idle, and Storage can pay.
export function availableShipBuild(state: SimState, builder: number, design: ShipDesign, stationId = 0): boolean {
  const home = stationById(state, stationId);
  if (!home) return false;
  const module = home.modules[builder];
  if (module?.type !== "Builder" || !validDesign(design)) return false;
  if (home.shipBuilds.some((job) => job.builder === builder)) return false;
  const cost = shipBuildCost(design);
  return MATERIALS.every((material) => home.inventory[material] >= cost[material]);
}

export function startShipBuild(state: SimState, builder: number, design: ShipDesign, stationId = 0): SimState {
  if (!availableShipBuild(state, builder, design, stationId)) return state;
  const home = stationById(state, stationId)!;
  const cost = shipBuildCost(design);
  const inventory = Object.fromEntries(
    MATERIALS.map((material) => [material, home.inventory[material] - cost[material]]),
  ) as Record<Material, number>;
  const job: ShipBuild = {
    stationId,
    builder,
    design: { ...design, slots: [...design.slots] },
    timer: shipBuildSeconds(design),
  };
  const station = { ...home, inventory, shipBuilds: [...home.shipBuilds, job] };
  const next = { ...replaceStation(state, station), ships: dockWaitingShips(station, state.ships) };
  return stationId === 0 ? { ...replaceHomeStation(next, station), ships: dockWaitingShips(station, state.ships) } : next;
}

// A mining ship's laser, from the ship to the near edge of the rock it is
// mining. Null whenever the ship is not mining.
export function laserBeam(state: SimState, ship: Ship): Beam | null {
  if (ship.state !== "working" || !ship.target) return null;
  const id = ship.target.asteroidId;
  const asteroid = state.asteroids.find((a) => a.id === id);
  if (!asteroid) return null;
  return { from: { ...ship.position }, to: edgeToward(asteroid, ship.position) };
}

export const INCOME_WINDOW_SECONDS = 60;

// Ore unloaded into storage over the last game minute, per material. Only
// what storage accepted counts, so a full station reads zero, and spending
// ore on builds or gates does not lower it.
export function stationIncome(state: SimState, stationId = 0): Record<Material, number> {
  const income = Object.fromEntries(MATERIALS.map((material) => [material, 0])) as Record<Material, number>;
  for (const delivery of stationById(state, stationId)?.deliveries ?? []) {
    if (delivery.at > state.time - INCOME_WINDOW_SECONDS) income[delivery.material] += delivery.amount;
  }
  return income;
}
