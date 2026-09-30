import { travelSeconds } from "./motion";
import { nextRandom } from "./prng";
import {
  MINING_GAP,
  STARTING_SHIP,
  canMine,
  shipBuildCost,
  shipBuildSeconds,
  shipSize,
  speedFactor,
  unloadingSeconds,
  validDesign,
  type ShipDesign,
} from "./ship";

// Ship speed lives in motion.ts, and the mining and unloading rates in ship.ts.
export { CARGO_PER_TRIP, MINING_GAP, UNLOADING_SECONDS, WORKING_SECONDS } from "./ship";
export const ASTEROID_MIN_DISTANCE = 200;
export const ASTEROID_MAX_DISTANCE = 400;
export const ASTEROID_COUNT = 4;
// Three full trips per asteroid.
export const ASTEROID_ORE = 30;
// Placeholder, to tune at the demo.
export const RESPAWN_SECONDS = 30;
// Keeps asteroids from landing on top of each other, or a respawn from landing
// where the last one ran out. About three asteroid widths.
export const ASTEROID_MIN_SPACING = 40;

export const MATERIALS = ["Metal", "Ice"] as const;
export type Material = (typeof MATERIALS)[number];

export const DOCK_CAPACITY = 6;
export const STORAGE_CAPACITY = 100;
export const DOCK_SIZE = { width: 30, height: 40 };
export const STORAGE_SIZE = { width: 30, height: 40 };
export const BUILDER_SIZE = { width: 30, height: 40 };
export const BUILD_SECONDS = 15;
export const MODULE_COST: Record<Material, number> = { Metal: 25, Ice: 25 };
export const MODULE_TYPES = ["Dock", "Storage", "Builder"] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];
export const ASTEROID_SIZE = { width: 13, height: 10 };
export const HOME_SECTOR = 0;
export const JUMP_SECONDS = 2;
export const GATE_SIZE = { width: 24, height: 24 };
export const GATE_DISTANCE = 480;

