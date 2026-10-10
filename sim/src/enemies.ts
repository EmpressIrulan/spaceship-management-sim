import {
  BUG_ATTACK_THRESHOLD, BUG_BITE_DAMAGE, BUG_BITE_RANGE, BUG_BITE_SECONDS,
  BUG_HOVER_MIN_REACH, BUG_HOVER_RADIUS, BUG_HP, BUG_SPAWN_SECONDS,
  BUG_SPEED_FACTOR, GUN_DAMAGE, GUN_RANGE, GUN_SECONDS, GUN_SHOT_SECONDS,
  HIVE_GATE_FRACTION, HIVE_HP, MODULE_HP,
} from "./build-constants";
import { travelSeconds } from "./motion";
import { nextRandom } from "./prng";
import { shipModuleCounts } from "./ship";
import { damageShip, advanceShields, nextShieldEvent } from "./shields";
import { damageStationModule } from "./station-build-queue";
import type { Beam, Bug, DropKind, GunShot, Hive, Ship, ShipDesign, SimState, Station, StationModule, Vec } from "./model";
import type { Draft } from "./tick-mining";

// Where a sector's hive sits: along the line from the sector's middle to its
// gate, clear of the gate mouth. A placeholder spot until the sector art
// decides where hives belong.
export function hivePosition(gate: Vec): Vec {
  return { x: gate.x * HIVE_GATE_FRACTION, y: gate.y * HIVE_GATE_FRACTION };
}

export function makeHive(id: number, sectorId: number, position: Vec): Hive {
  return {
    id,
    sectorId,
    position: { ...position },
    hp: HIVE_HP,
    maxHp: HIVE_HP,
    // The first bug takes a full spawn interval to hatch.
    spawnTimer: BUG_SPAWN_SECONDS,
    alive: true,
  };
}

// The hive's rng stream places the bug, so the same seed hatches the same
// bugs in the same spots every run.
export function spawnBug(draft: Draft, hive: Hive): Bug {
  const angleRoll = nextRandom(draft.enemyRng);
  draft.enemyRng = angleRoll.state;
  const reachRoll = nextRandom(draft.enemyRng);
  draft.enemyRng = reachRoll.state;
  const angle = angleRoll.value * Math.PI * 2;
  const radius = reachRoll.value * BUG_HOVER_RADIUS;
  return {
    id: draft.nextBugId,
    hiveId: hive.id,
    sectorId: hive.sectorId,
    position: {
      x: hive.position.x + Math.cos(angle) * radius,
      y: hive.position.y + Math.sin(angle) * radius,
    },
    hp: BUG_HP,
    maxHp: BUG_HP,
    state: "hovering",
    targetShipId: null,
    targetModule: null,
    leg: null,
    timer: 0,
  };
}

// A new point to loiter at, inside the hover ring around the hive. The minimum
// reach keeps the point off the bug's current spot, so the leg always takes
// real time and the tick never spins on a zero-length hop.
function loiterPoint(draft: Draft, hive: Hive, bug: Bug): { to: Vec; seconds: number } {
  const angleRoll = nextRandom(draft.enemyRng);
  draft.enemyRng = angleRoll.state;
  const reachRoll = nextRandom(draft.enemyRng);
  draft.enemyRng = reachRoll.state;
  const angle = angleRoll.value * Math.PI * 2;
  const radius = BUG_HOVER_MIN_REACH + reachRoll.value * (BUG_HOVER_RADIUS - BUG_HOVER_MIN_REACH);
  const to = {
    x: hive.position.x + Math.cos(angle) * radius,
    y: hive.position.y + Math.sin(angle) * radius,
  };
  const length = Math.hypot(to.x - bug.position.x, to.y - bug.position.y);
  return { to, seconds: loiterSeconds(length) };
}

// Loiter legs run a whole number of LOITER_QUANTUM seconds, and that quantum
// is a dyadic fraction: binary floats then step every enemy timer exactly, so
// the other timers a tick walks with them — a 300 s Claim build, for one —
// still finish on their second rather than a rounding dust past it.
const LOITER_QUANTUM = 1 / 16;

