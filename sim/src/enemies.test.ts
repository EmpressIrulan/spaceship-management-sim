import { describe, expect, it } from "vitest";
import { tick } from "./tick";
import { createInitialState, homeStation } from "./state";
import { miningStart } from "./test-ships";
import {
  BUG_ATTACK_THRESHOLD,
  BUG_BITE_DAMAGE,
  BUG_HOVER_RADIUS,
  BUG_HP,
  BUG_SPAWN_SECONDS,
  GUN_DAMAGE,
  GUN_RANGE,
  GUN_SECONDS,
  GUN_SHOT_SECONDS,
  HIVE_HP,
  HIVE_SECTOR,
  MODULE_HP,
  TURRET_DAMAGE,
  TURRET_METAL_PER_SHOT,
  TURRET_RANGE,
  TURRET_SHOT_SECONDS,
  TURRET_SECONDS,
} from "./build-constants";
import { giveOrder } from "./orders";
import { gunBeams } from "./enemies";
import { shipHp } from "./ship";
import type { Bug, Hive, Ship, ShipDesign, SimState } from "./state";

function hive(state: SimState) {
  const found = state.hives?.[0];
  if (!found) throw new Error("state has no hive");
  return found;
}

describe("hive", () => {
  it("starts in the sector next to home, with full HP", () => {
    const state = createInitialState(7);
    expect(state.hives?.length).toBe(1);
    expect(hive(state).sectorId).toBe(HIVE_SECTOR);
    expect(hive(state).hp).toBe(HIVE_HP);
    expect(hive(state).maxHp).toBe(HIVE_HP);
  });

  it("releases a bug every BUG_SPAWN_SECONDS", () => {
    let state = createInitialState(7);
    state = tick(state, BUG_SPAWN_SECONDS);
    expect(state.bugs?.length).toBe(1);
    state = tick(state, BUG_SPAWN_SECONDS);
    expect(state.bugs?.length).toBe(2);
    // Halfway to the next hatch: still two.
    state = tick(state, BUG_SPAWN_SECONDS / 2);
    expect(state.bugs?.length).toBe(2);
  });

  it("spawns each bug in the hive's sector, from the hive", () => {
    let state = createInitialState(7);
    state = tick(state, BUG_SPAWN_SECONDS);
    const born = state.bugs![0]!;
    expect(born.sectorId).toBe(HIVE_SECTOR);
    expect(born.hiveId).toBe(hive(state).id);
    expect(born.hp).toBe(born.maxHp);
  });

  it("with fewer than 5 alive, bugs loiter by the hive and ignore ships", () => {
    // 40 seconds hatches four bugs (at 10, 20, 30 and 40 s), one short of the
    // attack threshold, and leaves them a few seconds of loitering each.
    let state = createInitialState(7);
    for (const dt of [10, 3, 27]) {
      state = tick(state, dt);
      for (const bug of state.bugs ?? []) {
        expect(bug.state).toBe("hovering");
        expect(Math.hypot(bug.position.x - hive(state).position.x, bug.position.y - hive(state).position.y))
          .toBeLessThanOrEqual(BUG_HOVER_RADIUS + 1e-9);
        // They ignore ships: they never leave the hive's sector, let alone
        // home in on the Dock across the gate.
        expect(bug.sectorId).toBe(HIVE_SECTOR);
      }
    }
    expect(state.bugs?.length).toBe(BUG_ATTACK_THRESHOLD - 1);
  });

  it("replays exactly from the seed", () => {
    const run = () => {
      let state = createInitialState(7);
      for (const dt of [10, 3, 37, 60, 121]) state = tick(state, dt);
      return JSON.stringify(state);
    };
    expect(run()).toBe(run());
  });
});

// A ship parked in the hive's sector, holding still with nothing queued, so
// every bug at the attack threshold has a target to fly at. It starts full of
// cargo, so its destruction takes the cargo with it.
function parkedStart(seed: number): { state: SimState; shipId: number } {
  const state = createInitialState(seed);
  const hive = state.hives![0]!;
  const shipId = state.nextShipId;
  const parked: Ship = {
    ...state.ships[0]!,
    id: shipId,
    state: "holding",
    timer: 0,
    sectorId: HIVE_SECTOR,
    position: { x: hive.position.x + 25, y: hive.position.y },
    defaultBehaviour: "none",
    order: null,
    target: null,
    leg: null,
    berth: null,
    transfer: null,
    cargo: 5,
    cargoByMaterial: { Metal: 5, Ice: 0 },
    cargoMaterial: "Metal",
  };
  return { state: { ...state, ships: [...state.ships, parked], nextShipId: shipId + 1 }, shipId };
}