export interface Vec {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

// "idle" means sitting at the Dock, because no asteroid has ore or the ship
// can't mine. "waiting" means home with cargo and no room or no free berth.
export type ShipState = "idle" | "outbound" | "working" | "homebound" | "unloading" | "waiting" | "moving" | "holding" | "jumpingOut" | "jumpingHome";
export type DefaultBehaviour = "mine" | "none";
export type Order =
  | { kind: "mine"; asteroidId: number; loaded: boolean }
  | { kind: "move"; point: Vec; sectorId: number }
  | { kind: "home" };
export interface Leg { from: Vec; to: Vec }

export interface Target {
  asteroidId: number;
  sectorId: number;
  // Where the ship mines from. Kept on the ship so it can fly home after the
  // asteroid has been mined out and removed.
  site: Vec;
}

export interface Ship {
  id: number;
  design: ShipDesign;
  state: ShipState;
  sectorId: number;
  position: Vec;
  // Seconds left in the current state. Unused while idle.
  timer: number;
  cargo: number;
  cargoMaterial: Material | null;
  target: Target | null;
  defaultBehaviour: DefaultBehaviour;
  order: Order | null;
  leg: Leg | null;
}

export interface Station {
  sectorId: number;
  // The Dock is the station's home point: the position ships route to and
  // from, and the one the asteroid band is measured out from.
  dock: { position: Vec; size: Size; capacity: number };
  storage: { position: Vec; size: Size; capacity: number };
  inventory: Record<Material, number>;
  modules: StationModule[];
  construction: ModuleConstruction | null;
  shipBuilds: ShipBuild[];
}

export interface ShipBuild {
  // Index of the Builder in `modules`. Modules are only ever appended.
  builder: number;
  design: ShipDesign;
  timer: number;
}

export interface StationModule {
  type: ModuleType;
  position: Vec;
  size: Size;
}

export interface ModuleConstruction extends StationModule {
  timer: number;
}

export interface Asteroid {
  id: number;
  sectorId: number;
  position: Vec;
  size: Size;
  ore: number;
  material: Material;
}

export interface Respawn {
  sectorId: number;
  // Seconds until a new asteroid appears.
  timer: number;
  // Where the emptied asteroid was, so the new one lands somewhere else.
  lastPosition: Vec;
}

export interface SimState {
  tickCount: number;
  // PRNG state, carried here so respawn spots replay exactly from the seed.
  rng: number;
  nextAsteroidId: number;
  nextShipId: number;
  sectors: Sector[];
  station: Station;
  asteroids: Asteroid[];
  respawns: Respawn[];
  ships: Ship[];
}

export interface Sector { id: number; name: string; gate: { position: Vec; size: Size; to: number } }

function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// A random spot in the band around the Dock, re-rolled if it lands too
// close to anything in `avoid`. A station that fills the band pushes the
// fallback outward rather than allowing an asteroid under a module.
export function placeAsteroid(
  rng: number,
  dock: Vec,
  avoid: Vec[],
): { position: Vec; rng: number } {
  let position: Vec = dock;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const angle = nextRandom(rng);
    const band = nextRandom(angle.state);
    rng = band.state;
    const d =
      ASTEROID_MIN_DISTANCE + band.value * (ASTEROID_MAX_DISTANCE - ASTEROID_MIN_DISTANCE);
    position = {
      x: dock.x + Math.cos(angle.value * 2 * Math.PI) * d,
      y: dock.y + Math.sin(angle.value * 2 * Math.PI) * d,
    };
    if (avoid.every((other) => distance(other, position) >= ASTEROID_MIN_SPACING)) {
      return { position, rng };
    }
  }
  // A station can eventually occupy much of the starting asteroid band. If
  // random retries cannot find a gap, walk deterministic rings outside it so
  // a growing station can never trap future asteroids underneath itself.
  for (let ring = 1; ; ring += 1) {
    const radius = ASTEROID_MAX_DISTANCE + ring * ASTEROID_MIN_SPACING;
    for (let step = 0; step < 36; step += 1) {
      const angle = step * 2 * Math.PI / 36;
      position = { x: dock.x + Math.cos(angle) * radius, y: dock.y + Math.sin(angle) * radius };
      if (avoid.every((other) => distance(other, position) >= ASTEROID_MIN_SPACING)) {
        return { position, rng };
      }
    }
  }
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
export function depart(ship: Ship, dock: Vec, asteroids: Asteroid[], others: Ship[] = []): Ship {
  const asteroid = canMine(ship.design) ? nearestWithOre(dock, asteroids.filter((rock) => rock.sectorId === HOME_SECTOR), others) : null;
  if (!asteroid) {
    return { ...ship, state: "idle", position: { ...dock }, timer: 0, cargo: 0, cargoMaterial: null, target: null, leg: null };
  }
  const site = miningSite(dock, asteroid, shipSize(ship.design));
  return {
    ...ship,
    state: "outbound",
    position: { ...dock },
    timer: travelSeconds(distance(dock, site), speedFactor(ship.design)),
    cargo: 0,
    cargoMaterial: asteroid.material,
    target: { asteroidId: asteroid.id, sectorId: HOME_SECTOR, site },
    leg: null,
  };
}

export function createInitialState(seed: number): SimState {
  const dockPosition = { x: 0, y: 0 };
  const storagePosition = { x: 40, y: 0 };
  let rng = seed >>> 0;
  const positions: Vec[] = [];
  for (let id = 0; id < ASTEROID_COUNT; id += 1) {
    const placed = placeAsteroid(rng, dockPosition, [dockPosition, storagePosition, ...positions]);
    rng = placed.rng;
    positions.push(placed.position);
  }

  // Shuffle an even mix independently of distance, so either material can be
  // the closest while every starting field contains both.
  const materials: Material[] = ["Metal", "Metal", "Ice", "Ice"];
  for (let i = materials.length - 1; i > 0; i -= 1) {
    const choice = nextRandom(rng);
    rng = choice.state;
    const j = Math.floor(choice.value * (i + 1));
    [materials[i], materials[j]] = [materials[j]!, materials[i]!];
  }
  const asteroids: Asteroid[] = positions.map((position, id) => ({
    id, sectorId: HOME_SECTOR, position, size: ASTEROID_SIZE, ore: ASTEROID_ORE, material: materials[id]!,
  }));

  const nameChoices = ["Kael", "Vela", "Oris", "Thara", "Mira", "Zorin", "Selen", "Draco", "Hyron", "Corin", "Neris", "Ulmar"];
  const firstNameRoll = nextRandom(rng); rng = firstNameRoll.state;
  const secondNameRoll = nextRandom(rng); rng = secondNameRoll.state;
  const firstNameIndex = Math.floor(firstNameRoll.value * nameChoices.length);
  let secondNameIndex = Math.floor(secondNameRoll.value * nameChoices.length);
  if (secondNameIndex === firstNameIndex) secondNameIndex = (secondNameIndex + 1) % nameChoices.length;
  const sectorNames = [nameChoices[firstNameIndex]!, nameChoices[secondNameIndex]!];
  const sectors: Sector[] = [0, 1].map((id) => {
    const roll = nextRandom(rng); rng = roll.state;
    const angle = roll.value * Math.PI * 2;
    return { id, name: sectorNames[id]!,
      gate: { position: { x: Math.cos(angle) * GATE_DISTANCE, y: Math.sin(angle) * GATE_DISTANCE }, size: GATE_SIZE, to: 1 - id } };
  });
  const farCenter = { x: 0, y: 0 };
  const farPositions: Vec[] = [];
  for (let id = 0; id < ASTEROID_COUNT; id += 1) {
    const placed = placeAsteroid(rng, farCenter, farPositions);
    rng = placed.rng; farPositions.push(placed.position);
  }
  const farMaterials: Material[] = ["Metal", "Metal", "Ice", "Ice"];
  for (let i = farMaterials.length - 1; i > 0; i -= 1) {
    const choice = nextRandom(rng); rng = choice.state;
    const j = Math.floor(choice.value * (i + 1));
    [farMaterials[i], farMaterials[j]] = [farMaterials[j]!, farMaterials[i]!];
  }
  asteroids.push(...farPositions.map((position, id) => ({ id: ASTEROID_COUNT + id, sectorId: 1,
    position, size: ASTEROID_SIZE, ore: ASTEROID_ORE, material: farMaterials[id]! })));

  const idle: Ship = {
    id: 0,
    design: STARTING_SHIP,
    state: "idle",
    sectorId: HOME_SECTOR,
    position: { ...dockPosition },
    timer: 0,
    cargo: 0,
    cargoMaterial: null,
    target: null,
    defaultBehaviour: "mine",
    order: null,
    leg: null,
  };
  return {
    tickCount: 0,
    rng,
    nextAsteroidId: ASTEROID_COUNT * 2,
    sectors,
    nextShipId: 1,
    station: {
      sectorId: HOME_SECTOR,
      dock: { position: dockPosition, size: DOCK_SIZE, capacity: DOCK_CAPACITY },
      storage: { position: storagePosition, size: STORAGE_SIZE, capacity: STORAGE_CAPACITY },
      inventory: { Metal: 20, Ice: 20 },
      modules: [
        { type: "Dock", position: dockPosition, size: DOCK_SIZE },
        { type: "Storage", position: storagePosition, size: STORAGE_SIZE },
      ],
      construction: null,
      shipBuilds: [],
    },
    asteroids,
    respawns: [],
    ships: [depart(idle, dockPosition, asteroids)],
  };
}

export interface ModuleBuildOption {
  type: ModuleType;
  enabled: boolean;
}

export function availableModuleBuilds(state: SimState): ModuleBuildOption[] {
  const canPay = MATERIALS.every(
    (material) => state.station.inventory[material] >= MODULE_COST[material],
  );
  const enabled = canPay && state.station.construction === null;
  return MODULE_TYPES.map((type) => ({ type, enabled }));
}

// Centre-to-centre distance between neighbouring module slots.
export const MODULE_SPACING = 40;
const BUILD_DIRECTIONS: Vec[] = [
  { x: -MODULE_SPACING, y: 0 },
  { x: 0, y: -MODULE_SPACING },
  { x: 0, y: MODULE_SPACING },
  { x: MODULE_SPACING, y: 0 },
];

function samePosition(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}

export function availableModuleBuildSites(state: SimState): Vec[] {
  const occupied = [
    ...state.station.modules.map((module) => module.position),
    ...(state.station.construction ? [state.station.construction.position] : []),
  ];
  const sites: Vec[] = [];
  for (const module of state.station.modules) {
    for (const direction of BUILD_DIRECTIONS) {
      const site = { x: module.position.x + direction.x, y: module.position.y + direction.y };
      const blocked = occupied.some((position) => samePosition(position, site))
        || state.asteroids.some((asteroid) => distance(asteroid.position, site) < ASTEROID_MIN_SPACING);
      if (!blocked && !sites.some((position) => samePosition(position, site))) sites.push(site);
    }
  }
  return sites;
}

function moduleSize(type: ModuleType): Size {
  if (type === "Dock") return DOCK_SIZE;
  if (type === "Storage") return STORAGE_SIZE;
  return BUILDER_SIZE;
}

export function startModuleBuild(state: SimState, type: ModuleType, position: Vec): SimState {
  const option = availableModuleBuilds(state).find((candidate) => candidate.type === type);
  const site = availableModuleBuildSites(state).find((candidate) => samePosition(candidate, position));
  if (!option?.enabled || !site) return state;

  const inventory = Object.fromEntries(
    MATERIALS.map((material) => [material, state.station.inventory[material] - MODULE_COST[material]]),
  ) as Record<Material, number>;
  const construction: ModuleConstruction = {
    type,
    position: { ...site },
    size: moduleSize(type),
    timer: BUILD_SECONDS,
  };
  const station = { ...state.station, inventory, construction };
  return { ...state, station, ships: dockWaitingShips(station, state.ships) };
}

function storedTotal(inventory: Record<Material, number>): number {
  return MATERIALS.reduce((total, material) => total + inventory[material], 0);
}

// Whether a ship home with cargo can start unloading now: Storage has room
// and the Dock has a free berth.
export function canUnload(station: Station, ships: Ship[]): boolean {
  const unloading = ships.filter((ship) => ship.state === "unloading").length;
  return storedTotal(station.inventory) < station.storage.capacity
    && unloading < station.dock.capacity;
}

// Moves waiting ships into free berths in fleet order, so they take their turn.
export function dockWaitingShips(station: Station, ships: Ship[]): Ship[] {
  const next = [...ships];
  for (let i = 0; i < next.length; i += 1) {
    const ship = next[i]!;
    if (ship.state === "waiting" && ship.cargo > 0 && canUnload(station, next)) {
      next[i] = { ...ship, state: "unloading", timer: unloadingSeconds(ship.design) };
    }
  }
  return next;
}

// A Builder can take a job when it is built, idle, and Storage can pay.
export function availableShipBuild(state: SimState, builder: number, design: ShipDesign): boolean {
  const module = state.station.modules[builder];
  if (module?.type !== "Builder" || !validDesign(design)) return false;
  if (state.station.shipBuilds.some((job) => job.builder === builder)) return false;
  const cost = shipBuildCost(design);
  return MATERIALS.every((material) => state.station.inventory[material] >= cost[material]);
}

export function startShipBuild(state: SimState, builder: number, design: ShipDesign): SimState {
  if (!availableShipBuild(state, builder, design)) return state;
  const cost = shipBuildCost(design);
  const inventory = Object.fromEntries(
    MATERIALS.map((material) => [material, state.station.inventory[material] - cost[material]]),
  ) as Record<Material, number>;
  const job: ShipBuild = {
    builder,
    design: { ...design, slots: [...design.slots] },
    timer: shipBuildSeconds(design),
  };
  const station = { ...state.station, inventory, shipBuilds: [...state.station.shipBuilds, job] };
  return { ...state, station, ships: dockWaitingShips(station, state.ships) };
}

export interface Beam {
  from: Vec;
  to: Vec;
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