function loiterSeconds(length: number): number {
  const raw = length < 1 ? 1 : travelSeconds(length, BUG_SPEED_FACTOR);
  return Math.ceil(raw / LOITER_QUANTUM) * LOITER_QUANTUM;
}

// Chase legs run the same quantum as loiter legs, for the same reason: a
// swarm's bites then land in steps whose lengths are dyadic fractions, and the
// timers the tick travels between finish on their exact second rather than a
// rounding dust past it.
function huntSeconds(length: number): number {
  const raw = travelSeconds(length, BUG_SPEED_FACTOR);
  return Math.ceil(raw / LOITER_QUANTUM) * LOITER_QUANTUM;
}

// Moves a bug partway through its current leg, leaving `timer` seconds.
function progressBug(bug: Bug, seconds: number): Bug {
  const timer = bug.timer - seconds;
  if (!bug.leg) return { ...bug, timer: Math.max(0, timer) };
  const length = Math.hypot(bug.leg.to.x - bug.leg.from.x, bug.leg.to.y - bug.leg.from.y);
  const total = travelSeconds(length, BUG_SPEED_FACTOR);
  const elapsed = total - timer;
  const fraction = total <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / total));
  return {
    ...bug,
    timer,
    position: {
      x: bug.leg.from.x + (bug.leg.to.x - bug.leg.from.x) * fraction,
      y: bug.leg.from.y + (bug.leg.to.y - bug.leg.from.y) * fraction,
    },
  };
}

// The nearest ship or standing module in the bug's own sector. Ship distance
// ties go to the lower id, so the pick replays exactly from the seed.
type Quarry = { kind: "ship"; ship: Ship } | { kind: "module"; stationId: number; module: StationModule };

function stationModules(draft: Draft, sectorId: number): { stationId: number; modules: StationModule[] }[] {
  return [
    ...(draft.stationSector === sectorId ? [{ stationId: draft.activeStationId, modules: draft.modules }] : []),
    ...draft.others.filter((station) => station.sectorId === sectorId).map((station) => ({ stationId: station.id, modules: station.modules })),
  ];
}

function moduleHp(module: StationModule): number {
  return module.hp ?? module.maxHp ?? MODULE_HP;
}

function quarryFor(draft: Draft, bug: Bug): Quarry | null {
  let best: Quarry | null = null;
  let bestDistance = Infinity;
  for (const ship of draft.ships) {
    if (ship.sectorId !== bug.sectorId || ship.state === "docked") continue;
    const length = Math.hypot(ship.position.x - bug.position.x, ship.position.y - bug.position.y);
    if (!best || length < bestDistance || (length === bestDistance && best.kind === "ship" && ship.id < best.ship.id)) {
      best = { kind: "ship", ship };
      bestDistance = length;
    }
  }
  for (const { stationId, modules } of stationModules(draft, bug.sectorId)) {
    for (const module of modules) {
      if (moduleHp(module) <= 0) continue;
      const length = Math.hypot(module.position.x - bug.position.x, module.position.y - bug.position.y);
      if (!best || length < bestDistance) {
        best = { kind: "module", stationId, module };
        bestDistance = length;
      }
    }
  }
  return best;
}

// One bite. Wears the hull down and, at zero, takes the ship out of the state
// together with its cargo: it explodes and nothing is left of either. Returns
// whether it survived.
function bite(draft: Draft, ship: Ship): boolean {
  const next = damageShip(ship, BUG_BITE_DAMAGE, draft.time);
  if (next) {
    draft.ships = draft.ships.map((other) => (other.id === ship.id ? next : other));
    return true;
  }
  draft.ships = draft.ships.filter((other) => other.id !== ship.id);
  return false;
}