describe("bugs hunt ships", () => {
  it("at 5 or more alive, bugs fly at the nearest ship in their sector", () => {
    const { state: start, shipId } = parkedStart(7);
    let state = start;
    // Past the fifth hatch (at 50 s) and long enough for every bug to finish
    // whatever leg it was on, so all of them have had a chance to join in.
    // The bites over those 30 s only dent the hull, so the quarry is still up.
    for (const dt of [10, 3, 37, 30]) state = tick(state, dt);
    expect(state.bugs?.length).toBe(8);
    for (const bug of state.bugs ?? []) {
      expect(bug.state).toBe("hunting");
      expect(bug.targetShipId).toBe(shipId);
      expect(bug.sectorId).toBe(HIVE_SECTOR);
    }
  });

  it("ignores ships docked inside a hangar when choosing a quarry", () => {
    const { state: start, shipId } = parkedStart(7);
    const carrier = { ...start.ships[0]!, id: shipId + 1, state: "holding" as const,
      sectorId: HIVE_SECTOR, position: start.ships.find((ship) => ship.id === shipId)!.position };
    const hidden = { ...start.ships.find((ship) => ship.id === shipId)!, state: "docked" as const, hangarId: carrier.id };
    let state: SimState = { ...start, ships: [carrier, hidden] };
    for (const dt of [10, 3, 37, 30]) state = tick(state, dt);
    expect(state.bugs?.every((bug) => bug.targetShipId !== hidden.id)).toBe(true);
  });

  it("bites wear the ship's HP down from full", () => {
    const { state: start, shipId } = parkedStart(7);
    let state = start;
    // Just past the fifth hatch and the first bites.
    for (const dt of [10, 3, 37, 8]) state = tick(state, dt);
    const ship = state.ships.find((candidate) => candidate.id === shipId);
    expect(ship).toBeDefined();
    const { hp, maxHp } = shipHp(ship!);
    expect(hp).toBeLessThan(maxHp);
    expect(hp).toBeGreaterThan(0);
  });

  it("at 0 HP the ship explodes and it and its cargo are gone", () => {
    const { state: start, shipId } = parkedStart(7);
    // A few hundred seconds lets the swarm wear a SHIP_HP hull down and the
    // rest of the run tick on afterwards without one.
    let state = tick(start, 450);
    expect(state.ships.some((candidate) => candidate.id === shipId)).toBe(false);
    // The cargo went with the ship: nothing unloaded it into Home, which a run
    // without the parked ship confirms.
    const control = tick(createInitialState(7), 450);
    expect(homeStation(state).inventory).toEqual(homeStation(control).inventory);
    expect(homeStation(state).deliveries).toEqual(homeStation(control).deliveries);
    // With no ship left in the sector the bugs fall back to loitering.
    for (const bug of state.bugs ?? []) expect(bug.state).toBe("hovering");
  });

  it("with no ship in their sector, bugs at the threshold keep loitering", () => {
    let state = createInitialState(7);
    for (const dt of [10, 3, 37, 30]) state = tick(state, dt);
    expect(state.bugs?.length).toBeGreaterThan(BUG_ATTACK_THRESHOLD);
    for (const bug of state.bugs ?? []) {
      expect(bug.state).toBe("hovering");
      expect(bug.targetShipId).toBe(null);
    }
  });

  it("hunting replays exactly from the seed", () => {
    const run = () => {
      let state = parkedStart(7).state;
      for (const dt of [10, 3, 37, 450]) state = tick(state, dt);
      return JSON.stringify(state);
    };
    expect(run()).toBe(run());
  });
});

