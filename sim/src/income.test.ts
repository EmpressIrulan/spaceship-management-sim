import { describe, expect, it } from "vitest";
import { oneStorageStart } from "./test-ships";
import { CARGO_PER_TRIP, INCOME_WINDOW_SECONDS, stationIncome, type SimState } from "./index";
import { tick } from "./tick";

function run(state: SimState, seconds: number, step = 0.1): SimState {
  let next = state;
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += step) next = tick(next, Math.min(step, seconds - elapsed));
  return next;
}

// One trip, then the ship parks, so nothing else is delivered afterwards.
function onePassStart(): SimState {
  const start = oneStorageStart(7);
  return { ...start, ships: start.ships.map((ship) => ({ ...ship, defaultBehaviour: "none" as const })) };
}

const total = (income: Record<string, number>) => Object.values(income).reduce((sum, amount) => sum + amount, 0);

describe("station income", () => {
  it("is zero before anything has been delivered", () => {
    expect(stationIncome(run(onePassStart(), 5))).toEqual({ Metal: 0, Ice: 0 });
  });

  it("reports a delivered load under the material it was mined from", () => {
    const start = onePassStart();
    const material = start.asteroids.find((a) => a.id === start.ships[0]!.target!.asteroidId)!.material;
    const other = material === "Metal" ? "Ice" : "Metal";
    const done = run(start, 60);
    expect(stationIncome(done)[material]).toBe(CARGO_PER_TRIP);
    expect(stationIncome(done)[other]).toBe(0);
  });

  it("counts a load a unit at a time while it unloads", () => {
    const start = onePassStart();
    let state = start;
    let last = 0;
    while (total(stationIncome(state)) < CARGO_PER_TRIP && state.tickCount < 2000) {
      state = tick(state, 0.1);
      const now = total(stationIncome(state));
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
    expect(total(stationIncome(state))).toBe(CARGO_PER_TRIP);
  });

  it("forgets deliveries older than the last game minute", () => {
    const delivered = run(onePassStart(), 60);
    expect(total(stationIncome(delivered))).toBe(CARGO_PER_TRIP);
    const later = run(delivered, INCOME_WINDOW_SECONDS + 1);
    expect(stationIncome(later)).toEqual({ Metal: 0, Ice: 0 });
  });

  it("gives the same figure however the time is sliced", () => {
    const start = oneStorageStart(7);
    expect(stationIncome(tick(start, 100))).toEqual(stationIncome(run(start, 100)));
  });

  it("does not count ore that was already in storage or that is spent", () => {
    const spent = { ...onePassStart(), stations: [{ ...onePassStart().stations[0]!, inventory: { Metal: 0, Ice: 0 } }] };
    expect(stationIncome(spent)).toEqual({ Metal: 0, Ice: 0 });
  });
});
