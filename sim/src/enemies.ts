import {
  BUG_ATTACK_THRESHOLD, BUG_BITE_DAMAGE, BUG_BITE_RANGE, BUG_BITE_SECONDS,
  BUG_HOVER_MIN_REACH, BUG_HOVER_RADIUS, BUG_HP, BUG_SPAWN_SECONDS,
  BUG_SPEED_FACTOR, HIVE_GATE_FRACTION, HIVE_HP,
} from "./build-constants";
import { travelSeconds } from "./motion";
import { nextRandom } from "./prng";
import { shipHp } from "./ship";
import type { Bug, Hive, Ship, Vec } from "./model";
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

// The nearest ship still standing in the bug's own sector. Distance ties go
// to the lower id, so the pick replays exactly from the seed.
function quarryFor(draft: Draft, bug: Bug): Ship | null {
  let best: Ship | null = null;
  let bestDistance = Infinity;
  for (const ship of draft.ships) {
    if (ship.sectorId !== bug.sectorId) continue;
    const length = Math.hypot(ship.position.x - bug.position.x, ship.position.y - bug.position.y);
    if (!best || length < bestDistance || (length === bestDistance && ship.id < best.id)) {
      best = ship;
      bestDistance = length;
    }
  }
  return best;
}

// One bite. Wears the hull down and, at zero, takes the ship out of the state
// together with its cargo: it explodes and nothing is left of either. Returns
// whether it survived.
function bite(draft: Draft, ship: Ship): boolean {
  const { hp, maxHp } = shipHp(ship);
  const next = hp - BUG_BITE_DAMAGE;
  if (next > 0) {
    draft.ships = draft.ships.map((other) => (other.id === ship.id ? { ...other, hp: next, maxHp } : other));
    return true;
  }
  draft.ships = draft.ships.filter((other) => other.id !== ship.id);
  return false;
}

export function advanceEnemies(draft: Draft, seconds: number): void {
  draft.hives = draft.hives.map((hive) => (hive.alive ? { ...hive, spawnTimer: hive.spawnTimer - seconds } : hive));
  draft.bugs = draft.bugs.map((bug) => progressBug(bug, seconds));
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
        const length = Math.hypot(quarry.position.x - bug.position.x, quarry.position.y - bug.position.y);
        if (length <= BUG_BITE_RANGE) {
          bite(draft, quarry);
          return { ...bug, state: "hunting", targetShipId: quarry.id, leg: null, timer: BUG_BITE_SECONDS };
        }
        return {
          ...bug,
          state: "hunting",
          targetShipId: quarry.id,
          leg: { from: { ...bug.position }, to: { ...quarry.position } },
          timer: huntSeconds(length),
        };
      }
    }
    // Nothing to hunt: loiter, whether the bug was hovering or had lost its
    // quarry to a bite from a sibling.
    // The hive is gone from the state: hold where it is rather than spin.
    if (!hive) return { ...bug, state: "hovering", targetShipId: null, leg: null, timer: 1 };
    const loiter = loiterPoint(draft, hive, bug);
    return { ...bug, state: "hovering", targetShipId: null, leg: { from: { ...bug.position }, to: loiter.to }, timer: loiter.seconds };
  });
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
  return soonest;
}
