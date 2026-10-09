export interface Vec { x: number; y: number }
export interface Size { width: number; height: number }
export const MATERIALS = ["Metal", "Ice"] as const;
export type Material = (typeof MATERIALS)[number];
export type Density = "sparse" | "dense";

interface FieldBase { id: number; sectorId: number; centre: Vec; radius: number }
export type AsteroidField =
  | (FieldBase & { kind: "cluster" })
  // The arc runs `sweep` radians from angle `from`, `width` thick.
  | (FieldBase & { kind: "belt"; from: number; sweep: number; width: number });

export type ModuleType = (typeof MODULE_TYPES)[number];
export const MODULE_TYPES = ["Dock", "Storage", "Builder", "Claim"] as const;

// Hull is structure only. It costs, weighs (it dilutes the engine share) and draws, but does nothing.
// Gun shoots bugs and the hive on the ship's own; see enemies.ts.
export const SHIP_MODULES = ["Engine", "Laser", "Storage", "Hangar", "Hull", "Gun"] as const;
export type ShipModule = (typeof SHIP_MODULES)[number];
export interface ShipDesign { width: number; height: number; slots: (ShipModule | null)[] }

// "idle" means sitting at the Dock, because no asteroid has ore or the ship
// can't mine. "waiting" means home with a transfer pending but no free berth,
// parked just off the Dock. "berthing" is the short hop from the Dock to a pad
// or a parking spot.
export type ShipState =
  | "idle" | "outbound" | "working" | "homebound" | "berthing" | "loading" | "unloading"
  | "gateUnloading" | "waiting" | "moving" | "holding" | "docking" | "docked"
  | "jumpingOut" | "jumpingHome" | "gateHauling" | "gateReturning" | "haulLoading"
  | "haulOutbound" | "haulJumpingOutbound" | "haulUnloading" | "haulReturning"
  | "haulJumpingReturning" | "haulWaitingSource" | "haulWaitingFull";
export type DefaultBehaviour = "mine" | "haul" | "supply" | "none";
export type HaulStationId = "home" | `station:${number}`;
// Haul loads at a station's Storage; a route may end at the same station's
// construction site instead of another Storage.
export type HaulDestinationId = HaulStationId | `site:${number}`;
export interface HaulRoute { from: HaulStationId; to: HaulDestinationId; material: Material }
export type Order =
  | { kind: "mine"; asteroidId: number; loaded: boolean }
  | { kind: "move"; point: Vec; sectorId: number }
  | { kind: "home" }
  | { kind: "haulGate"; gateId: number }
  | { kind: "supplyBuild"; stationId: number; point: Vec; sectorId: number }
  | { kind: "dock"; carrierId: number };
export interface Leg { from: Vec; to: Vec }
export interface CargoTransfer {
  startingCargo: number;
  amount: number;
  // Set when the cargo goes into the construction site, not Storage.
  destination?: "constructionSite";
}

export interface Target {
  asteroidId: number;
  sectorId: number;
  // Where the ship mines from. Kept on the ship so it can fly home after the
  // asteroid has been mined out and removed.
  site: Vec;
}

export interface Ship {
  id: number;
  // Station this ship treats as home. Missing on older fixtures means Home (id 0).
  homeStationId?: number | null;
  design: ShipDesign;
  state: ShipState;
  sectorId: number;
  position: Vec;
  // Seconds left in the current state. Unused while idle.
  timer: number;
  cargo: number;
  // The contents of a mining hold. `cargo` remains the total so movement,
  // capacity and the non-mining cargo jobs can share the same state machine.
  cargoByMaterial?: Record<Material, number>;
  cargoMaterial: Material | null;
  target: Target | null;
  defaultBehaviour: DefaultBehaviour;
  haulRoute?: HaulRoute;
  // What "Mine for Station" is allowed to mine. Empty means nothing, so a
  // new ship sits idle until someone ticks a material.
  mineMaterials: Material[];
  mineOtherSectors?: boolean;
  order: Order | null;
  leg: Leg | null;
  // Dock module * 96 + top-left pixel of the reserved bounding rectangle,
  // or null when no Dock room is reserved.
  berth: number | null;
  // The cargo aboard when this transfer began and the total units it will move.
  // This makes partial transfers deterministic and safe to interrupt.
  transfer: CargoTransfer | null;
  // Current and full hull. Bugs bite these down; at 0 the ship explodes and it
  // and its cargo are gone. Missing on older fixtures and on ships that have
  // not been bitten: a fresh ship still has SHIP_HP of hull.
  hp?: number;
  maxHp?: number;
  // Set while this ship is hidden inside another ship.
  hangarId?: number | null;
  // A Gun ship's reload: seconds until the gun may fire again. Missing means
  // the gun has never counted: it fires the moment a target walks in range.
  // Only gun ships carry it.
  gunTimer?: number;
  // The shot in flight: where the last one went and how much longer the
  // renderer draws it. Null once the flash has burned out.
  gunShot?: GunShot | null;
}

