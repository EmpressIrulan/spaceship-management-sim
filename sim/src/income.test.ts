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
    expect(stationIncome(done)[material]).toBeCloseTo(CARGO_PER_TRIP / (done.time / 60));
    expect(stationIncome(done)[other]).toBe(0);
  });

  it("averages over elapsed game minutes before the first hour", () => {
    const start = onePassStart();
    const state = { ...start, time: 120, stations: [{ ...start.stations[0]!, deliveries: [
      { at: 60, material: "Metal" as const, amount: 60 },
    ] }] };
    expect(stationIncome(state).Metal).toBe(30);
  });

  it("averages a new station over its own age until it is an hour old", () => {
    const start = onePassStart();
    const state = { ...start, time: 600, stations: [{ ...start.stations[0]!, builtAt: 540, deliveries: [
      { at: 570, material: "Ice" as const, amount: 30 },
    ] }] };
    expect(stationIncome(state).Ice).toBe(30);
  });

  it("returns zero instead of dividing by zero at a station's build time", () => {
    const start = onePassStart();
    const state = { ...start, time: 600, stations: [{ ...start.stations[0]!, builtAt: 600, deliveries: [] }] };
    expect(stationIncome(state)).toEqual({ Metal: 0, Ice: 0 });
  });

  it("counts a load a unit at a time while it unloads", () => {
    const start = onePassStart();
    let state = start;
    while (state.stations[0]!.deliveries.reduce((sum, delivery) => sum + delivery.amount, 0) < CARGO_PER_TRIP && state.tickCount < 2000) {
      state = tick(state, 0.1);
    }
    expect(total(stationIncome(state))).toBeCloseTo(CARGO_PER_TRIP / (state.time / 60));
  });

  it("forgets deliveries older than the last game hour", () => {
    const delivered = run(onePassStart(), 60);
    expect(total(stationIncome(delivered))).toBeCloseTo(CARGO_PER_TRIP / (delivered.time / 60));
    const later = run(delivered, INCOME_WINDOW_SECONDS + 1);
    expect(stationIncome(later)).toEqual({ Metal: 0, Ice: 0 });
  });

  it("gives the same figure however the time is sliced", () => {
    const start = oneStorageStart(7);
    expect(stationIncome(tick(start, 100)).Metal).toBeCloseTo(stationIncome(run(start, 100)).Metal);
    expect(stationIncome(tick(start, 100)).Ice).toBeCloseTo(stationIncome(run(start, 100)).Ice);
  });

  it("does not count ore that was already in storage or that is spent", () => {
    const spent = { ...onePassStart(), stations: [{ ...onePassStart().stations[0]!, inventory: { Metal: 0, Ice: 0 } }] };
    expect(stationIncome(spent)).toEqual({ Metal: 0, Ice: 0 });
  });

  it("keeps delivered income unchanged when stored ore is spent", () => {
    const state = onePassStart();
    const material = state.asteroids.find((a) => a.id === state.ships[0]!.target!.asteroidId)!.material;
    const delivered = { ...state, time: 100, stations: [{ ...state.stations[0]!, deliveries: [{ at: 90, material, amount: 60 }] }] };
    const before = stationIncome(delivered);
    const after = { ...delivered, stations: [{ ...delivered.stations[0]!, inventory: { Metal: 0, Ice: 0 } }] };
    expect(stationIncome(after)).toEqual(before);
  });

  it("keeps the income figure steady while game time is paused", () => {
    const state = { ...onePassStart(), time: 100, stations: [{ ...onePassStart().stations[0]!, deliveries: [{ at: 90, material: "Metal" as const, amount: 60 }] }] };
    const paused = tick(state, 0);
    expect(paused.time).toBe(state.time);
    expect(stationIncome(paused)).toEqual(stationIncome(state));
  });
});
