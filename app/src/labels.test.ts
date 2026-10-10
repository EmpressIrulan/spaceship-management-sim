import { describe, expect, it } from "vitest";
import {
  CARGO_PER_TRIP,
  GATE_COST,
  INCOME_WINDOW_SECONDS,
  UNLOADING_SECONDS,
  WORKING_SECONDS,
  createInitialState,
  tick,
  type Bug,
  type Drop,
  type Ship,
} from "sim";
import { cargoGauge, infoBox } from "./labels";

// One module square's worth of Storage (four pixels), so the hold matches
// CARGO_PER_TRIP and the Laser pixels mine it in WORKING_SECONDS.
const ship = (state: Ship["state"], cargo: number, timer = 1): Ship => ({
  id: 0,
  design: {
    width: 4,
    height: 4,
    slots: [
      "Engine", "Engine", "Laser", "Laser",
      "Engine", "Engine", "Laser", "Laser",
      "Storage", "Storage", "Hull", "Hull",
      "Storage", "Storage", "Hull", "Hull",
    ],
  },
  state,
  sectorId: 0,
  cargo,
  cargoMaterial: cargo > 0 ? "Metal" : null,
  timer,
  position: { x: 0, y: 0 },
  target: null,
  defaultBehaviour: "mine",
  mineMaterials: ["Metal"],
  order: null,
  leg: null,
  berth: null,
  transfer: null,
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

  it("shows a half-full bar on the way home with half a hold aboard", () => {
    const gauge = cargoGauge(ship("homebound", CARGO_PER_TRIP / 2));
    expect(gauge?.fill).toBeCloseTo(0.5);
    expect(gauge?.text).toBe(`${CARGO_PER_TRIP / 2}/${CARGO_PER_TRIP}`);
  });

  it("starts unloading a partial load at the fraction aboard, not full", () => {
    const gauge = cargoGauge(ship("unloading", CARGO_PER_TRIP / 2, UNLOADING_SECONDS));
    expect(gauge?.fill).toBeCloseTo(0.5);
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
    const stocked = { ...state, stations: [{ ...state.stations[0]!, inventory: { Metal: 40, Ice: 0 } }] };
    expect(infoBox(stocked, { kind: "storage" })).toEqual({
      title: "Storage",
      line: "Stored 40 / 1000\nMetal: 40\nIncome: Metal +0/min, Ice +0/min",
    });
  });

  it("shows the same per-material totals on every Storage module", () => {
    const grown = {
      ...state,
      stations: [{
        ...state.stations[0]!,
        storage: { ...state.stations[0]!.storage, capacity: 2000 },
        inventory: { Metal: 70, Ice: 40 },
        modules: [
          ...state.stations[0]!.modules,
          { type: "Storage" as const, position: { x: 80, y: 0 }, size: state.stations[0]!.storage.size },
        ],
      }],
    };
    const expected = { title: "Storage", line: "Stored 110 / 2000\nMetal: 70\nIce: 40\nIncome: Metal +0/min, Ice +0/min" };
    expect(infoBox(grown, { kind: "storage" })).toEqual(expected);
    expect(infoBox(grown, { kind: "module", index: 2, stationId: 0 })).toEqual(expected);
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

  it("shows delivered gate materials on either outlined end", () => {
    const building = {
      ...state,
      gateProjects: [{ id: 4, ends: [{ sectorId: 0, position: { x: 80, y: 0 } }, { sectorId: 3, position: { x: 0, y: 80 } }],
        delivered: { Metal: 30, Ice: 10 }, complete: false }],
    } as typeof state;
    expect(infoBox(building, { kind: "gateProject", id: 4 })).toEqual({
      title: "Gate",
      line: "Gate 30 / 200 Metal, 10 / 200 Ice",
    });
  });

  it("counts ships loading as well as unloading at the Dock", () => {
    const loading = { ...ship("loading", 3), berth: 0, transfer: { startingCargo: 0, amount: 8 } };
    const unloading = { ...ship("unloading", 7), berth: 1, transfer: { startingCargo: 10, amount: 10 } };
    const transferring = { ...state, ships: [loading, unloading].map((ship) => ({ ...ship, position: { ...state.stations[0]!.dock.position } })) };

    expect(infoBox(transferring, { kind: "dock", stationId: 0 })).toEqual({ title: "Home", line: "Dock 32/96\n2 ships inside" });
  });

  it("shows the destination name instead of materials once a gate is complete", () => {
    const completed = {
      ...state,
      gateProjects: [{ id: 5, ends: [{ sectorId: 0, position: { x: 80, y: 0 } }, { sectorId: 3, position: { x: 0, y: 80 } }],
        delivered: { Metal: GATE_COST.Metal, Ice: GATE_COST.Ice }, complete: true }],
    } as typeof state;
    expect(infoBox(completed, { kind: "gateProject", id: 5, end: 0 })).toEqual({ title: "Gate", line: "Gate to " + completed.sectors[3]!.name });
    expect(infoBox(completed, { kind: "gateProject", id: 5, end: 1 })).toEqual({ title: "Gate", line: "Gate to " + completed.sectors[0]!.name });
  });

  it("shows the hive's hull as HP now / full", () => {
    expect(infoBox(createInitialState(7), { kind: "hive", id: 0 })).toEqual({ title: "Hive", line: "HP 200/200" });
  });

  it("shows a bug's hull as HP now / full, and closes once the bug has gone", () => {
    const bug: Bug = { id: 9, hiveId: 0, sectorId: 1, position: { x: 20, y: 0 }, hp: 3, maxHp: 6, state: "hunting", targetShipId: null, leg: null, timer: 1 };
    const state = { ...createInitialState(7), bugs: [bug] };
    expect(infoBox(state, { kind: "bug", id: bug.id })).toEqual({ title: "Bug", line: "HP 3/6" });
    expect(infoBox({ ...state, bugs: [] }, { kind: "bug", id: bug.id })).toBeNull();
  });

  it("names a drop by what it holds", () => {
    const juice: Drop = { id: 1, sectorId: 1, kind: "bugJuice", position: { x: 4, y: 0 } };
    const larvae: Drop = { id: 2, sectorId: 1, kind: "queenLarvae", position: { x: -4, y: 0 } };
    const state = { ...createInitialState(7), drops: [juice, larvae] };
    expect(infoBox(state, { kind: "drop", id: juice.id })).toEqual({ title: "Bug juice", line: "Nothing collects it yet" });
    expect(infoBox(state, { kind: "drop", id: larvae.id })?.title).toBe("Queen larvae");
    expect(infoBox(state, { kind: "drop", id: 7 })).toBeNull();
  });

  it("adds the hull to a hurt ship's hover, and leaves an unhurt ship's line alone", () => {
    const hurt = { ...ship("working", 0), hp: 24 };
    const damaging = { ...createInitialState(7), ships: [hurt] };
    expect(infoBox(damaging, { kind: "ship", index: 0 })?.line).toContain("HP 24/40");
    expect(infoBox(damaging, { kind: "ship", index: 0 })?.line).toContain("Mining");
    expect(infoBox({ ...damaging, ships: [ship("working", 0)] }, { kind: "ship", index: 0 })?.line).not.toContain("HP");
  });

  it("shows a capacitor shield and full HP on a ship hover", () => {
    const shielded = { ...ship("working", 0), design: {
      ...ship("working", 0).design,
      slots: ["Capacitor" as const, ...ship("working", 0).design.slots.slice(1)],
    } };
    const shield = { ...shielded, shield: 20, maxShield: 30, hp: 40, maxHp: 40 };
    const box = infoBox({ ...state, ships: [shield] }, { kind: "ship", index: 0 });
    expect(box).toEqual({ title: "Ship", line: "Mining Metal\nShield 20/30  HP 40/40" });
  });

  it("does not show a shield for a ship without Capacitors", () => {
    const box = infoBox({ ...state, ships: [ship("working", 0)] }, { kind: "ship", index: 0 });
    expect(box?.line).not.toContain("Shield");
  });

  it("keeps frame-sized shield refills readable without losing half-bite HP", () => {
    let state = createInitialState(7);
    state = { ...state, time: 5, hives: [], asteroids: [], ships: [{
      ...state.ships[0]!, state: "holding", timer: 0, target: null, leg: null,
      design: { width: 3, height: 1, slots: ["Capacitor", "Generator", "Hull"] },
      shield: 10, shieldLastHit: 0, hp: 39.5,
    }] };
    state = tick(state, 1 / 60);
    expect(infoBox(state, { kind: "ship", index: 0 })?.line).toBe("Holding\nShield 10/20  HP 39.5/40");
    for (let frame = 0; frame < 40; frame++) state = tick(state, 1 / 60);
    expect(infoBox(state, { kind: "ship", index: 0 })?.line).toBe("Holding\nShield 10.7/20  HP 39.5/40");
    for (let frame = 0; frame < 120; frame++) state = tick(state, 1 / 60);
    expect(infoBox(state, { kind: "ship", index: 0 })?.line).toBe("Holding\nShield 12.7/20  HP 39.5/40");
  });
});

describe("storage income", () => {
  const delivered = (deliveries: { at: number; material: "Metal" | "Ice"; amount: number }[], time: number) => {
    const state = createInitialState(1);
    return { ...state, time, stations: [{ ...state.stations[0]!, deliveries }] };
  };

  it("reads per material over the last game minute", () => {
    const state = delivered([{ at: 50, material: "Metal", amount: 42 }, { at: 70, material: "Ice", amount: 18 }], 100);
    const box = infoBox(state, { kind: "storage" });
    expect(box?.line).toContain("Income: Metal +42/min, Ice +18/min");
  });

  it("shows zero for a material that has not come in", () => {
    const box = infoBox(delivered([], 100), { kind: "storage" });
    expect(box?.line).toContain("Income: Metal +0/min, Ice +0/min");
  });

  it("drops deliveries older than a minute", () => {
    const state = delivered([{ at: 10, material: "Metal", amount: 9 }], 10 + INCOME_WINDOW_SECONDS + 1);
    expect(infoBox(state, { kind: "storage" })?.line).toContain("Metal +0/min");
  });

  it("shows on a built Storage module as well", () => {
    const state = delivered([{ at: 90, material: "Ice", amount: 5 }], 100);
    const index = state.stations[0]!.modules.findIndex((module) => module.type === "Storage");
    expect(infoBox(state, { kind: "module", index, stationId: 0 })?.line).toContain("Ice +5/min");
  });
});