export interface Station {
  // Home carries 0; each placed station gets the next count up.
  id: number;
  name: string;
  // True while the station is still building itself up the way the game
  // starts: a Dock, then a Storage, from whatever ships bring to its site.
  founding: boolean;
  sectorId: number;
  // The Dock is the station's home point: the position ships route to and
  // from, and the one the asteroid band is measured out from.
  dock: { position: Vec; size: Size; capacity: number };
  storage: { position: Vec; size: Size; capacity: number };
  inventory: Record<Material, number>;
  // Build storage. Modules the station builds are paid from here and only ships
  // fill it. It has no cap, so it has no capacity field.
  constructionSite: { position: Vec; size: Size; inventory: Record<Material, number> };
  storageLimits: Record<Material, number | null>;
  // Ore that ships unloaded into storage within the last INCOME_WINDOW_SECONDS.
  deliveries: Delivery[];
  modules: StationModule[];
  construction: ModuleConstruction | null;
  buildQueue: QueuedModuleBuild[];
  shipBuilds: ShipBuild[];
}

export interface Delivery {
  // Game seconds since the start, so the figure follows game speed.
  at: number;
  material: Material;
  amount: number;
}

export interface ShipBuild {
  stationId?: number;
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

export type QueuedModuleBuild = StationModule;

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

// Loot that floats where the thing died. Nothing collects these yet.
export type DropKind = "bugJuice" | "queenLarvae";
export interface Drop {
  id: number;
  sectorId: number;
  kind: DropKind;
  position: Vec;
}

// Enemies. The hive breeds the bugs; dead-hive founding is a later slice.
export interface Hive {
  id: number;
  sectorId: number;
  position: Vec;
  hp: number;
  maxHp: number;
  // Seconds until the next bug hatches.
  spawnTimer: number;
  // False once killed: a dead hive stops releasing bugs.
  alive: boolean;
}
// Hovering bugs hang about the hive; hunting ones fly at a ship and bite it.
export type BugState = "hovering" | "hunting";
export interface Bug {
  id: number;
  // The hive this bug came from, so loitering has a centre.
  hiveId: number;
  sectorId: number;
  position: Vec;
  hp: number;
  maxHp: number;
  state: BugState;
  // The ship this bug flies at and bites, when it hunts. Null while hovering.
  targetShipId: number | null;
  leg: Leg | null;
  // Seconds left in the current leg. Unused while holding still.
  timer: number;
}

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
  // The enemies' PRNG stream of their own, so their constant, everywhere-in
  // the tick loitering never perturbs where the main stream puts a rock.
  // Missing on older fixtures: falls out of the main stream's seed.
  enemyRng?: number;
  nextAsteroidId: number;
  nextShipId: number;
  sectors: Sector[];
  fields: AsteroidField[];
  nextGateId: number;
  gateProjects: GateProject[];
  // Runs alongside the station ids, so placed sites keep their number forever.
  nextStationId: number;
  // The station whose construction site supply ships bring stock to, by
  // default or by right-click. Home by default.
  supplyStation: number;
  stations: Station[];
  asteroids: Asteroid[];
  respawns: Respawn[];
  ships: Ship[];
  // The hive and its bugs. Missing on older fixtures means no enemies.
  hives?: Hive[];
  bugs?: Bug[];
  nextBugId?: number;
  // Loot floating where a bug or the hive died. Missing on older fixtures
  // means no drops.
  drops?: Drop[];
  nextDropId?: number;
  // The sector of each Claim module that stood during the last tick, one entry
  // per Claim. The app asks for a name for the first.
  finishedClaims: number[];
}

// What a sector is good for. Fixed when the sector is made.
export interface SectorCharacter {
  // The material most of the sector's rocks are made of.
  abundant: Material;
  density: Density;
  // How many rich rocks the sector starts with.
  richRocks: number;
}
// `name` is the player's name while the sector is claimed. `generatedName` is
// the name it was given at the start, which comes back when it unclaims.
export interface Sector { id: number; name: string; generatedName: string; gate: { position: Vec; size: Size; to: number }; character: SectorCharacter }

export interface GateEnd { sectorId: number; position: Vec }
export interface GateProject {
  id: number;
  ends: [GateEnd, GateEnd];
  delivered: Record<Material, number>;
  complete: boolean;
}

export interface BerthLayout {
  // The Dock ships route to. Parking spots are measured from here.
  dock: Vec;
  sectorId: number;
  modules: StationModule[];
  capacity: number;
}

export interface Beam {
  from: Vec;
  to: Vec;
}

// One gun shot, drawn for GUN_SHOT_SECONDS after it fires: where the shot was
// aimed (the target's position when it fired) and how much longer it draws.
export interface GunShot {
  from: Vec;
  to: Vec;
  target: { kind: "bug" | "hive"; id: number };
  timer: number;
}
