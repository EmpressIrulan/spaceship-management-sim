import { describe, expect, it } from "vitest";
import { tick } from "./tick";
import { createInitialState, type SimState } from "./state";
import { EXPLOSION_CUTOFF_SECONDS } from "./build-constants";

const DT = 1;

// A destruction at the given game second, standing in for a bug bite.
function destructionAt(time: number) {
  return { time, stationId: 0, position: { x: 10, y: 20 } };
}

// Batch each second's simulation work, still injecting all 600 destructions.
// Retention uses game time, not renderer frames.
function runWithDestructions(state: SimState, seconds: number): SimState {
  let next = state;
  const target = next.time + seconds;
  let bitten = Math.floor(next.time);
  while (next.time < target) {
    next = tick(next, DT);
    if (Math.floor(next.time) > bitten) {
      bitten = Math.floor(next.time);
      next = { ...next, moduleDestructions: [...(next.moduleDestructions ?? []), destructionAt(next.time)] };
    }
  }
  return next;
}

describe("module destructions", () => {
  it("leaves the list short after many destructions over a long run", () => {
    const end = runWithDestructions(createInitialState(7), 600);
    // Six hundred destructions went in, one per second. Only the ones inside
    // the explosion's window can still be on screen.
    expect((end.moduleDestructions ?? []).length).toBeLessThanOrEqual(
      Math.ceil(EXPLOSION_CUTOFF_SECONDS) + 1,
    );
    expect(end.moduleDestructions?.every((d) => d.time > end.time - EXPLOSION_CUTOFF_SECONDS)).toBe(true);
  });

  it("does not change the state it was given", () => {
    const state = createInitialState(7);
    state.moduleDestructions = [destructionAt(0)];
    const returned = tick(state, 5);
    expect(state.moduleDestructions).toHaveLength(1);
    expect(state.moduleDestructions![0]!.time).toBe(0);
    // The copy the tick produces has dropped the entry past the cutoff, but
    // recent entries stay.
    expect(returned.moduleDestructions).toHaveLength(0);
  });

  it("still trims when every station is gone", () => {
    const state = createInitialState(7);
    state.stations = [];
    state.moduleDestructions = [destructionAt(0)];
    const returned = tick(state, 5);
    expect(returned.moduleDestructions).toHaveLength(0);
  });
});
