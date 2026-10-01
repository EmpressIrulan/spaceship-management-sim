import type { ClaimSite } from "./claim";
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
  cargoTransferSeconds,
  validDesign,
  type ShipDesign,
} from "./ship";

// Ship speed lives in motion.ts, and the mining and unloading rates in ship.ts.
export { CARGO_PER_TRIP, MINING_GAP, UNLOADING_SECONDS, WORKING_SECONDS } from "./ship";
// Three full trips per asteroid.
export const ASTEROID_ORE = 30;
// Placeholder, to tune at the demo.
export const RESPAWN_SECONDS = 30;
// Keeps asteroids from landing on top of each other, or a respawn from landing
// where the last one ran out. About three asteroid widths.
export const ASTEROID_MIN_SPACING = 40;
// Rocks in the same belt or cluster may sit closer than that, or a belt would
// have no room to fill a gap once one rock is mined out.
export const ROCK_SPACING = 25;

// Each sector has these fields, at points picked from its own seed. A belt is
// an arc of a circle around its point, a cluster a disc.
export const FIELD_LAYOUT = ["belt", "cluster", "belt", "cluster"] as const;
export const BELT_ROCKS = 5;
export const CLUSTER_ROCKS = 4;
// A sparse sector has fewer rocks in every field than a dense one.
export const SPARSE_BELT_ROCKS = 3;
export const SPARSE_CLUSTER_ROCKS = 3;
export const BELT_RADIUS = 100;
export const BELT_SWEEP = 1.8;
export const BELT_WIDTH = 24;
export const CLUSTER_RADIUS = 55;
// How far from the sector's origin a field's point can be. Not tied to the
// station, which only happens to sit at the origin of the home sector.
const FIELD_MIN_REACH = 180;
const FIELD_MAX_REACH = 340;
const FIELD_SEPARATION = 240;
const FIELD_GATE_CLEARANCE = 150;

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
// A rich rock is bigger and holds four times the ore of a plain one.
export const RICH_ORE_FACTOR = 4;
export const RICH_ORE = ASTEROID_ORE * RICH_ORE_FACTOR;
export const RICH_ASTEROID_SIZE = { width: 21, height: 16 };
// Share of a sector's rocks in its abundant material.
export const ABUNDANT_SHARE = 0.75;
export const HOME_SECTOR = 0;
export const JUMP_SECONDS = 2;
export const GATE_SIZE = { width: 24, height: 24 };
export const GATE_DISTANCE = 480;
export const SECTOR_COUNT = 4;
export const GATE_COST: Record<Material, number> = { Metal: 200, Ice: 200 };
export const SECTOR_MAP_POINTS = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }] as const;

export interface Vec {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

// "idle" means sitting at the Dock, because no asteroid has ore or the ship
// can't mine. "waiting" means home with a transfer pending but no free berth,
// parked just off the Dock. "berthing" is the short hop from the Dock to a pad
// or a parking spot.
export type ShipState = "idle" | "outbound" | "working" | "homebound" | "berthing" | "loading" | "unloading" | "gateUnloading" | "waiting" | "moving" | "holding" | "jumpingOut" | "jumpingHome" | "gateHauling" | "gateReturning";
export type DefaultBehaviour = "mine" | "none";
export type Order =
  | { kind: "mine"; asteroidId: number; loaded: boolean }
  | { kind: "move"; point: Vec; sectorId: number }
  | { kind: "home" }
  | { kind: "haulGate"; gateId: number }
  | { kind: "supplySite"; siteId: number; point: Vec; sectorId: number };
export interface Leg { from: Vec; to: Vec }
export interface CargoTransfer { startingCargo: number; amount: number }

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
  // The pad this ship is unloading on or flying to, or null. Only meaningful
  // while it is unloading or berthing.
  berth: number | null;
  // The cargo aboard when this transfer began and the total units it will move.
  // This makes partial transfers deterministic and safe to interrupt.
  transfer: CargoTransfer | null;
}