describe("bugs hunt station modules", () => {
  it("damages the nearest standing module once five bugs are alive", () => {
    const start = createInitialState(7);
    const hive = start.hives![0]!;
    const module = { ...start.stations[0]!.modules[0]!, position: { x: hive.position.x + 25, y: hive.position.y } };
    let state: SimState = { ...start, stations: [{ ...start.stations[0]!, sectorId: HIVE_SECTOR, modules: [module] }] };
    for (const dt of [10, 3, 37, 8]) state = tick(state, dt);
    const damaged = state.stations[0]!.modules[0]!;
    expect(damaged.maxHp).toBe(MODULE_HP);
    expect(damaged.hp).toBeLessThan(MODULE_HP);
    expect(state.bugs?.every((bug) => bug.targetModule?.stationId === 0)).toBe(true);
  });

  it("does not target a module at zero HP", () => {
    const { state: start, shipId } = parkedStart(7);
    const module = { ...start.stations[0]!.modules[0]!, position: { x: start.hives![0]!.position.x + 5, y: start.hives![0]!.position.y }, hp: 0, maxHp: MODULE_HP };
    const state = tick({ ...start, stations: [{ ...start.stations[0]!, sectorId: HIVE_SECTOR, modules: [module] }] }, 58);
    expect(state.stations[0]!.modules[0]!.hp).toBe(0);
    expect(state.bugs?.some((bug) => bug.targetShipId === shipId)).toBe(true);
    expect(state.bugs?.some((bug) => bug.targetModule)).toBe(false);
  });
});

// A one-pixel gun ship parked in the hive's sector, holding still with nothing
// queued, so nothing about it moves and the guns do the only acting.
function gunStart(seed: number, spawnTimer = 10_000): { state: SimState; shipId: number; hive: Hive } {
  const state = createInitialState(seed);
  const hive = state.hives![0]!;
  const shipId = state.nextShipId;
  const gunner: Ship = {
    ...state.ships[0]!,
    id: shipId,
    state: "holding",
    timer: 0,
    sectorId: HIVE_SECTOR,
    position: { x: hive.position.x + 25, y: hive.position.y },
    design: GUN_SHIP,
    defaultBehaviour: "none",
    order: null,
    target: null,
    leg: null,
    berth: null,
    transfer: null,
  };
  return {
    state: {
      ...state,
      ships: [...state.ships, gunner],
      hives: [{ ...hive, spawnTimer }],
      nextShipId: shipId + 1,
    },
    shipId,
    hive: { ...hive, spawnTimer },
  };
}

// A bare Gun pixel. Valid on its own: a gun ship needs no engine for the gun
// tests, which park it still.
const GUN_SHIP: ShipDesign = { width: 1, height: 1, slots: ["Gun"] };

// An engine and a Gun, so the ship can actually be flown to the hive's sector.
const GUN_PATROL: ShipDesign = { width: 2, height: 1, slots: ["Engine", "Gun"] };

// A bug planted at an exact spot, holding still (no leg, timer far off), so a
// test aims the guns at a known point.
function plantedBug(id: number, hive: Hive, x: number, y: number, timer = 10_000): Bug {
  return {
    id,
    hiveId: hive.id,
    sectorId: hive.sectorId,
    position: { x, y },
    hp: BUG_HP,
    maxHp: BUG_HP,
    state: "hovering",
    targetShipId: null,
    targetModule: null,
    leg: null,
    timer,
  };
}

