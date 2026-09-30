import { describe, expect, it } from "vitest";
import {
  CARGO_PER_TRIP,
  UNLOADING_SECONDS,
  WORKING_SECONDS,
  createInitialState,
  type Ship,
} from "sim";
import { cargoGauge, infoBox } from "./labels";

// One Storage, so the hold matches CARGO_PER_TRIP and one Laser mines it in
// WORKING_SECONDS.
const ship = (state: Ship["state"], cargo: number, timer = 1): Ship => ({
  id: 0,
  design: { width: 2, height: 2, slots: ["Engine", "Laser", "Storage", null] },
  state,
  cargo,
  cargoMaterial: cargo > 0 ? "Metal" : null,
  timer,
  position: { x: 0, y: 0 },
  target: null,
  defaultBehaviour: "mine",
  order: null,
  leg: null,
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

  it("shows Storage's combined and per-material totals", () => {
    const stocked = { ...state, station: { ...state.station, inventory: { Metal: 40, Ice: 0 } } };
    expect(infoBox(stocked, { kind: "storage" })).toEqual({
      title: "Storage",
      line: "Stored 40 / 100\nMetal: 40",
    });
  });

  it("shows the same per-material totals on every Storage module", () => {
    const grown = {
      ...state,
      station: {
        ...state.station,
        storage: { ...state.station.storage, capacity: 200 },
        inventory: { Metal: 70, Ice: 40 },
        modules: [
          ...state.station.modules,
          { type: "Storage" as const, position: { x: 80, y: 0 }, size: state.station.storage.size },
        ],
      },
    };
    const expected = { title: "Storage", line: "Stored 110 / 200\nMetal: 70\nIce: 40" };
    expect(infoBox(grown, { kind: "storage" })).toEqual(expected);
    expect(infoBox(grown, { kind: "module", index: 2 })).toEqual(expected);
  });

  it("shows an asteroid's material and ore left, titled Asteroid", () => {
    expect(infoBox(state, { kind: "asteroid", id: asteroid.id })).toEqual({
      title: "Asteroid",
      line: `${asteroid.material}: 30`,
    });
    const mined = {
      ...state,
      asteroids: state.asteroids.map((a) => (a.id === asteroid.id ? { ...a, ore: 20 } : a)),
    };
    expect(infoBox(mined, { kind: "asteroid", id: asteroid.id })?.line).toBe(`${asteroid.material}: 20`);
  });

  it("closes when nothing is hovered or the hovered asteroid has gone", () => {
    expect(infoBox(state, null)).toBeNull();
    const gone = { ...state, asteroids: state.asteroids.filter((a) => a.id !== asteroid.id) };
    expect(infoBox(gone, { kind: "asteroid", id: asteroid.id })).toBeNull();
  });
});
