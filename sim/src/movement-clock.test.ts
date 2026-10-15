import { expect, it } from "vitest";
import { tick } from "./tick";
import { createInitialState } from "./state";

it("initializes finite module footprints when movement is loaded through tick first", () => {
  const state = createInitialState(3);
  for (const station of state.stations) for (const module of station.modules) {
    expect(Number.isFinite(module.size.width)).toBe(true);
    expect(Number.isFinite(module.size.height)).toBe(true);
  }
  expect(Number.isFinite(tick(state, 1).time)).toBe(true);
});
