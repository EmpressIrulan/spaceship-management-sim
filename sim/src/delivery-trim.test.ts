import { describe, expect, it } from "vitest";
import { INCOME_WINDOW_SECONDS, stationIncome, type SimState } from "./index";
import { tick } from "./tick";
import { createInitialState } from "./state";
import { foundedStation } from "./test-ships";
import { placeStation } from "./station-placement";

// Every station's delivery list drops entries older than the income window at
// the end of a tick, not only the first station's.
function twoStations(): SimState {
  const placed = placeStation(createInitialState(7), 1, { x: 120, y: 40 });
  return { ...placed, stations: [placed.stations[0]!, foundedStation(1, 1, 120, 40)] };
}

function run(state: SimState, seconds: number): SimState {
  let next = state;
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += 0.5) next = tick(next, Math.min(0.5, seconds - elapsed));
  return next;
}

describe("delivery trimming", () => {
  it("drops entries older than the income window from both stations at the end of a tick", () => {
    const start = twoStations();
    const old = start.time - INCOME_WINDOW_SECONDS - 10;
    const fresh = start.time - 10;
    const state = {
      ...start,
      stations: [
        { ...start.stations[0]!, deliveries: [{ at: old, material: "Metal" as const, amount: 5 }, { at: fresh, material: "Metal" as const, amount: 6 }] },
        { ...start.stations[1]!, deliveries: [{ at: old, material: "Ice" as const, amount: 5 }, { at: fresh, material: "Ice" as const, amount: 6 }] },
      ],
    };
    const next = run(state, 1);
    expect(next.stations[0]!.deliveries).toEqual([{ at: fresh, material: "Metal", amount: 6 }]);
    expect(next.stations[1]!.deliveries).toEqual([{ at: fresh, material: "Ice", amount: 6 }]);
  });

  it("trims a second station whose list has gone entirely stale", () => {
    const start = twoStations();
    const old = start.time - INCOME_WINDOW_SECONDS - 10;
    const state = { ...start, stations: [start.stations[0]!, { ...start.stations[1]!, deliveries: [{ at: old, material: "Metal" as const, amount: 5 }] }] };
    const next = run(state, 1);
    expect(next.stations[1]!.deliveries).toEqual([]);
  });

  it("leaves a station whose deliveries all sit inside the window alone", () => {
    const start = twoStations();
    const fresh = start.time - 10;
    const deliveries = [{ at: fresh, material: "Metal" as const, amount: 5 }];
    const state = { ...start, stations: [start.stations[0]!, { ...start.stations[1]!, deliveries }] };
    const next = run(state, 1);
    expect(next.stations[1]!.deliveries).toEqual([{ at: fresh, material: "Metal", amount: 5 }]);
  });

  it("does not change any station's income figures", () => {
    // Parked well past the income window so the elapsed-time scaling is the
    // same on both reads and only the delivery lists differ.
    const base = { ...twoStations(), time: INCOME_WINDOW_SECONDS + 100 };
    const old = base.time - INCOME_WINDOW_SECONDS - 10;
    const fresh = base.time - 10;
    const state = {
      ...base,
      stations: [
        { ...base.stations[0]!, deliveries: [{ at: old, material: "Metal" as const, amount: 5 }, { at: fresh, material: "Metal" as const, amount: 6 }] },
        { ...base.stations[1]!, deliveries: [{ at: old, material: "Ice" as const, amount: 5 }, { at: fresh, material: "Ice" as const, amount: 6 }] },
      ],
    };
    const before = [stationIncome(state, 0), stationIncome(state, 1)];
    const next = run(state, 1);
    const after = [stationIncome(next, 0), stationIncome(next, 1)];
    expect(after).toEqual(before);
  });
});
