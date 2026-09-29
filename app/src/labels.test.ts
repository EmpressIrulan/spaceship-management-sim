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
  cargoMaterial: cargo > 0 ? "Metal" : null,
  timer,
  position: { x: 0, y: 0 },
  target: null,
  leg: null,
  order: null,
  defaultBehaviour: "mine",
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

  it("shows what a ship on an order carries, and nothing when it is empty", () => {
    expect(cargoGauge(ship("moving", 4))).toEqual({ fill: 0.4, text: `4/${CARGO_PER_TRIP}` });
    expect(cargoGauge(ship("holding", 4))).toEqual({ fill: 0.4, text: `4/${CARGO_PER_TRIP}` });
    expect(cargoGauge(ship("moving", 0))).toBeNull();
    expect(cargoGauge(ship("holding", 0))).toBeNull();
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

  it("shows the order a ship is following", () => {
    const withOrder = (order: Ship["order"], state: Ship["state"]) => ({
      ...createInitialState(7),
      ships: [{ ...ship(state, 0), order }],
    });
    expect(infoBox(withOrder({ kind: "mine", asteroidId: 1, loaded: false }, "outbound"), { kind: "ship", index: 0 }))
      .toEqual({ title: "Ship", line: "Order: mine" });
    expect(infoBox(withOrder({ kind: "move", point: { x: 0, y: 0 } }, "moving"), { kind: "ship", index: 0 }))
      .toEqual({ title: "Ship", line: "Order: move" });
    expect(infoBox(withOrder({ kind: "move", point: { x: 0, y: 0 } }, "holding"), { kind: "ship", index: 0 }))
      .toEqual({ title: "Ship", line: "Order: move\nHolding" });
    expect(infoBox(withOrder({ kind: "home" }, "homebound"), { kind: "ship", index: 0 }))
      .toEqual({ title: "Ship", line: "Order: home" });
  });

  it("shows a ship holding with no order", () => {
    const holding = { ...createInitialState(7), ships: [ship("holding", 0)] };
    expect(infoBox(holding, { kind: "ship", index: 0 })).toEqual({ title: "Ship", line: "Holding" });
  });
});
