import { travelSeconds } from "./motion";
import { nextRandom } from "./prng";

// Placeholder tuning. The client asked for the first cut to run four times
// slower, which puts one cycle at roughly 35 to 50 seconds. Ship speed lives
// in motion.ts.
export const WORKING_SECONDS = 12;
export const UNLOADING_SECONDS = 6;
export const CARGO_PER_TRIP = 10;
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
// The mining ship is meant to be the smallest ship class.
export const SHIP_SIZE = { width: 10, height: 7 };
export const ASTEROID_SIZE = { width: 13, height: 10 };
// How far off the asteroid's edge a ship stops to mine: three ship lengths.
// Placeholder, to tune at the demo.
export const MINING_GAP = 3 * SHIP_SIZE.width;

// The sector the station is in. Default mining never leaves it.
export const HOME_SECTOR = 0;
// Placeholder, to tune at the demo.
export const JUMP_SECONDS = 2;
export const GATE_SIZE = { width: 24, height: 24 };
// Past the asteroid band, so the starting rocks never sit on a gate.
export const GATE_DISTANCE = 480;
// Rocks in a sector with no station sit around this point.
export const SECTOR_CENTRE: Vec = { x: 0, y: 0 };

export interface Vec {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

// "idle" means waiting at the station because no asteroid has ore. The two
// jumping states are the time spent inside a gate, heading to the rock or home.
export type ShipState =
  | "idle"
  | "outbound"
  | "working"
  | "homebound"
  | "unloading"
  | "waiting"
  | "jumpingOut"
  | "jumpingHome";

export interface Target {
  asteroidId: number;
  sectorId: number;
  // Where the ship mines from. Kept on the ship so it can fly home after the
  // asteroid has been mined out and removed.
  site: Vec;
}

// A straight flight between two points in the ship's current sector.
export interface Leg {
  from: Vec;
  to: Vec;
}

export interface Ship {
  state: ShipState;
  sectorId: number;
  position: Vec;
  // Set while outbound or homebound, null otherwise.
  leg: Leg | null;
  // Seconds left in the current state. Unused while idle.
  timer: number;
  cargo: number;
  cargoMaterial: Material | null;
  target: Target | null;
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

export interface Gate {
  position: Vec;
  size: Size;
  // The sector it leads to.
  to: number;
}

export interface Sector {
  id: number;
  name: string;
  gate: Gate;
}

export interface SimState {
  tickCount: number;
  // PRNG state, carried here so respawn spots replay exactly from the seed.
  rng: number;
  nextAsteroidId: number;
  sectors: Sector[];
  station: Station;
  asteroids: Asteroid[];
  respawns: Respawn[];
  ships: Ship[];
}

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
export function miningSite(dock: Vec, asteroid: Asteroid): Vec {
  const edge = edgeToward(asteroid, dock);
  const d = distance(dock, asteroid.position);
  const ux = (dock.x - asteroid.position.x) / d;
  const uy = (dock.y - asteroid.position.y) / d;
  // Centre to outline of the ship along the line it flies in on.
  const nose = Math.min(SHIP_SIZE.width / 2 / Math.abs(ux), SHIP_SIZE.height / 2 / Math.abs(uy));
  return { x: edge.x + ux * (MINING_GAP + nose), y: edge.y + uy * (MINING_GAP + nose) };
}

// The asteroid with ore left that is closest to the Dock, or null.
export function nearestWithOre(dock: Vec, asteroids: Asteroid[]): Asteroid | null {
  let best: Asteroid | null = null;
  for (const asteroid of asteroids) {
    if (asteroid.ore <= 0) continue;
    if (!best || distance(dock, asteroid.position) < distance(dock, best.position)) {
      best = asteroid;
    }
  }
  return best;
}

// Starts a straight flight from where the ship is now.
export function fly(ship: Ship, state: "outbound" | "homebound", to: Vec): Ship {
  return {
    ...ship,
    state,
    leg: { from: { ...ship.position }, to: { ...to } },
    timer: travelSeconds(distance(ship.position, to)),
  };
}

// Sends a ship waiting at the Dock to the nearest home asteroid with ore, or
// leaves it idle if there is none.
export function depart(ship: Ship, dock: Vec, asteroids: Asteroid[]): Ship {
  const home = asteroids.filter((a) => a.sectorId === HOME_SECTOR);
  const asteroid = nearestWithOre(dock, home);
  const docked = { ...ship, position: { ...dock }, cargo: 0 };
  if (!asteroid) {
    return { ...docked, state: "idle", leg: null, timer: 0, cargoMaterial: null, target: null };
  }
  const site = miningSite(dock, asteroid);
  return fly(
    { ...docked, cargoMaterial: asteroid.material, target: { asteroidId: asteroid.id, sectorId: HOME_SECTOR, site } },
    "outbound",
    site,
  );
}

// Where a ship flies next on its way to its target: the rock itself when it
// is in the ship's sector, otherwise the gate out.
export function outboundStop(state: Pick<SimState, "sectors">, ship: Ship): Vec {
  if (ship.target && ship.target.sectorId === ship.sectorId) return ship.target.site;
  return state.sectors[ship.sectorId]!.gate.position;
}

// Where a ship flies next on its way home: the Dock when it is in the
// station's sector, otherwise the gate out.
export function homeboundStop(state: Pick<SimState, "sectors">, ship: Ship, dock: Vec): Vec {
  if (ship.sectorId === HOME_SECTOR) return dock;
  return state.sectors[ship.sectorId]!.gate.position;
}

// Sends the given ships to mine one load from an asteroid in any sector and
// bring it home. Cargo already aboard stays aboard.
export function orderMine(state: SimState, shipIndices: number[], asteroidId: number): SimState {
  const asteroid = state.asteroids.find((a) => a.id === asteroidId);
  if (!asteroid) return state;
  // Ships line up on the side of the rock they arrive from.
  const approach = asteroid.sectorId === HOME_SECTOR
    ? state.station.dock.position
    : state.sectors[asteroid.sectorId]!.gate.position;
  const target: Target = {
    asteroidId,
    sectorId: asteroid.sectorId,
    site: miningSite(approach, asteroid),
  };
  const ships = state.ships.map((ship, index) => {
    if (!shipIndices.includes(index)) return ship;
    const aimed: Ship = {
      ...ship,
      target,
      cargoMaterial: ship.cargo > 0 ? ship.cargoMaterial : asteroid.material,
    };
    // Mid-jump, the ship comes out of the far gate first and heads on from there.
    if (ship.state === "jumpingOut" || ship.state === "jumpingHome") {
      return { ...aimed, state: "jumpingOut" as const };
    }
    return fly(aimed, "outbound", outboundStop(state, aimed));
  });
  return { ...state, ships };
}

const NAME_STARTS = ["Ka", "Vel", "Or", "Tha", "Mir", "Zo", "Sel", "Dra", "Hy", "Cor", "Ne", "Ul", "Bra", "Xi", "Fen", "Ly"];
const NAME_MIDDLES = ["ra", "los", "ven", "dar", "mi", "tor", "ce", "na", "ri", "gan", "sk", "thu"];
const NAME_ENDS = ["", "", "", " II", " IV", " VII", " 9", " 12"];

function pick<T>(rng: number, from: readonly T[]): { value: T; rng: number } {
  const roll = nextRandom(rng);
  return { value: from[Math.floor(roll.value * from.length)]!, rng: roll.state };
}

// A random sector name, different from every name in `taken`.
function sectorName(rng: number, taken: string[]): { name: string; rng: number } {
  for (;;) {
    const start = pick(rng, NAME_STARTS);
    const middle = pick(start.rng, NAME_MIDDLES);
    const end = pick(middle.rng, NAME_ENDS);
    rng = end.rng;
    const name = start.value + middle.value + end.value;
    if (!taken.includes(name)) return { name, rng };
  }
}

// A point GATE_DISTANCE out from `centre` in a random direction.
function placeGate(rng: number, centre: Vec): { position: Vec; rng: number } {
  const angle = nextRandom(rng);
  const a = angle.value * 2 * Math.PI;
  return {
    position: { x: centre.x + Math.cos(a) * GATE_DISTANCE, y: centre.y + Math.sin(a) * GATE_DISTANCE },
    rng: angle.state,
  };
}

// Places ASTEROID_COUNT rocks around `centre`, an even mix of materials
// shuffled independently of distance, so either material can be the closest
// while every field contains both.
function placeField(
  rng: number,
  centre: Vec,
  avoid: Vec[],
  sectorId: number,
  firstId: number,
): { asteroids: Asteroid[]; rng: number } {
  const positions: Vec[] = [];
  for (let n = 0; n < ASTEROID_COUNT; n += 1) {
    const placed = placeAsteroid(rng, centre, [...avoid, ...positions]);
    rng = placed.rng;
    positions.push(placed.position);
  }
  const materials: Material[] = ["Metal", "Metal", "Ice", "Ice"];
  for (let i = materials.length - 1; i > 0; i -= 1) {
    const choice = nextRandom(rng);
    rng = choice.state;
    const j = Math.floor(choice.value * (i + 1));
    [materials[i], materials[j]] = [materials[j]!, materials[i]!];
  }
  const asteroids = positions.map((position, n) => ({
    id: firstId + n, sectorId, position, size: ASTEROID_SIZE, ore: ASTEROID_ORE, material: materials[n]!,
  }));
  return { asteroids, rng };
}

export function createInitialState(seed: number): SimState {
  const dockPosition = { x: 0, y: 0 };
  const storagePosition = { x: 40, y: 0 };
  // The home field is rolled first, so a seed still gives the home rocks it
  // gave before there were sectors.
  const home = placeField(seed >>> 0, dockPosition, [dockPosition, storagePosition], HOME_SECTOR, 0);
  let rng = home.rng;

  const sectors: Sector[] = [];
  for (let id = 0; id < 2; id += 1) {
    const named = sectorName(rng, sectors.map((s) => s.name));
    const gate = placeGate(named.rng, id === HOME_SECTOR ? dockPosition : SECTOR_CENTRE);
    rng = gate.rng;
    sectors.push({ id, name: named.name, gate: { position: gate.position, size: GATE_SIZE, to: 1 - id } });
  }
  const far = placeField(rng, SECTOR_CENTRE, [SECTOR_CENTRE, sectors[1]!.gate.position], 1, ASTEROID_COUNT);
  rng = far.rng;
  const asteroids = [...home.asteroids, ...far.asteroids];

  const idle: Ship = {
    state: "idle",
    sectorId: HOME_SECTOR,
    position: { ...dockPosition },
    leg: null,
    timer: 0,
    cargo: 0,
    cargoMaterial: null,
    target: null,
  };
  return {
    tickCount: 0,
    rng,
    nextAsteroidId: asteroids.length,
    sectors,
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
        || state.asteroids.some((asteroid) =>
          asteroid.sectorId === state.station.sectorId
          && distance(asteroid.position, site) < ASTEROID_MIN_SPACING)
        || distance(state.sectors[state.station.sectorId]!.gate.position, site) < ASTEROID_MIN_SPACING;
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
  const stored = MATERIALS.reduce((total, material) => total + inventory[material], 0);
  const hasRoom = stored < state.station.storage.capacity;
  const ships = state.ships.map((ship) =>
    ship.state === "waiting" && ship.cargo > 0 && hasRoom
      ? { ...ship, state: "unloading" as const, timer: UNLOADING_SECONDS }
      : ship,
  );

  return {
    ...state,
    station: { ...state.station, inventory, construction },
    ships,
  };
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