function biteModule(draft: Draft, stationId: number, module: StationModule): void {
  const hp = Math.max(0, moduleHp(module) - BUG_BITE_DAMAGE);
  const update = (candidate: StationModule) => candidate.position.x === module.position.x && candidate.position.y === module.position.y
    ? { ...candidate, hp, maxHp: candidate.maxHp ?? MODULE_HP } : candidate;
  if (hp > 0) {
    if (stationId === draft.activeStationId) draft.modules = draft.modules.map(update);
    else draft.others = draft.others.map((station) => station.id === stationId ? { ...station, modules: station.modules.map(update) } : station);
    return;
  }
  const source = stationId === draft.activeStationId ? activeStation(draft) : draft.others.find((station) => station.id === stationId);
  if (!source) return;
  const result = damageStationModule(source, module.position, BUG_BITE_DAMAGE, draft.time);
  draft.moduleDestructions.push(...result.destructions);
  if (stationId === draft.activeStationId) {
    draft.modules = result.station.modules;
    draft.buildQueue = result.station.buildQueue;
    draft.shipBuilds = result.station.shipBuilds;
    draft.inventory = result.station.inventory;
    draft.storageCapacity = result.station.storage.capacity;
    draft.dockCapacity = result.station.dock.capacity;
  } else draft.others = draft.others.map((station) => station.id === stationId ? result.station : station);
}

function activeStation(draft: Draft): Station {
  const size = { width: 0, height: 0 };
  return {
    id: draft.activeStationId, name: "", founding: draft.founding, sectorId: draft.stationSector,
    dock: { position: draft.dock, size, capacity: draft.dockCapacity },
    storage: { position: draft.dock, size, capacity: draft.storageCapacity },
    inventory: draft.inventory, constructionSite: draft.constructionSite, storageLimits: draft.storageLimits,
    deliveries: draft.deliveries, modules: draft.modules, construction: draft.construction, buildQueue: draft.buildQueue,
    shipBuilds: draft.shipBuilds,
  };
}

export function advanceEnemies(draft: Draft, seconds: number): void {
  draft.hives = draft.hives.map((hive) => (hive.alive ? { ...hive, spawnTimer: hive.spawnTimer - seconds } : hive));
  draft.bugs = draft.bugs.map((bug) => progressBug(bug, seconds));
  // Gun ships reload towards their next shot, and shots in flight burn out.
  const from = draft.time - seconds;
  draft.ships = advanceShields(draft.ships, from, draft.time).map((ship) => {
    if (!ship.gunTimer && !ship.gunShot) return ship;
    const gunTimer = Math.max(0, (ship.gunTimer ?? 0) - seconds);
    const gunShot = ship.gunShot ? burnOut(ship.gunShot, seconds) : null;
    return { ...ship, gunTimer, gunShot };
  });
}

function burnOut(shot: GunShot, seconds: number): GunShot {
  return { ...shot, timer: Math.max(0, shot.timer - seconds) };
}