export interface Station {
  sectorId: number;
  // The Dock is the station's home point: the position ships route to and
  // from, and the one the asteroid band is measured out from.
  dock: { position: Vec; size: Size; capacity: number };
  storage: { position: Vec; size: Size; capacity: number };
  inventory: Record<Material, number>;
  storageLimits: Record<Material, number | null>;
  // Ore that ships unloaded into storage within the last INCOME_WINDOW_SECONDS.
  deliveries: Delivery[];
  modules: StationModule[];
  construction: ModuleConstruction | null;
  shipBuilds: ShipBuild[];
}

export interface Delivery {
  // Game seconds since the start, so the figure follows game speed.
  at: number;
  material: Material;
  amount: number;
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
  rich: boolean;
  // The belt or cluster this rock belongs to, and comes back to when mined out.
  fieldId: number;
  position: Vec;
  size: Size;
  ore: number;
  material: Material;
}

interface FieldBase { id: number; sectorId: number; centre: Vec; radius: number }
export type AsteroidField =
  | (FieldBase & { kind: "cluster" })
  // The arc runs `sweep` radians from angle `from`, `width` thick.
  | (FieldBase & { kind: "belt"; from: number; sweep: number; width: number });

export interface Respawn {
  sectorId: number;
  fieldId: number;
  // Seconds until a new asteroid appears.
  timer: number;
  // A rich rock comes back as a rich rock, so a sector keeps its rich count.
  rich: boolean;
  // Where the emptied asteroid was, so the new one lands somewhere else.
  lastPosition: Vec;
}

export interface SimState {
  tickCount: number;
  // Game seconds ticked so far. Paused or slowed time does not advance it.
  time: number;
  // PRNG state, carried here so respawn spots replay exactly from the seed.
  rng: number;
  nextAsteroidId: number;
  nextShipId: number;
  sectors: Sector[];
  fields: AsteroidField[];
  nextGateId: number;
  gateProjects: GateProject[];
  nextClaimSiteId: number;
  claimSites: ClaimSite[];
  station: Station;
  asteroids: Asteroid[];
  respawns: Respawn[];
  ships: Ship[];
}

export type Density = "sparse" | "dense";
// What a sector is good for. Fixed when the sector is made.
export interface SectorCharacter {
  // The material most of the sector's rocks are made of.
  abundant: Material;
  density: Density;
  // How many rich rocks the sector starts with.
  richRocks: number;
}
export interface Sector { id: number; name: string; gate: { position: Vec; size: Size; to: number }; character: SectorCharacter }

// The home sector takes the first entry. It has no rich rocks, so the first
// mining trips are the same on every seed. The other sectors get the rest in
// an order picked from the seed, so a map always offers every kind of sector.
const SECTOR_CHARACTERS: readonly SectorCharacter[] = [
  { abundant: "Metal", density: "dense", richRocks: 0 },
  { abundant: "Ice", density: "sparse", richRocks: 2 },
  { abundant: "Metal", density: "sparse", richRocks: 3 },
  { abundant: "Ice", density: "dense", richRocks: 0 },
];
export interface GateEnd { sectorId: number; position: Vec }
export interface GateProject {
  id: number;
  ends: [GateEnd, GateEnd];
  delivered: Record<Material, number>;
  complete: boolean;
}

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

function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function insideField(field: AsteroidField, position: Vec): boolean {
  const d = distance(field.centre, position);
  if (field.kind === "cluster") return d <= field.radius;
  if (Math.abs(d - field.radius) > field.width / 2) return false;
  const turn = Math.atan2(position.y - field.centre.y, position.x - field.centre.x) - field.from;
  return ((turn % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) <= field.sweep;
}

// A random spot inside a belt or cluster, re-rolled if it lands too close to
// another rock (`rocks`) or to anything the station occupies (`blocked`). If
// random tries fail, a sweep of the whole field finds any spot left. A field
// the station has fully covered gets null, because a rock outside its field
// would not be in its belt or cluster; the caller tries again later.
export function placeInField(
  rng: number,
  field: AsteroidField,
  rocks: Vec[],
  blocked: Vec[],
): { position: Vec; rng: number } | null {
  const free = (position: Vec) =>
    rocks.every((other) => distance(other, position) >= ROCK_SPACING)
    && blocked.every((other) => distance(other, position) >= ASTEROID_MIN_SPACING);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const along = nextRandom(rng);
    const across = nextRandom(along.state);
    rng = across.state;
    const angle = field.kind === "belt" ? field.from + along.value * field.sweep : along.value * 2 * Math.PI;
    const d = field.kind === "belt"
      ? field.radius + (across.value - 0.5) * field.width
      : field.radius * Math.sqrt(across.value);
    const position = { x: field.centre.x + Math.cos(angle) * d, y: field.centre.y + Math.sin(angle) * d };
    if (free(position)) return { position, rng };
  }
  const reach = field.radius + (field.kind === "belt" ? field.width / 2 : 0);
  const step = ROCK_SPACING / 2;
  for (let x = -reach; x <= reach; x += step) {
    for (let y = -reach; y <= reach; y += step) {
      const position = { x: field.centre.x + x, y: field.centre.y + y };
      if (insideField(field, position) && free(position)) return { position, rng };
    }
  }
  return null;
}

