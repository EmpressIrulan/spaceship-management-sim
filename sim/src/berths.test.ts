import { describe, expect, it } from "vitest";
import { DOCK_CAPACITY, createInitialState, dockBerths, shipSize, tick, type Ship, type SimState, type Vec } from "./index";

const homeWithOre = { state: "homebound" as const, timer: 0, cargo: 10, cargoMaterial: "Metal" as const };

function fleetAtDock(count: number): SimState {
  const state = createInitialState(7);
  const base = state.ships[0]!;
  return {
    ...state,
    station: { ...state.station, storage: { ...state.station.storage, capacity: 1000 } },
    ships: Array.from({ length: count }, (_, id): Ship => ({
      ...base, ...homeWithOre, id, position: { ...state.station.dock.position }, target: null, leg: null,
    })),
    nextShipId: count,
  };
}

const at = (ship: Ship): Vec => ship.position;
const apart = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

// Long enough for every ship to reach its pad or parking spot, and short
// enough that nobody has finished unloading.
const SETTLED = 8;

describe("Dock berths", () => {
  it("marks six pads around the Dock, clear of its centre and of each other", () => {
    const dock = createInitialState(7).station.dock.position;
    const pads = dockBerths(dock);
    const width = shipSize(createInitialState(7).ships[0]!.design).width;

    expect(pads).toHaveLength(DOCK_CAPACITY);
    for (const pad of pads) expect(apart(pad, dock)).toBeGreaterThan(width);
    for (let i = 0; i < pads.length; i += 1) {
      for (let j = i + 1; j < pads.length; j += 1) expect(apart(pads[i]!, pads[j]!)).toBeGreaterThan(width);
    }
  });

  it("puts each of six arriving ships on a pad of its own", () => {
    const state = tick(tick(fleetAtDock(6), 0), SETTLED);
    const pads = dockBerths(state.station.dock.position);

    expect(state.ships.map((ship) => ship.state)).toEqual(Array(6).fill("unloading"));
    expect(state.ships.map(at)).toEqual(pads);
  });

  it("parks a seventh ship off the Dock, apart from the pads and the other waiting ships", () => {
    const state = tick(tick(fleetAtDock(9), 0), SETTLED);
    const dock = state.station.dock.position;
    const pads = dockBerths(dock);
    const waiting = state.ships.filter((ship) => ship.state === "waiting");
    const width = shipSize(waiting[0]!.design).width;

    expect(waiting).toHaveLength(3);
    for (const ship of waiting) {
      for (const pad of pads) expect(apart(at(ship), pad)).toBeGreaterThan(width);
      expect(apart(at(ship), dock)).toBeLessThan(150);
    }
    for (let i = 0; i < waiting.length; i += 1) {
      for (let j = i + 1; j < waiting.length; j += 1) expect(apart(at(waiting[i]!), at(waiting[j]!))).toBeGreaterThan(width);
    }
  });

  it("flies a waiting ship onto the pad that frees up", () => {
    const parked = tick(tick(fleetAtDock(7), 0), SETTLED);
    const first = parked.ships.filter((ship) => ship.state === "unloading").sort((a, b) => a.timer - b.timer)[0]!;

    const justFreed = tick(parked, first.timer);
    const flying = justFreed.ships.find((ship) => ship.id === 6)!;
    expect(flying.state).toBe("berthing");
    expect(flying.leg?.to).toEqual(first.position);

    const landed = tick(justFreed, flying.timer);
    expect(landed.ships.find((ship) => ship.id === 6)).toMatchObject({ state: "unloading", position: first.position });
  });

  it("lets a ship leave from its pad instead of jumping to the Dock first", () => {
    const parked = tick(tick(fleetAtDock(1), 0), SETTLED);
    const pads = dockBerths(parked.station.dock.position);
    const left = tick(parked, parked.ships[0]!.timer);

    expect(left.ships[0]).toMatchObject({ state: "outbound", position: pads[0] });
    expect(left.ships[0]!.leg?.from).toEqual(pads[0]);
  });
});