// Fires every enemy timer that has reached zero: hives hatch, hovering bugs
// pick the next spot to hang about at, and hunting bugs bite their quarry or
// chase it. Bugs that hunt re-pick the nearest ship in their sector each time
// a leg runs out, so a moved or destroyed target hands them on.
export function settleEnemies(draft: Draft): void {
  draft.hives = draft.hives.map((hive) => {
    if (!hive.alive || hive.spawnTimer > 0) return hive;
    draft.bugs = [...draft.bugs, spawnBug(draft, hive)];
    draft.nextBugId += 1;
    return { ...hive, spawnTimer: hive.spawnTimer + BUG_SPAWN_SECONDS };
  });
  // Fewer alive bugs than the threshold loiter by the hive and ignore ships
  // (criterion 3). At the threshold they fly at the nearest ship in their own
  // sector (criterion 4) and bite it alongside.
  const hunting = draft.bugs.length >= BUG_ATTACK_THRESHOLD;
  draft.bugs = draft.bugs.map((bug) => {
    if (bug.timer > 0) return bug;
    const hive = draft.hives.find((candidate) => candidate.id === bug.hiveId);
    if (hunting) {
      const quarry = quarryFor(draft, bug);
      if (quarry) {
        const target = quarry.kind === "ship" ? quarry.ship : quarry.module;
        const length = Math.hypot(target.position.x - bug.position.x, target.position.y - bug.position.y);
        if (length <= BUG_BITE_RANGE) {
          if (quarry.kind === "ship") bite(draft, quarry.ship);
          else biteModule(draft, quarry.stationId, quarry.module);
          return { ...bug, state: "hunting", targetShipId: quarry.kind === "ship" ? quarry.ship.id : null,
            targetModule: quarry.kind === "module" ? { stationId: quarry.stationId, position: { ...quarry.module.position } } : null,
            leg: null, timer: BUG_BITE_SECONDS };
        }
        return {
          ...bug,
          state: "hunting",
          targetShipId: quarry.kind === "ship" ? quarry.ship.id : null,
          targetModule: quarry.kind === "module" ? { stationId: quarry.stationId, position: { ...quarry.module.position } } : null,
          leg: { from: { ...bug.position }, to: { ...target.position } },
          timer: huntSeconds(length),
        };
      }
    }
    // Nothing to hunt: loiter, whether the bug was hovering or had lost its
    // quarry to a bite from a sibling.
    // The hive is gone from the state: hold where it is rather than spin.
    if (!hive) return { ...bug, state: "hovering", targetShipId: null, targetModule: null, leg: null, timer: 1 };
    const loiter = loiterPoint(draft, hive, bug);
    return { ...bug, state: "hovering", targetShipId: null, targetModule: null, leg: { from: { ...bug.position }, to: loiter.to }, timer: loiter.seconds };
  });
  // After the bugs have taken their bites, every gun ship that is loaded
  // shoots the nearest bug in range, or the hive when no bug is close enough.
  settleGuns(draft);
}

// The Gun-value of a design. Zero on ships without guns.
function guns(design: ShipDesign): number {
  return design.slots.filter((slot) => slot === "Gun").length;
}

// The nearest bug inside gun range of the ship, without regard to state: a
// hovering or hunting bug is a target all the same. Ties go to the lower id,
// so the pick replays exactly from the seed.
function bugTarget(draft: Draft, ship: Ship): Bug | null {
  let best: Bug | null = null;
  let bestDistance = Infinity;
  for (const bug of draft.bugs) {
    if (bug.sectorId !== ship.sectorId) continue;
    const length = Math.hypot(bug.position.x - ship.position.x, bug.position.y - ship.position.y);
    if (length > GUN_RANGE) continue;
    if (!best || length < bestDistance || (length === bestDistance && bug.id < best.id)) {
      best = bug;
      bestDistance = length;
    }
  }
  return best;
}

// A drop holds the next event when everything else has burned down, at this
// cadence: seconds until the next loop step once only drops are left. A
// dyadic fraction, a step nothing else can race.
const DROP_EVENT_SECONDS = 1;

// Loot for the bug's kill. Same stream as the hive's, never the main one.
function addDrop(draft: Draft, sectorId: number, kind: DropKind, position: Vec): void {
  draft.drops = [...draft.drops, { id: draft.nextDropId, sectorId, kind, position: { ...position } }];
  draft.nextDropId += 1;
}

// One shot: fresh aim (the target's position when it fired), a burn-out clock
// for the renderer to draw, and the reload, which keeps the event loop
// stepping until the next shot.
function fire(ship: Ship, to: Vec, target: GunShot["target"]): Ship {
  return { ...ship, gunTimer: GUN_SECONDS, gunShot: { from: { ...ship.position }, to: { ...to }, target, timer: GUN_SHOT_SECONDS } };
}

