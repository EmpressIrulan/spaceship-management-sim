import { describe, expect, it } from "vitest";
import {
  CARGO_PER_TRIP,
  UNLOADING_SECONDS,
  WORKING_SECONDS,
  createInitialState,
  type Ship,
} from "sim";
import { cargoGauge, infoBox } from "./labels";

const ship = (state: Ship["state"], cargo: number, timer = 1): Ship => ({
  state,
  cargo,
  timer,
  position: { x: 0, y: 0 },
  target: null,
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

  it("shows nothing on an empty ship flying out or waiting at the station", () => {
    expect(cargoGauge(ship("outbound", 0))).toBeNull();
    expect(cargoGauge(ship("idle", 0))).toBeNull();
  });
});

describe("hover box", () => {
  const state = createInitialState(7);
  const asteroid = state.asteroids[0]!;

  it("shows the station's stored ore", () => {
    const stocked = { ...state, station: { ...state.station, inventory: 40 } };
    expect(infoBox(stocked, { kind: "station" })).toEqual({
      title: "Station inventory",
      line: "Stored: 40",
    });
  });

  it("shows an asteroid's ore left, titled Asteroid", () => {
    expect(infoBox(state, { kind: "asteroid", id: asteroid.id })).toEqual({
      title: "Asteroid",
      line: "Ore: 30",
    });
    const mined = {
      ...state,
      asteroids: state.asteroids.map((a) => (a.id === asteroid.id ? { ...a, ore: 20 } : a)),
    };
    expect(infoBox(mined, { kind: "asteroid", id: asteroid.id })?.line).toBe("Ore: 20");
  });

  it("closes when nothing is hovered or the hovered asteroid has gone", () => {
    expect(infoBox(state, null)).toBeNull();
    const gone = { ...state, asteroids: state.asteroids.filter((a) => a.id !== asteroid.id) };
    expect(infoBox(gone, { kind: "asteroid", id: asteroid.id })).toBeNull();
  });
});