describe("gun ships", () => {
  it("does not let a Gun docked inside a hangar fire", () => {
    const { state: start, shipId, hive } = gunStart(7);
    const carrier = { ...start.ships[0]!, id: shipId + 1, state: "holding" as const,
      sectorId: HIVE_SECTOR, position: start.ships.find((ship) => ship.id === shipId)!.position };
    const hidden = { ...start.ships.find((ship) => ship.id === shipId)!, state: "docked" as const, hangarId: carrier.id };
    const state = tick({ ...start, ships: [carrier, hidden] }, 1);
    expect(state.hives![0]!.hp).toBe(hive.hp);
    expect(state.ships.find((ship) => ship.id === shipId)!.gunShot ?? null).toBeNull();
  });

  it("shoot the nearest bug in range on their own, and no other", () => {
    const { state: start, shipId, hive } = gunStart(7);
    const ship = start.ships.find((candidate) => candidate.id === shipId)!;
    const near = plantedBug(0, hive, ship.position.x + 20, ship.position.y);
    const far = plantedBug(1, hive, ship.position.x + 40, ship.position.y);
    let state: SimState = { ...start, bugs: [far, near] };
    state = tick(state, 1);
    expect(state.bugs!.find((bug) => bug.id === 0)!.hp).toBe(BUG_HP);
    state = tick(state, GUN_SHOT_SECONDS);
    const gunner = state.ships.find((candidate) => candidate.id === shipId)!;
    expect(gunner.gunTimer).toBe(GUN_SECONDS - GUN_SHOT_SECONDS);
    // The nearer bug took the shot; the other kept its full hull.
    expect(state.bugs!.find((bug) => bug.id === 1)!.hp).toBe(far.hp);
    expect(state.bugs!.find((bug) => bug.id === 0)!.hp).toBe(BUG_HP - GUN_DAMAGE);
    expect(gunBeams(state)).toEqual([]);
  });

  it("kill a bug in a few hits: BUG_HP over GUN_DAMAGE, rounded up", () => {
    const { state: start, shipId, hive } = gunStart(7);
    const ship = start.ships.find((candidate) => candidate.id === shipId)!;
    const bug = plantedBug(0, hive, ship.position.x + 20, ship.position.y);
    const hits = Math.ceil(BUG_HP / GUN_DAMAGE);
    let state: SimState = { ...start, bugs: [bug] };
    for (let hit = 1; hit < hits; hit += 1) {
      state = tick(state, GUN_SECONDS);
      expect(state.bugs!.length).toBe(1);
    }
    state = tick(state, GUN_SECONDS + GUN_SHOT_SECONDS);
    expect(state.bugs).toHaveLength(0);
  });

  it("shoot the hive when no bug is in range", () => {
    const { state: start, shipId, hive } = gunStart(7);
    // No bugs have hatched yet: the hive itself is the only target in range.
    let state = tick(start, 1);
    expect(state.hives![0]!.hp).toBe(HIVE_HP);
    state = tick(state, GUN_SHOT_SECONDS);
    const hiveState = state.hives![0]!;
    expect(hiveState.hp).toBe(HIVE_HP - GUN_DAMAGE);
    expect(hiveState.alive).toBe(true);
    expect(gunBeams(state)).toEqual([]);
  });

  it("leave everything out of range alone", () => {
    const { state: start, shipId, hive } = gunStart(7);
    // The ship sits a whole gun range off the hive, and the bug beyond that.
    const far: Ship = {
      ...start.ships.find((candidate) => candidate.id === shipId)!,
      position: { x: hive.position.x + GUN_RANGE + 5, y: hive.position.y },
    };
    let state: SimState = {
      ...start,
      ships: start.ships.map((candidate) => (candidate.id === shipId ? far : candidate)),
      bugs: [plantedBug(0, hive, hive.position.x + 2 * GUN_RANGE + 15, hive.position.y)],
    };
    state = tick(state, 1);
    state = tick(state, GUN_SHOT_SECONDS);
    expect(state.bugs![0]!.hp).toBe(BUG_HP);
    expect(state.hives![0]!.hp).toBe(HIVE_HP);
    const gunner = state.ships.find((candidate) => candidate.id === shipId)!;
    expect(gunBeams(state)).toEqual([]);
    expect(gunner.gunShot ?? null).toBeNull();
  });

  it("kill a dying hive dead, and it stops releasing bugs", () => {
    const { state: start, shipId, hive } = gunStart(7);
    // One shot's worth of hull left, so the next shot kills it.
    let state: SimState = { ...start, hives: [{ ...start.hives![0]!, hp: GUN_DAMAGE }] };
    state = tick(state, 1);
    state = tick(state, GUN_SHOT_SECONDS);
    expect(state.hives![0]!.alive).toBe(false);
    expect(state.hives![0]!.hp).toBe(0);
    // No matter how long the run goes on, no bug ever hatches again.
    for (let round = 0; round < 5; round += 1) {
      const before = (state.bugs ?? []).map((bug) => bug.id);
      state = tick(state, BUG_SPAWN_SECONDS);
      expect((state.bugs ?? []).map((bug) => bug.id)).toEqual(before);
    }
    // A dead hive is not a target either, so the guns go quiet.
    expect(gunBeams(state)).toEqual([]);
    expect(state.ships.find((candidate) => candidate.id === shipId)!.gunShot ?? null).toBeNull();
  });

  it("replay the whole fight exactly from the seed", () => {
    const run = () => {
      let state = gunStart(7, 10).state;
      for (const dt of [10, 3, 37, 120]) state = tick(state, dt);
      return JSON.stringify(state);
    };
    expect(run()).toBe(run());
  });

  it("a ship with Guns can be sent to the hive's sector with a move order", () => {
    let state = miningStart(7);
    state = {
      ...state,
      ships: state.ships.map((ship) => (ship.id === 0 ? { ...ship, design: GUN_PATROL } : ship)),
    };
    const hive = state.hives![0]!;
    state = giveOrder(state, [0], { kind: "move", point: { x: hive.position.x + 60, y: hive.position.y }, sectorId: HIVE_SECTOR });
    expect(state.ships[0]!.order?.kind).toBe("move");
    // A cruise over the gate lands it in the hive's sector.
    state = tick(state, 200);
    expect(state.ships[0]!.sectorId).toBe(HIVE_SECTOR);
  });
});