function hitTarget(draft: Draft, target: GunShot["target"]): void {
  if (target.kind === "bug") {
    const bug = draft.bugs.find((candidate) => candidate.id === target.id);
    if (!bug) return;
    const hp = bug.hp - GUN_DAMAGE;
    if (hp > 0) draft.bugs = draft.bugs.map((candidate) => candidate.id === bug.id ? { ...candidate, hp } : candidate);
    else {
      draft.bugs = draft.bugs.filter((candidate) => candidate.id !== bug.id);
      addDrop(draft, bug.sectorId, "bugJuice", bug.position);
    }
    return;
  }
  const hive = draft.hives.find((candidate) => candidate.id === target.id && candidate.alive);
  if (!hive) return;
  const hp = Math.max(0, hive.hp - GUN_DAMAGE);
  draft.hives = draft.hives.map((candidate) => candidate.id === hive.id ? { ...candidate, hp, alive: hp > 0 } : candidate);
  if (hp === 0) addDrop(draft, hive.sectorId, "queenLarvae", hive.position);
}

// Every loaded, undocked gun ship in a sector with enemies fires on its own.
// Guns work while holding, flying or mining.
function settleGuns(draft: Draft): void {
  // Resolve arrivals before considering a new shot. A target killed or removed
  // before impact simply absorbs nothing.
  for (const ship of draft.ships) if (ship.gunShot?.timer === 0) hitTarget(draft, ship.gunShot.target);
  draft.ships = draft.ships.map((ship) => {
    if (ship.gunShot?.timer === 0) ship = { ...ship, gunShot: null };
    if (ship.gunShot) return ship;
    if (ship.state === "docked" || guns(ship.design) === 0 || (ship.gunTimer ?? 0) > 0) return ship;
    const bug = bugTarget(draft, ship);
    if (bug) return fire(ship, bug.position, { kind: "bug", id: bug.id });
    const hive = draft.hives.find((candidate) => candidate.alive && candidate.sectorId === ship.sectorId
      && Math.hypot(candidate.position.x - ship.position.x, candidate.position.y - ship.position.y) <= GUN_RANGE);
    if (hive) {
      return fire(ship, hive.position, { kind: "hive", id: hive.id });
    }
    // Nothing in range: the gun stays loaded, timer at zero, and fires the
    // moment a target walks in.
    return ship;
  });
}

// The shots every renderer can draw while they fly: from each gun ship to
// where its shot was aimed. A ship with nothing in flight draws nothing.
export function gunBeams(state: Pick<SimState, "ships">): Beam[] {
  return state.ships.flatMap((ship) => (ship.gunShot ? [{ from: { ...ship.gunShot.from }, to: { ...ship.gunShot.to } }] : []));
}

// Seconds until the next ENEMY timer that drives the event loop runs out: the
// hive's spawn clock and, once the swarm hunts, every hunting bug's flight,
// chase and bite clock. Loitering bugs hang off the same loop, but their legs
// are cosmetic, so they advance with whatever steps land anyway instead of
// splitting every second into a step of their own (with thirty bugs busy about
// the hive that would be a step every fraction of a second, and every timer in
// the sim walked that many times more).
export function nextEnemyEvent(draft: Draft): number {
  let soonest = Infinity;
  for (const hive of draft.hives) {
    if (hive.alive) soonest = Math.min(soonest, hive.spawnTimer);
  }
  for (const bug of draft.bugs) {
    if (bug.state === "hunting") soonest = Math.min(soonest, bug.timer);
  }
  // A reloading gun holds the next event, and a burning-out shot holds one
  // last event to clear it. A loaded gun with nothing in range holds nothing:
  // it fires on whatever step lands next without racing the clock to zero.
  for (const ship of draft.ships) {
    if (ship.gunTimer && ship.gunTimer > 0) soonest = Math.min(soonest, ship.gunTimer);
    if (ship.gunShot) soonest = Math.min(soonest, ship.gunShot.timer);
  }
  soonest = Math.min(soonest, nextShieldEvent(draft.ships, draft.time));
  // Drops outlast the shoot-out that left them, so once only they are left
  // the loop would otherwise go silent: let the next step reach them.
  if (draft.drops.length > 0) soonest = Math.min(soonest, DROP_EVENT_SECONDS);
  return soonest;
}
