import { describe, expect, it } from "vitest";
import { tick } from "./tick";
import { createInitialState } from "./state";
import {
  BUG_HOVER_RADIUS,
  BUG_SPAWN_SECONDS,
  HIVE_HP,
  HIVE_SECTOR,
} from "./build-constants";
import type { SimState } from "./state";

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
    // 55 seconds hatches five bugs (at 10, 20, 30, 40 and 50 s) and leaves them
    // a few seconds of loitering each. Loitering ends before the count reaches
    // the threshold, so the whole run is criterion 3 behaviour.
    let state = createInitialState(7);
    const home = state.stations[0]!;
    for (const dt of [10, 3, 37, 5]) {
      state = tick(state, dt);
      for (const bug of state.bugs ?? []) {
        expect(bug.state).toBe("hovering");
        expect(Math.hypot(bug.position.x - hive(state).position.x, bug.position.y - hive(state).position.y))
          .toBeLessThanOrEqual(BUG_HOVER_RADIUS + 1e-9);
        // They ignore ships: they never leave the hive's sector, let alone
        // home in on the Dock across the gate.
        expect(bug.sectorId).toBe(HIVE_SECTOR);
      }
      void home;
    }
    expect(state.bugs?.length).toBe(5);
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