// The sector's belts and clusters, each at a point of its own that keeps clear
// of the others and of the gate.
function makeFields(rng: number, sectorId: number, firstId: number, gate: Vec): { fields: AsteroidField[]; rng: number } {
  const fields: AsteroidField[] = [];
  for (const kind of FIELD_LAYOUT) {
    let centre: Vec = { x: 0, y: 0 };
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const angle = nextRandom(rng);
      const reach = nextRandom(angle.state);
      rng = reach.state;
      const d = FIELD_MIN_REACH + reach.value * (FIELD_MAX_REACH - FIELD_MIN_REACH);
      centre = { x: Math.cos(angle.value * 2 * Math.PI) * d, y: Math.sin(angle.value * 2 * Math.PI) * d };
      if (distance(centre, gate) >= FIELD_GATE_CLEARANCE
        && fields.every((field) => distance(field.centre, centre) >= FIELD_SEPARATION)) break;
    }
    const spin = nextRandom(rng);
    rng = spin.state;
    const id = firstId + fields.length;
    fields.push(kind === "belt"
      ? { id, sectorId, kind, centre, radius: BELT_RADIUS, from: spin.value * 2 * Math.PI, sweep: BELT_SWEEP, width: BELT_WIDTH }
      : { id, sectorId, kind, centre, radius: CLUSTER_RADIUS });
  }
  return { fields, rng };
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
// A ship leaving a pad flies out from the pad, not from the Dock's middle.
export function depart(ship: Ship, dock: Vec, asteroids: Asteroid[], others: Ship[] = []): Ship {
  const asteroid = canMine(ship.design) ? nearestWithOre(dock, asteroids.filter((rock) => rock.sectorId === HOME_SECTOR), others) : null;
  if (!asteroid) {
    return { ...ship, state: "idle", position: { ...dock }, timer: 0, cargo: 0, cargoMaterial: null, target: null, leg: null, transfer: null };
  }
  const site = miningSite(dock, asteroid, shipSize(ship.design));
  const from = ship.berth === null ? dock : ship.position;
  return {
    ...ship,
    state: "outbound",
    position: { ...from },
    timer: travelSeconds(distance(from, site), speedFactor(ship.design)),
    cargo: 0,
    cargoMaterial: asteroid.material,
    target: { asteroidId: asteroid.id, sectorId: HOME_SECTOR, site },
    leg: ship.berth === null ? null : { from: { ...from }, to: site },
    transfer: null,
  };
}