describe("station Turrets", () => {
  function turretStart(): { state: SimState; modulePosition: { x: number; y: number }; hive: Hive } {
    const state = createInitialState(7);
    const hive = state.hives![0]!;
    const modulePosition = { x: hive.position.x + 25, y: hive.position.y };
    return {
      state: {
        ...state,
        stations: [{ ...state.stations[0]!, sectorId: HIVE_SECTOR, inventory: { Metal: 10, Ice: 0 },
          modules: [{ ...state.stations[0]!.modules[0]!, type: "Turret", position: modulePosition, hp: MODULE_HP, maxHp: MODULE_HP }] }],
        hives: [{ ...hive, spawnTimer: 10_000 }],
        bugs: [],
      },
      modulePosition,
      hive,
    };
  }

  it("fires at a bug in range, reports its beam, spends Metal, and damages the bug", () => {
    const { state: start, modulePosition, hive } = turretStart();
    const bug = plantedBug(0, hive, modulePosition.x + 20, modulePosition.y);
    let state = tick({ ...start, bugs: [bug] }, 1);
    expect(state.stations[0]!.inventory.Metal).toBe(10 - TURRET_METAL_PER_SHOT);
    expect(state.stations[0]!.modules[0]!.turretShot).toMatchObject({ target: { kind: "bug", id: 0 } });
    expect(state.stations[0]!.modules[0]!.turretShot?.timer).toBe(TURRET_SHOT_SECONDS);
    expect(gunBeams(state)).toContainEqual({ from: modulePosition, to: bug.position });
    state = tick(state, TURRET_SHOT_SECONDS);
    expect(state.bugs![0]!.hp).toBe(BUG_HP - TURRET_DAMAGE);
  });

  it("shoots the hive when no bug is in range", () => {
    const { state: start, modulePosition, hive } = turretStart();
    let state = tick(start, 1);
    expect(state.stations[0]!.modules[0]!.turretShot?.target).toEqual({ kind: "hive", id: hive.id });
    state = tick(state, TURRET_SHOT_SECONDS);
    expect(state.hives![0]!.hp).toBe(hive.hp - TURRET_DAMAGE);
    expect(state.stations[0]!.inventory.Metal).toBe(10 - TURRET_METAL_PER_SHOT);
  });

  it("stops firing and reports no Metal", () => {
    const { state: start, modulePosition, hive } = turretStart();
    const state = tick({ ...start, stations: [{ ...start.stations[0]!, inventory: { Metal: TURRET_METAL_PER_SHOT - 1, Ice: 0 } }],
      bugs: [plantedBug(0, hive, modulePosition.x + TURRET_RANGE / 2, modulePosition.y)] }, 1);
    expect(state.stations[0]!.modules[0]!.turretShot ?? null).toBeNull();
    expect(state.stations[0]!.modules[0]!.turretNoMetal).toBe(true);
  });

  it("takes damage as a normal station module", () => {
    const { state: start, modulePosition, hive } = turretStart();
    let state = start;
    const bugs = Array.from({ length: 5 }, (_, id) => plantedBug(id, hive, modulePosition.x + 1, modulePosition.y, 0));
    state = tick({ ...state, bugs, stations: [{ ...state.stations[0]!, inventory: { Metal: 0, Ice: 0 } }] }, 1);
    expect(state.stations[0]!.modules[0]!.hp).toBe(MODULE_HP - BUG_BITE_DAMAGE * 5);
  });
});

