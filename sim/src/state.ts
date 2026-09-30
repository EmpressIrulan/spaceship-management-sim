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
  unloadingSeconds,
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
// can't mine. "waiting" means home with cargo and no room or no free berth.
export type ShipState = "idle" | "outbound" | "working" | "homebound" | "unloading" | "waiting" | "moving" | "holding" | "jumpingOut" | "jumpingHome" | "gateHauling" | "gateReturning"
  | "haulLoading" | "haulOutbound" | "haulJumpingOutbound" | "haulUnloading" | "haulReturning" | "haulJumpingReturning" | "haulWaitingSource" | "haulWaitingFull";
export type DefaultBehaviour = "mine" | "haul" | "none";
export type HaulStationId = "home" | `claim:${number}`;
export interface HaulRoute { from: HaulStationId; to: HaulStationId; material: Material }
export type Order =
  | { kind: "mine"; asteroidId: number; loaded: boolean }
  | { kind: "move"; point: Vec; sectorId: number }
  | { kind: "home" }
  | { kind: "haulGate"; gateId: number }
  | { kind: "supplySite"; siteId: number; point: Vec; sectorId: number };
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
  haulRoute?: HaulRoute;
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

export interface Sector { id: number; name: string; gate: { position: Vec; size: Size; to: number } }
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

  const nameChoices = ["Kael", "Vela", "Oris", "Thara", "Mira", "Zorin", "Selen", "Draco", "Hyron", "Corin", "Neris", "Ulmar"];
  const sectorNames: string[] = [];
  while (sectorNames.length < SECTOR_COUNT) {
    const roll = nextRandom(rng); rng = roll.state;
    const name = nameChoices[Math.floor(roll.value * nameChoices.length)]!;
    if (!sectorNames.includes(name)) sectorNames.push(name);
  }
  const sectors: Sector[] = Array.from({ length: SECTOR_COUNT }, (_, id) => {
    const roll = nextRandom(rng); rng = roll.state;
    const angle = roll.value * Math.PI * 2;
    return { id, name: sectorNames[id]!,
      gate: { position: { x: Math.cos(angle) * GATE_DISTANCE, y: Math.sin(angle) * GATE_DISTANCE }, size: GATE_SIZE, to: id < 2 ? 1 - id : id } };
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
      const count = field.kind === "belt" ? BELT_ROCKS : CLUSTER_ROCKS;
      for (let i = 0; i < count; i += 1) {
        const spot = placeInField(rng, field, placed.map((rock) => rock.position), blocked);
        // Starting fields are wide open, so there is always room.
        rng = spot!.rng;
        placed.push({ field, position: spot!.position });
      }
    }
    // An even mix shuffled independently of where the rocks are, so either
    // material can be the closest while every sector contains both.
    const materials: Material[] = placed.map((_, i) => (i < placed.length / 2 ? "Metal" : "Ice"));
    for (let i = materials.length - 1; i > 0; i -= 1) {
      const choice = nextRandom(rng);
      rng = choice.state;
      const j = Math.floor(choice.value * (i + 1));
      [materials[i], materials[j]] = [materials[j]!, materials[i]!];
    }
    asteroids.push(...placed.map(({ field, position }, i) => ({
      id: asteroids.length + i, sectorId: sector.id, fieldId: field.id, position, size: ASTEROID_SIZE, ore: ASTEROID_ORE,
      material: materials[i]!,
    })));
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

// Whether a ship home with cargo can start unloading now: Storage has room
// and the Dock has a free berth.
export function canUnload(station: Station, ships: Ship[]): boolean {
  const unloading = ships.filter((ship) => ship.state === "unloading" && ship.order?.kind !== "supplySite").length;
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
