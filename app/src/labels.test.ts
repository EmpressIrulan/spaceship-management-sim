import { describe, expect, it } from "vitest";
import { CARGO_PER_TRIP, UNLOADING_SECONDS, WORKING_SECONDS, type Ship } from "sim";
import { cargoGauge } from "./labels";

const ship = (state: Ship["state"], cargo: number, timer = 1): Ship => ({
  state,
  cargo,
  timer,
  position: { x: 0, y: 0 },
});

describe("cargo gauge", () => {
  it("fills smoothly while mining, with the whole units mined written inside", () => {
    const gauge = cargoGauge(ship("working", 2, WORKING_SECONDS * 0.75));
    expect(gauge?.fill).toBeCloseTo(0.25);
    expect(gauge?.text).toBe(`2/${CARGO_PER_TRIP}`);
  });

  it("stays full on the way home", () => {
    expect(cargoGauge(ship("homebound", CARGO_PER_TRIP))).toEqual({
      fill: 1,
      text: `${CARGO_PER_TRIP}/${CARGO_PER_TRIP}`,
    });
  });

  it("drains smoothly while unloading", () => {
    const gauge = cargoGauge(ship("unloading", 7, UNLOADING_SECONDS * 0.7));
    expect(gauge?.fill).toBeCloseTo(0.7);
    expect(gauge?.text).toBe(`7/${CARGO_PER_TRIP}`);
  });

  it("shows nothing on an empty ship flying out", () => {
    expect(cargoGauge(ship("outbound", 0))).toBeNull();
  });
});
