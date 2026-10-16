import {
  BUG_HP, BUG_SPEED_FACTOR, WORKERS_PER_HIVE, WORKER_DESIGN, WORKER_HOLD, WORKER_MINE_SECONDS, WORKER_RETRY_SECONDS, WORKER_SPAWN_RADIUS,
} from "./build-constants";
import type { Asteroid, Bug, Hive, Vec } from "./model";
import { travelSeconds } from "./motion";
import { pixelCount } from "./ship";
import { mineAsteroid, type Draft } from "./tick-mining";

// Missing role means a fighter, so bugs from older fixtures keep their behaviour.
export function isWorker(bug: Bug): boolean {
  return bug.role === "worker";
}

// A new worker waits at its hive, empty-handed. Its first settle sends it out.
// Each worker takes its own angle around the hive, so the first traffic pass
// does not have to push stacked bodies apart.
export function makeWorker(id: number, hive: Pick<Hive, "id" | "sectorId" | "position">): Bug {
  const maxHp = pixelCount(WORKER_DESIGN) * BUG_HP;
  const angle = (id / WORKERS_PER_HIVE) * Math.PI * 2;
  return {
    id,
    role: "worker",
    hiveId: hive.id,
    sectorId: hive.sectorId,
    position: { x: hive.position.x + Math.cos(angle) * WORKER_SPAWN_RADIUS, y: hive.position.y + Math.sin(angle) * WORKER_SPAWN_RADIUS },
    design: WORKER_DESIGN,
    hp: maxHp,
    maxHp,
    state: "hovering",
    targetShipId: null,
    targetModule: null,
    leg: null,
    timer: 0,
    cargo: 0,
    cargoMaterial: null,
    asteroidId: null,
    nudgeX: 0,
    nudgeY: 0,
  };
}

// A leg takes at least a second, as loiter legs do, so a short hop cannot snap
// the worker across the frame. It also keeps the event loop from stepping by zero.
const MIN_LEG_SECONDS = 1;

function legTo(bug: Bug, state: Bug["state"], to: Vec, asteroidId: number | null): Bug {
  const length = Math.hypot(to.x - bug.position.x, to.y - bug.position.y);
  return {
    ...bug,
    state,
    asteroidId,
    leg: { from: { ...bug.position }, to: { ...to } },
    // The leg starts from where the worker stands, nudge and all, so the
    // nudge is not added on top of it again.
    nudgeX: 0,
    nudgeY: 0,
    timer: Math.max(MIN_LEG_SECONDS, travelSeconds(length, BUG_SPEED_FACTOR)),
  };
}

// The rock nearest the worker in its own sector. Ties go to the lower id, so
// the pick replays exactly from the seed.
function nearestRock(draft: Draft, bug: Bug): Asteroid | null {
  let best: Asteroid | null = null;
  let bestDistance = Infinity;
  for (const rock of draft.asteroids) {
    if (rock.sectorId !== bug.sectorId) continue;
    const distance = Math.hypot(rock.position.x - bug.position.x, rock.position.y - bug.position.y);
    if (!best || distance < bestDistance || (distance === bestDistance && rock.id < best.id)) {
      best = rock;
      bestDistance = distance;
    }
  }
  return best;
}

// Sends an idle worker to the nearest rock, or has it wait at the hive when
// the sector has no rock left.
function dispatch(draft: Draft, bug: Bug): Bug {
  const rock = nearestRock(draft, bug);
  if (!rock) return { ...bug, state: "hovering", asteroidId: null, leg: null, timer: WORKER_RETRY_SECONDS };
  return legTo(bug, "seeking", rock.position, rock.id);
}

function homeward(draft: Draft, bug: Bug, state: "returning" | "fleeing"): Bug {
  const hive = draft.hives.find((candidate) => candidate.id === bug.hiveId);
  if (!hive) return { ...bug, state: "hovering", asteroidId: null, leg: null, timer: WORKER_RETRY_SECONDS };
  return legTo(bug, state, hive.position, null);
}

// Puts the ore a worker carries into its hive's stock.
function deposit(draft: Draft, bug: Bug): void {
  const { cargoMaterial: material, cargo } = bug;
  if (!material || !cargo) return;
  draft.hives = draft.hives.map((hive) => {
    if (hive.id !== bug.hiveId) return hive;
    const stock = { Metal: 0, Ice: 0, ...hive.stock };
    return { ...hive, stock: { ...stock, [material]: stock[material] + cargo } };
  });
}

// One worker's timer has run out, so it moves on to whatever comes next.
function settleWorker(draft: Draft, bug: Bug): Bug {
  switch (bug.state) {
    case "seeking": {
      const rock = draft.asteroids.find((candidate) => candidate.id === bug.asteroidId);
      if (!rock) return dispatch(draft, bug);
      return { ...bug, state: "mining", leg: null, timer: WORKER_MINE_SECONDS };
    }
    case "mining": {
      const rock = draft.asteroids.find((candidate) => candidate.id === bug.asteroidId);
      const taken = rock ? mineAsteroid(draft, rock.id, WORKER_HOLD) : 0;
      if (!rock || taken === 0) return dispatch(draft, { ...bug, asteroidId: null });
      return homeward(draft, { ...bug, cargo: taken, cargoMaterial: rock.material }, "returning");
    }
    case "returning":
    case "fleeing": {
      deposit(draft, bug);
      return dispatch(draft, { ...bug, cargo: 0, cargoMaterial: null });
    }
    default:
      return dispatch(draft, bug);
  }
}

// Fires every worker whose timer has run out. Workers draw no randomness, so
// they never disturb the enemy stream.
export function settleWorkers(draft: Draft): void {
  draft.bugs = draft.bugs.map((bug) => isWorker(bug) && bug.timer <= 0 ? settleWorker(draft, bug) : bug);
}

// A shot worker drops its errand and runs for the hive. The ore it carries
// goes in on arrival, like any other trip home.
export function fleeHome(draft: Draft, bug: Bug): Bug {
  if (!isWorker(bug)) return bug;
  return homeward(draft, bug, "fleeing");
}