describe("drops", () => {
  it("a shot bug keeps floating until a hit kills it, and then leaves 1 bug juice where it died", () => {
    const { state: start, shipId, hive } = gunStart(7);
    const ship = start.ships.find((candidate) => candidate.id === shipId)!;
    const bug = plantedBug(0, hive, ship.position.x + 20, ship.position.y);
    const hits = Math.ceil(BUG_HP / GUN_DAMAGE);
    let state: SimState = { ...start, bugs: [bug] };
    // Every hit but the last only dents the hull: no drop, bug still up.
    for (let hit = 1; hit < hits; hit += 1) {
      state = tick(state, GUN_SECONDS);
      expect(state.drops).toEqual([]);
      expect(state.bugs).toHaveLength(1);
    }
    // The killing shot: the bug is gone and its juice floats in its place.
    state = tick(state, GUN_SECONDS + GUN_SHOT_SECONDS);
    expect(state.bugs).toHaveLength(0);
    expect(state.drops).toEqual([{ id: 0, sectorId: HIVE_SECTOR, kind: "bugJuice", position: { ...bug.position } }]);
  });

  it("each dead bug leaves its own drop", () => {
    const { state: start, shipId, hive } = gunStart(7);
    const ship = start.ships.find((candidate) => candidate.id === shipId)!;
    // Two planted bugs the same distance apart as one: the nearer (lower id
    // wins the tie, and here they tie) falls first.
    const near = plantedBug(0, hive, ship.position.x + 20, ship.position.y);
    const far = plantedBug(1, hive, ship.position.x + 40, ship.position.y);
    let state: SimState = { ...start, bugs: [far, near] };
    for (let hits = 0; hits < Math.ceil(2 * BUG_HP / GUN_DAMAGE); hits += 1) state = tick(state, GUN_SECONDS + GUN_SHOT_SECONDS);
    expect(state.bugs).toHaveLength(0);
    expect(state.drops).toEqual([
      { id: 0, sectorId: HIVE_SECTOR, kind: "bugJuice", position: { ...near.position } },
      { id: 1, sectorId: HIVE_SECTOR, kind: "bugJuice", position: { ...far.position } },
    ]);
  });

  it("a killed hive leaves 1 queen larvae where it stood, and it stays", () => {
    const { state: start, hive } = gunStart(7);
    // One shot's worth of hull left, so the next shot kills it.
    let state: SimState = { ...start, hives: [{ ...start.hives![0]!, hp: GUN_DAMAGE, spawnTimer: 1000 }] };
    state = tick(state, 1);
    state = tick(state, GUN_SHOT_SECONDS);
    expect(state.hives![0]!.alive).toBe(false);
    expect(state.drops).toEqual([{ id: 0, sectorId: HIVE_SECTOR, kind: "queenLarvae", position: { ...hive.position } }]);
    // Nothing collects the larvae: it is still floating much later.
    state = tick(state, BUG_SPAWN_SECONDS * 3);
    expect(state.drops).toEqual([{ id: 0, sectorId: HIVE_SECTOR, kind: "queenLarvae", position: { ...hive.position } }]);
  });

  it("drops replay exactly from the seed", () => {
    const run = () => {
      const start = gunStart(7);
      const ship = start.state.ships.find((candidate) => candidate.id === start.shipId)!;
      const seeded: SimState = {
        ...start.state,
        hives: [{ ...start.state.hives![0]!, hp: GUN_DAMAGE }],
        bugs: [plantedBug(0, start.state.hives![0]!, ship.position.x + 20, ship.position.y)],
      };
      const run = () => {
        let state = seeded;
        for (const dt of [1, 2, 4, 8]) state = tick(state, dt);
        return JSON.stringify(state);
      };
      return run() === run();
    };
    expect(run()).toBe(true);
  });
});