function rocksInField(kind: AsteroidField["kind"], density: Density): number {
  if (density === "dense") return kind === "belt" ? BELT_ROCKS : CLUSTER_ROCKS;
  return kind === "belt" ? SPARSE_BELT_ROCKS : SPARSE_CLUSTER_ROCKS;
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
    return { id, name: sectorNames[id]!,
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
    const blocked = sector.id === HOME_SECTOR ? [dockPosition, storagePosition] : [];
    const placed: { field: AsteroidField; position: Vec }[] = [];
    for (const field of made.fields) {
      const count = rocksInField(field.kind, sector.character.density);
      for (let i = 0; i < count; i += 1) {
        const spot = placeInField(rng, field, placed.map((rock) => rock.position), blocked);
        // Starting fields are wide open, so there is always room.
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
    berth: null,
    transfer: null,
  };
  return {
    tickCount: 0,
    time: 0,
    rng,
    nextAsteroidId: asteroids.length,
    sectors,
    fields,
    nextGateId: 0,
    gateProjects: [],
    nextClaimSiteId: 0,
    claimSites: [],
    nextShipId: 1,
    station: {
      sectorId: HOME_SECTOR,
      dock: { position: dockPosition, size: DOCK_SIZE, capacity: DOCK_CAPACITY },
      storage: { position: storagePosition, size: STORAGE_SIZE, capacity: STORAGE_CAPACITY },
      inventory: { Metal: 20, Ice: 20 },
      storageLimits: { Metal: null, Ice: null },
      deliveries: [],
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

// Everything that decides where ships sit at the Dock lives here: the pads,
// the parking spots and who holds which. The tick and the station operations
// both go through these, so there is one count of free berths.
export const BERTHS_PER_DOCK = DOCK_CAPACITY;
// How big a pad is drawn: a little bigger than the starting ship.
export const BERTH_PAD_SIZE = 13;
// Pads sit on an ellipse around the Dock's centre, two on each long side and
// one above and below. None lands on the Storage module beside the Dock.
const PAD_REACH = { x: 34, y: 38 };
// Parking spots fan out west of the Dock, six to an arc, one arc further out
// for each six ships waiting.
const PARKING_RADIUS = 70;
const PARKING_ARC_STEP = 22;
const PARKING_ARC_SLOTS = 6;

export interface BerthLayout {
  // The Dock ships route to. Parking spots are measured from here.
  dock: Vec;
  modules: StationModule[];
  capacity: number;
}

export function berthLayout(station: Station): BerthLayout {
  return { dock: station.dock.position, modules: station.modules, capacity: station.dock.capacity };
}

// The pads around a Dock whose centre is at `dock`, in the order ships take them.
export function dockBerths(dock: Vec): Vec[] {
  return Array.from({ length: BERTHS_PER_DOCK }, (_, k) => {
    const angle = ((k * 360) / BERTHS_PER_DOCK + 30) * (Math.PI / 180);
    return { x: dock.x + Math.cos(angle) * PAD_REACH.x, y: dock.y + Math.sin(angle) * PAD_REACH.y };
  });
}

// Berths count up through each Dock module in the order they were built.
export function berthPoint(layout: BerthLayout, index: number): Vec {
  const docks = layout.modules.filter((module) => module.type === "Dock").map((module) => module.position);
  const owner = docks.length > 0 ? docks[Math.floor(index / BERTHS_PER_DOCK) % docks.length]! : layout.dock;
  return dockBerths(owner)[index % BERTHS_PER_DOCK]!;
}

function parkingPoint(dock: Vec, index: number): Vec {
  const arc = Math.floor(index / PARKING_ARC_SLOTS);
  const slot = index % PARKING_ARC_SLOTS;
  const angle = Math.PI + (slot - (PARKING_ARC_SLOTS - 1) / 2) * (Math.PI / 6);
  const radius = PARKING_RADIUS + arc * PARKING_ARC_STEP;
  return { x: dock.x + Math.cos(angle) * radius, y: dock.y + Math.sin(angle) * radius };
}

function holdsBerth(ship: Ship): boolean {
  return ship.state === "loading" || (ship.state === "unloading" && ship.order?.kind !== "supplySite")
    || (ship.state === "berthing" && ship.berth !== null);
}

// The lowest free pad, or null when every berth is taken. A ship unloading
// without a pad of its own (an empty ship sent home) still uses up a berth.
export function freeBerth(layout: BerthLayout, ships: Ship[]): number | null {
  const holders = ships.filter(holdsBerth);
  if (holders.length >= layout.capacity) return null;
  const taken = new Set(holders.map((ship) => ship.berth));
  for (let index = 0; index < layout.capacity; index += 1) {
    if (!taken.has(index)) return index;
  }
  return null;
}

function hop(ship: Ship, to: Vec, berth: number | null): Ship {
  const from = { ...ship.position };
  const speed = Math.max(0.01, speedFactor(ship.design));
  return { ...ship, state: "berthing", berth, leg: { from, to: { ...to } }, timer: travelSeconds(distance(from, to), speed) };
}

// Sends a ship from where it is to the lowest free pad, or null if there is none.
export function toBerth(layout: BerthLayout, ships: Ship[], ship: Ship): Ship | null {
  const index = freeBerth(layout, ships);
  return index === null ? null : hop(ship, berthPoint(layout, index), index);
}

// Sends a ship to the first parking spot nobody is on or flying to.
export function toParking(layout: BerthLayout, ships: Ship[], ship: Ship): Ship {
  const claimed = ships
    .filter((other) => other.id !== ship.id)
    .flatMap((other) => other.state === "waiting" ? [other.position]
      : other.state === "berthing" && other.berth === null && other.leg ? [other.leg.to] : []);
  let index = 0;
  while (claimed.some((spot) => distance(spot, parkingPoint(layout.dock, index)) < 1)) index += 1;
  return hop(ship, parkingPoint(layout.dock, index), null);
}

// A ship that has reached its parking spot or pad.
export function arrived(ship: Ship): Ship {
  const position = ship.leg ? { ...ship.leg.to } : ship.position;
  return ship.berth === null
    ? { ...ship, state: "waiting", position, leg: null, timer: 0 }
    : ship.order?.kind === "haulGate" && ship.cargo === 0 && ship.transfer
      ? { ...ship, state: "loading", position, leg: null, timer: cargoTransferSeconds(ship.transfer.amount) }
      : { ...ship, state: "unloading", position, leg: null, transfer: { startingCargo: ship.cargo, amount: ship.cargo }, timer: cargoTransferSeconds(ship.cargo) };
}

// Whether a ship home with cargo can start unloading now: Storage has room
// and the Dock has a free berth.
export function canUnload(station: Station, ships: Ship[], material: Material | null = null): boolean {
  const hasRoom = storedTotal(station.inventory) < station.storage.capacity;
  const canDiscard = material !== null
    && station.storageLimits[material] !== null
    && station.inventory[material] >= station.storageLimits[material]!;
  return (hasRoom || canDiscard) && freeBerth(berthLayout(station), ships) !== null;
}

// Moves waiting ships onto free pads in fleet order, so they take their turn.
export function dockWaitingShips(station: Station, ships: Ship[]): Ship[] {
  const next = [...ships];
  for (let i = 0; i < next.length; i += 1) {
    const ship = next[i]!;
    const canLoad = ship.state === "waiting" && ship.cargo === 0 && ship.order?.kind === "haulGate" && ship.transfer;
    if (ship.state === "waiting" && ((ship.cargo > 0 && canUnload(station, next, ship.cargoMaterial)) || canLoad)) {
      next[i] = toBerth(berthLayout(station), next, ship) ?? ship;
    }
  }
  return next;
}

export function setStorageLimit(state: SimState, material: Material, limit: number | null): SimState {
  const normalized = limit === null ? null : Math.max(0, Math.floor(limit));
  const inventory = normalized === null || state.station.inventory[material] <= normalized
    ? state.station.inventory
    : { ...state.station.inventory, [material]: normalized };
  const station = {
    ...state.station,
    inventory,
    storageLimits: { ...state.station.storageLimits, [material]: normalized },
  };
  return { ...state, station, ships: dockWaitingShips(station, state.ships) };
}

export function deleteStock(state: SimState, material: Material, amount: number): SimState {
  const removed = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const station = {
    ...state.station,
    inventory: {
      ...state.station.inventory,
      [material]: Math.max(0, state.station.inventory[material] - removed),
    },
  };
  return { ...state, station, ships: dockWaitingShips(station, state.ships) };
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

export const INCOME_WINDOW_SECONDS = 60;

// Ore unloaded into storage over the last game minute, per material. Only
// what storage accepted counts, so a full station reads zero, and spending
// ore on builds or gates does not lower it.
export function stationIncome(state: SimState): Record<Material, number> {
  const income = Object.fromEntries(MATERIALS.map((material) => [material, 0])) as Record<Material, number>;
  for (const delivery of state.station.deliveries) {
    if (delivery.at > state.time - INCOME_WINDOW_SECONDS) income[delivery.material] += delivery.amount;
  }
  return income;
}
