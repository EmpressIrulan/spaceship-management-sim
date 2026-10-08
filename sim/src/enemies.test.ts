import { describe, expect, it } from "vitest";
import { tick } from "./tick";
import { createInitialState, homeStation } from "./state";
import {
  BUG_ATTACK_THRESHOLD,
  BUG_BITE_DAMAGE,
  BUG_HOVER_RADIUS,
  BUG_SPAWN_SECONDS,
  HIVE_HP,
  HIVE_SECTOR,
} from "./build-constants";
import { shipHp } from "./ship";
import type { Ship, SimState } from "./state";

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
