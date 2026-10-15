import {
  BUG_ATTACK_THRESHOLD,
  BUG_DESIGNS, BUG_HOVER_MIN_REACH, BUG_HOVER_RADIUS, BUG_HP, BUG_SPAWN_SECONDS,
  BUG_SPEED_FACTOR, GUN_DAMAGE, GUN_RANGE, GUN_SECONDS, GUN_SHOT_SECONDS,
  HIVE_GATE_FRACTION, HIVE_HP, MODULE_HP,
  TURRET_DAMAGE, TURRET_METAL_PER_SHOT, TURRET_RANGE, TURRET_SECONDS, TURRET_SHOT_SECONDS,
} from "./build-constants";
import { travelSeconds } from "./motion";
import { nextRandom } from "./prng";
import { pixelCount, shipModuleCounts } from "./ship";
import { damageShip, advanceShields, advanceShipRepairs, advanceModuleRepairs, nextShieldEvent } from "./shields";
import { damageStationModule } from "./station-build-queue";
import type { Beam, Bug, BugShot, DropKind, GunShot, Hive, Ship, ShipDesign, SimState, Station, StationModule, Vec } from "./model";
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
  const designRoll = nextRandom(draft.bugDesignRng);
  draft.bugDesignRng = designRoll.state;
  const angle = angleRoll.value * Math.PI * 2;
  const radius = reachRoll.value * BUG_HOVER_RADIUS;
  const design = BUG_DESIGNS[designRoll.value < 0.6 ? 0 : designRoll.value < 0.9 ? 1 : 2]!;
  const maxHp = pixelCount(design) * BUG_HP;
  return {
    id: draft.nextBugId,
    hiveId: hive.id,
    sectorId: hive.sectorId,
    position: {
      x: hive.position.x + Math.cos(angle) * radius,
      y: hive.position.y + Math.sin(angle) * radius,
    },
    design,
    loiterRng: (draft.enemyRng ^ Math.imul(draft.nextBugId + 1, 0x9e3779b9)) >>> 0,
    hp: maxHp,
    maxHp,
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
function loiterPoint(hive: Pick<Hive, "position">, bug: Bug): { to: Vec; seconds: number; rng: number } {
  let rng = bug.loiterRng ?? ((Math.imul(bug.id + 1, 0x9e3779b9) ^ Math.imul(bug.hiveId + 1, 0x85ebca6b)) >>> 0);
  const angleRoll = nextRandom(rng);
  rng = angleRoll.state;
  const reachRoll = nextRandom(rng);
  rng = reachRoll.state;
  const angle = angleRoll.value * Math.PI * 2;
  const radius = BUG_HOVER_MIN_REACH + reachRoll.value * (BUG_HOVER_RADIUS - BUG_HOVER_MIN_REACH);
  const to = {
    x: hive.position.x + Math.cos(angle) * radius,
    y: hive.position.y + Math.sin(angle) * radius,
  };
  const length = Math.hypot(to.x - bug.position.x, to.y - bug.position.y);
  return { to, seconds: loiterSeconds(length), rng };
}

function bugSpeed(bug: Bug): number {
  const largeHunter = bug.state === "hunting" && bug.design?.slots.filter((slot) => slot !== null).length === 4;
  return BUG_SPEED_FACTOR / (largeHunter ? 2 : 1);
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

// Chase legs run the same quantum as loiter legs, for the same reason: shots
// then land in steps whose lengths are dyadic fractions, and the
// timers the tick travels between finish on their exact second rather than a
// rounding dust past it.
function huntSeconds(length: number, bug?: Bug): number {
  const raw = travelSeconds(length, bug ? bugSpeed(bug) : BUG_SPEED_FACTOR);
  return Math.ceil(raw / LOITER_QUANTUM) * LOITER_QUANTUM;
}

function gateRoute(draft: Draft, fromSector: number, toSector: number): { from: Vec; to: Vec } | null {
  const built = draft.gateProjects.find((project) => project.complete
    && project.ends.some((end) => end.sectorId === fromSector)
    && project.ends.some((end) => end.sectorId === toSector));
  if (built) return {
    from: { ...built.ends.find((end) => end.sectorId === fromSector)!.position },
    to: { ...built.ends.find((end) => end.sectorId === toSector)!.position },
  };
  const from = draft.sectors[fromSector]; const to = draft.sectors[toSector];
  return from?.gate.to === toSector && to?.gate.to === fromSector
    ? { from: { ...from.gate.position }, to: { ...to.gate.position } } : null;
}

function invasionRoutes(draft: Draft, fromSector: number): { sectorId: number; route: { from: Vec; to: Vec } }[] {
  return draft.sectors.flatMap((sector) => {
    if (sector.id === fromSector) return [];
    const route = gateRoute(draft, fromSector, sector.id);
    return route ? [{ sectorId: sector.id, route }] : [];
  });
}

function settleArrivals(draft: Draft): void {
  const arrivals = new Map<string, Bug[]>();
  for (const bug of draft.bugs) {
    if ((bug.state !== "invading" && bug.state !== "gathering") || bug.timer > 0 || bug.targetSectorId === null || bug.targetSectorId === undefined) continue;
    const key = `${bug.state}:${bug.sectorId}:${bug.targetSectorId}`;
    const group = arrivals.get(key) ?? [];
    group.push(bug);
    arrivals.set(key, group);
  }
  for (const group of arrivals.values()) {
    const sectorId = group[0]!.targetSectorId!;
    const hive = draft.hives.find((candidate) => candidate.alive && candidate.sectorId === sectorId);
    const resident = draft.bugs.find((bug) => bug.sectorId === sectorId && !group.some((arrival) => arrival.id === bug.id));
    const ids = new Set(group.map((bug) => bug.id));
    if (group[0]!.state === "invading") {
      const route = gateRoute(draft, group[0]!.sectorId, sectorId);
      if (!route) continue;
      // Keep an empty-sector arrival visible as the ten converge at its gate.
      draft.bugs = draft.bugs.map((bug) => {
        const index = group.findIndex((arrival) => arrival.id === bug.id);
        if (index < 0) return bug;
        const position = !hive && !resident ? {
          x: route.to.x + Math.cos(index * Math.PI * 2 / group.length) * 24,
          y: route.to.y + Math.sin(index * Math.PI * 2 / group.length) * 24,
        } : { ...route.to };
        const loiter = hive || resident ? loiterPoint(hive ?? resident!, { ...bug, position }) : null;
        return { ...bug, sectorId, position, loiterRng: loiter?.rng ?? bug.loiterRng,
          state: !hive && !resident ? "gathering" : "hovering",
          targetSectorId: !hive && !resident ? sectorId : null,
          leg: { from: position, to: loiter?.to ?? { ...route.to } },
          timer: loiter?.seconds ?? huntSeconds(24) };
      });
      continue;
    }
    // Gathering reserves the founding: later arrivals join, not cancel it.
    if (!hive) {
      draft.hives = [...draft.hives, makeHive(draft.nextHiveId, sectorId, group[0]!.position)];
      draft.nextHiveId += 1;
      draft.bugs = draft.bugs.filter((bug) => !ids.has(bug.id));
      continue;
    }
    draft.bugs = draft.bugs.map((bug) => ids.has(bug.id) ? {
      ...bug,
      state: "hovering",
      sectorId,
      targetSectorId: null,
      targetShipId: null,
      targetModule: null,
      leg: null,
      timer: 0,
    } : bug);
  }
}

function settleInvasions(draft: Draft): void {
  for (const hive of draft.hives.filter((hive) => hive.alive)) {
    const sectorId = hive.sectorId;
    // Joined bugs attack here permanently; only this hive's offspring leave.
    const group = draft.bugs.filter((bug) => bug.sectorId === sectorId && bug.hiveId === hive.id
      && bug.state !== "invading" && bug.state !== "gathering").slice(0, 10);
    const routes = invasionRoutes(draft, sectorId);
    if (group.length < 10 || routes.length === 0) continue;
    const pick = nextRandom(draft.enemyRng);
    draft.enemyRng = pick.state;
    const destination = routes[Math.floor(pick.value * routes.length)]!;
    const seconds = Math.max(LOITER_QUANTUM, ...group.map((bug) => huntSeconds(Math.hypot(
      destination.route.from.x - bug.position.x, destination.route.from.y - bug.position.y,
    ), { ...bug, state: "invading" })));
    const ids = new Set(group.map((bug) => bug.id));
    draft.bugs = draft.bugs.map((bug) => ids.has(bug.id) ? {
      ...bug,
      state: "invading",
      targetShipId: null,
      targetModule: null,
      targetSectorId: destination.sectorId,
      leg: { from: { ...bug.position }, to: { ...destination.route.from } },
      timer: seconds,
    } : bug);
  }
}

// Moves a bug partway through its current leg, leaving `timer` seconds.
function progressBug(bug: Bug, seconds: number): Bug {
  const left = bug.timer - seconds;
  // Keep simultaneous enemy events together after fractional outer ticks.
  const timer = Math.abs(left) < 1e-9 ? 0 : left;
  if (!bug.leg) return { ...bug, timer: Math.max(0, timer) };
  const length = Math.hypot(bug.leg.to.x - bug.leg.from.x, bug.leg.to.y - bug.leg.from.y);
  const total = travelSeconds(length, bugSpeed(bug));
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

function bugShotDamage(draft: Draft, bug: Bug): void {
  const shot = bug.gunShot;
  if (!shot) return;
  if ("id" in shot.target) {
    const shipId = shot.target.id;
    const ship = draft.ships.find((candidate) => candidate.id === shipId);
    if (!ship) return;
    const next = damageShip(ship, GUN_DAMAGE, draft.time);
    draft.ships = next ? draft.ships.map((candidate) => candidate.id === ship.id ? next : candidate)
      : draft.ships.filter((candidate) => candidate.id !== ship.id);
  } else {
    const { stationId, position } = shot.target;
    const station = stationId === draft.activeStationId ? activeStation(draft)
      : draft.others.find((candidate) => candidate.id === stationId);
    const module = station?.modules.find((candidate) => candidate.position.x === position.x
      && candidate.position.y === position.y);
    if (station && module) damageModule(draft, station.id, module, GUN_DAMAGE);
  }
}

function fireBug(bug: Bug, target: Quarry): Bug {
  const value = target.kind === "ship" ? target.ship : target.module;
  const gunShot: BugShot = {
    from: { ...bug.position },
    to: { ...value.position },
    target: target.kind === "ship" ? { kind: "ship", id: target.ship.id }
      : { kind: "module", stationId: target.stationId, position: { ...target.module.position } },
    timer: GUN_SHOT_SECONDS,
  };
  return { ...bug, gunTimer: GUN_SECONDS, gunShot };
}

function damageModule(draft: Draft, stationId: number, module: StationModule, damage: number): void {
  const hp = Math.max(0, moduleHp(module) - damage);
  const update = (candidate: StationModule) => candidate.position.x === module.position.x && candidate.position.y === module.position.y
    ? { ...candidate, hp, maxHp: candidate.maxHp ?? MODULE_HP } : candidate;
  if (hp > 0) {
    if (stationId === draft.activeStationId) draft.modules = draft.modules.map(update);
    else draft.others = draft.others.map((station) => station.id === stationId ? { ...station, modules: station.modules.map(update) } : station);
    return;
  }
  const source = stationId === draft.activeStationId ? activeStation(draft) : draft.others.find((station) => station.id === stationId);
  if (!source) return;
  const result = damageStationModule(source, module.position, damage, draft.time);
  draft.moduleDestructions.push(...result.destructions);
  if (stationId === draft.activeStationId) {
    draft.modules = result.station.modules;
    draft.construction = result.station.construction;
    draft.constructionSite = result.station.constructionSite;
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
    id: draft.activeStationId, name: "", founding: draft.founding, builtAt: draft.stationBuiltAt, sectorId: draft.stationSector,
    dock: { position: draft.dock, size, capacity: draft.dockCapacity },
    storage: { position: draft.dock, size, capacity: draft.storageCapacity },
    inventory: draft.inventory, constructionSite: draft.constructionSite, storageLimits: draft.storageLimits,
    deliveries: draft.deliveries, modules: draft.modules, construction: draft.construction, buildQueue: draft.buildQueue,
    shipBuilds: draft.shipBuilds,
  };
}

export function advanceEnemies(draft: Draft, seconds: number): void {
  draft.hives = draft.hives.map((hive) => {
    if (!hive.alive) return hive;
    const left = hive.spawnTimer - seconds;
    return { ...hive, spawnTimer: Math.abs(left) < 1e-9 ? 0 : left };
  });
  draft.bugs = draft.bugs.map((bug) => {
    const next = progressBug(bug, seconds);
    if (bug.gunTimer === undefined && !bug.gunShot) return next;
    return { ...next, gunTimer: Math.max(0, (bug.gunTimer ?? 0) - seconds),
      gunShot: bug.gunShot ? burnOut(bug.gunShot, seconds) : null };
  });
  // Gun ships reload towards their next shot, and shots in flight burn out.
  const from = draft.time - seconds;
  draft.ships = advanceShipRepairs(advanceShields(draft.ships, from, draft.time), seconds).map((ship) => {
    if (!ship.gunTimer && !ship.gunShot) return ship;
    const gunTimer = Math.max(0, (ship.gunTimer ?? 0) - seconds);
    const gunShot = ship.gunShot ? burnOut(ship.gunShot, seconds) : null;
    return { ...ship, gunTimer, gunShot };
  });
  const repairedStations = advanceModuleRepairs(draft.ships, [activeStation(draft), ...draft.others], seconds);
  draft.modules = repairedStations.find((station) => station.id === draft.activeStationId)?.modules ?? draft.modules;
  draft.others = draft.others.map((station) => repairedStations.find((candidate) => candidate.id === station.id) ?? station);
  draft.modules = advanceTurrets(draft.modules, seconds);
  draft.others = draft.others.map((station) => ({ ...station, modules: advanceTurrets(station.modules, seconds) }));
}

function burnOut<T extends { timer: number }>(shot: T, seconds: number): T {
  return { ...shot, timer: Math.max(0, shot.timer - seconds) };
}

// Fires every enemy timer that has reached zero: hives hatch, hovering bugs
// pick the next spot to hang about at, and hunting bugs shoot their quarry or
// chase it. Bugs that hunt re-pick the nearest ship in their sector each time
// a leg runs out, so a moved or destroyed target hands them on.
export function settleEnemies(draft: Draft): void {
  draft.hives = draft.hives.map((hive) => {
    if (!hive.alive || hive.spawnTimer > 0) return hive;
    draft.bugs = [...draft.bugs, spawnBug(draft, hive)];
    draft.nextBugId += 1;
    return { ...hive, spawnTimer: hive.spawnTimer + BUG_SPAWN_SECONDS };
  });
  settleArrivals(draft);
  settleInvasions(draft);
  let expiredBugShot = false;
  for (const bug of draft.bugs) if (bug.gunShot?.timer === 0) {
    bugShotDamage(draft, bug);
    expiredBugShot = true;
  }
  if (expiredBugShot) draft.bugs = draft.bugs.map((bug) => bug.gunShot?.timer === 0 ? { ...bug, gunShot: null } : bug);
  // Fewer alive bugs than the threshold loiter by the hive. At the threshold
  // they attack the nearest quarry in their own sector with their Guns.
  draft.bugs = draft.bugs.map((bug) => {
    if (bug.timer > 0) return bug;
    if (bug.state === "invading") return bug;
    const hive = draft.hives.find((candidate) => candidate.alive && candidate.sectorId === bug.sectorId);
    const hunting = draft.bugs.filter((candidate) => candidate.sectorId === bug.sectorId
      && candidate.state !== "invading" && candidate.state !== "gathering").length >= BUG_ATTACK_THRESHOLD;
    if (hunting) {
      const quarry = quarryFor(draft, bug);
      if (quarry) {
        const target = quarry.kind === "ship" ? quarry.ship : quarry.module;
        const length = Math.hypot(target.position.x - bug.position.x, target.position.y - bug.position.y);
        if (length <= GUN_RANGE) {
          const updated = bug.gunShot || (bug.gunTimer ?? 0) > 0 ? bug : fireBug(bug, quarry);
          return { ...updated, state: "hunting", targetShipId: quarry.kind === "ship" ? quarry.ship.id : null,
            targetModule: quarry.kind === "module" ? { stationId: quarry.stationId, position: { ...quarry.module.position } } : null,
            leg: null, timer: Math.max(LOITER_QUANTUM, updated.gunTimer ?? GUN_SECONDS) };
        }
        return {
          ...bug,
          state: "hunting",
          targetShipId: quarry.kind === "ship" ? quarry.ship.id : null,
          targetModule: quarry.kind === "module" ? { stationId: quarry.stationId, position: { ...quarry.module.position } } : null,
          leg: { from: { ...bug.position }, to: { ...target.position } },
          timer: huntSeconds(length, { ...bug, state: "hunting" }),
        };
      }
    }
    // Nothing to hunt: loiter, whether the bug was hovering or had lost its
    // quarry to a sibling's shot.
    // Hive-less joiners spread around the resident population, not their natal hive.
    const centre = hive ?? draft.bugs.find((candidate) => candidate.sectorId === bug.sectorId);
    if (!centre) return { ...bug, state: "hovering", targetShipId: null, targetModule: null, leg: null, timer: 1 };
    const loiter = loiterPoint(centre, bug);
    return { ...bug, loiterRng: loiter.rng, state: "hovering", targetShipId: null, targetModule: null,
      leg: { from: { ...bug.position }, to: loiter.to }, timer: loiter.seconds };
  });
  // After the bugs' shots land, every gun ship that is loaded
  // shoots the nearest bug in range, or the hive when no bug is close enough.
  settleGuns(draft);
  settleTurrets(draft);
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

function hitTarget(draft: Draft, target: GunShot["target"], damage = GUN_DAMAGE): void {
  if (target.kind === "bug") {
    const bug = draft.bugs.find((candidate) => candidate.id === target.id);
    if (!bug) return;
    const hp = bug.hp - damage;
    if (hp > 0) draft.bugs = draft.bugs.map((candidate) => candidate.id === bug.id ? { ...candidate, hp } : candidate);
    else {
      draft.bugs = draft.bugs.filter((candidate) => candidate.id !== bug.id);
      addDrop(draft, bug.sectorId, "bugJuice", bug.position);
    }
    return;
  }
  const hive = draft.hives.find((candidate) => candidate.id === target.id && candidate.alive);
  if (!hive) return;
  const hp = Math.max(0, hive.hp - damage);
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

function advanceTurrets(modules: StationModule[], seconds: number): StationModule[] {
  return modules.map((module) => module.type !== "Turret" ? module : {
    ...module,
    turretTimer: Math.max(0, (module.turretTimer ?? 0) - seconds),
    turretShot: module.turretShot ? burnOut(module.turretShot, seconds) : null,
  });
}

function targetForPosition(draft: Draft, sectorId: number, position: Vec): { target: GunShot["target"]; point: Vec } | null {
  let best: { target: GunShot["target"]; point: Vec } | null = null;
  let bestDistance = Infinity;
  for (const bug of draft.bugs) {
    if (bug.sectorId !== sectorId) continue;
    const distance = Math.hypot(bug.position.x - position.x, bug.position.y - position.y);
    if (distance <= TURRET_RANGE && (!best || distance < bestDistance || (distance === bestDistance && bug.id < best.target.id))) {
      best = { target: { kind: "bug", id: bug.id }, point: bug.position };
      bestDistance = distance;
    }
  }
  if (best) return best;
  for (const hive of draft.hives) {
    if (!hive.alive || hive.sectorId !== sectorId) continue;
    const distance = Math.hypot(hive.position.x - position.x, hive.position.y - position.y);
    if (distance <= TURRET_RANGE && (!best || distance < bestDistance)) {
      best = { target: { kind: "hive", id: hive.id }, point: hive.position };
      bestDistance = distance;
    }
  }
  return best;
}

function fireTurret(module: StationModule, target: { target: GunShot["target"]; point: Vec }): StationModule {
  return {
    ...module,
    turretTimer: TURRET_SECONDS,
    turretNoMetal: false,
    turretShot: { from: { ...module.position }, to: { ...target.point }, target: target.target, timer: TURRET_SHOT_SECONDS },
  };
}

function settleTurretSet(draft: Draft, modules: StationModule[], sectorId: number, inventory: Record<"Metal" | "Ice", number>): StationModule[] {
  const next = modules.map((module) => {
    if (module.type !== "Turret") return module;
    let current = module;
    if (current.turretShot?.timer === 0) hitTarget(draft, current.turretShot.target, TURRET_DAMAGE);
    if (current.turretShot?.timer === 0) current = { ...current, turretShot: null };
    if (current.turretShot || (current.turretTimer ?? 0) > 0) return current;
    const target = targetForPosition(draft, sectorId, current.position);
    if (!target) return { ...current, turretNoMetal: false };
    if (inventory.Metal < TURRET_METAL_PER_SHOT) return { ...current, turretNoMetal: true };
    inventory.Metal -= TURRET_METAL_PER_SHOT;
    return fireTurret(current, target);
  });
  return next.map(module => module.type === "Turret"
    ? { ...module, turretNoMetal: inventory.Metal < TURRET_METAL_PER_SHOT }
    : module);
}

function settleTurrets(draft: Draft): void {
  draft.inventory = { ...draft.inventory };
  draft.modules = settleTurretSet(draft, draft.modules, draft.stationSector, draft.inventory);
  draft.others = draft.others.map((station) => {
    const inventory = { ...station.inventory };
    const modules = settleTurretSet(draft, station.modules, station.sectorId, inventory);
    return { ...station, modules, inventory };
  });
}

// The shots every renderer can draw while they fly: from each gun ship to
// where its shot was aimed. A ship with nothing in flight draws nothing.
export function gunBeams(state: Pick<SimState, "ships">): Beam[] {
  return [
    ...state.ships.flatMap((ship) => (ship.gunShot ? [{ from: { ...ship.gunShot.from }, to: { ...ship.gunShot.to } }] : [])),
    ...((state as Pick<SimState, "ships"> & { stations?: SimState["stations"] }).stations ?? []).flatMap((station) => station.modules.flatMap((module) =>
      module.turretShot ? [{ from: { ...module.turretShot.from }, to: { ...module.turretShot.to } }] : [])),
  ];
}

// Seconds until the next ENEMY timer that drives the event loop runs out: the
// hive's spawn clock and, once the swarm hunts, every hunting bug's flight,
// chase and gun clock. Loitering bugs hang off the same loop, but their legs
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
    // Loiter completions also draw RNG and set the next departure's position.
    soonest = Math.min(soonest, bug.timer);
    if (bug.gunTimer && bug.gunTimer > 0) soonest = Math.min(soonest, bug.gunTimer);
    if (bug.gunShot) soonest = Math.min(soonest, bug.gunShot.timer);
  }
  // A reloading gun holds the next event, and a burning-out shot holds one
  // last event to clear it. A loaded gun with nothing in range holds nothing:
  // it fires on whatever step lands next without racing the clock to zero.
  for (const ship of draft.ships) {
    if (ship.gunTimer && ship.gunTimer > 0) soonest = Math.min(soonest, ship.gunTimer);
    if (ship.gunShot) soonest = Math.min(soonest, ship.gunShot.timer);
  }
  for (const module of [...draft.modules, ...draft.others.flatMap((station) => station.modules)]) {
    if (module.type === "Turret") {
      if (module.turretTimer && module.turretTimer > 0) soonest = Math.min(soonest, module.turretTimer);
      if (module.turretShot) soonest = Math.min(soonest, module.turretShot.timer);
    }
  }
  soonest = Math.min(soonest, nextShieldEvent(draft.ships, draft.time));
  // Drops outlast the shoot-out that left them, so once only they are left
  // the loop would otherwise go silent: let the next step reach them.
  if (draft.drops.length > 0) soonest = Math.min(soonest, DROP_EVENT_SECONDS);
  return soonest;
}
