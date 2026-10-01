import { describe, expect, it } from "vitest";
import { giveOrder, setMineMaterial, setMineOtherSectors } from "./orders";
import { createInitialState, HOME_SECTOR, MATERIALS, newAsteroid, type Material, type SimState } from "./state";
import { tick } from "./tick";

function runUntil(state: SimState, done: (state: SimState) => boolean, limit = 600): SimState {
  let next = state;
  for (let elapsed = 0; elapsed < limit; elapsed += 1 / 30) {
    if (done(next)) return next;
    next = tick(next, 1 / 30);
  }
  throw new Error("condition never held");
}

function mining(state: SimState, materials: Material[] = [...MATERIALS]): SimState {
  let next = state;
  for (const material of materials) next = setMineMaterial(next, [0], material, true);
  return next;
}

function withRocks(rocks: { id: number; sectorId?: number; x: number; ore: number; material: Material }[]): SimState {
  const base = createInitialState(53);
  const ship = base.ships[0]!;
  return {
    ...base,
    asteroids: rocks.map(({ id, sectorId = HOME_SECTOR, x, ore, material }) => ({
      ...newAsteroid(id, sectorId, base.fields.find((field) => field.sectorId === sectorId)!.id, { x, y: 0 }, material, false),
      ore,
    })),
    respawns: [],
    ships: [{ ...ship, state: "idle", position: { ...base.station.dock.position }, timer: 0, cargo: 0,
      cargoMaterial: null, cargoByMaterial: { Metal: 0, Ice: 0 }, target: null, leg: null }],
  };
}

describe("miners fill the hold before going home", () => {
  it("flies from a depleted rock to allowed rocks until its hold is full, mixing and unloading their materials", () => {
    const start = mining(withRocks([
      { id: 100, x: 100, ore: 6, material: "Metal" },
      { id: 101, x: 140, ore: 8, material: "Ice" },
      { id: 102, x: 180, ore: 20, material: "Metal" },
    ]));
    const initial = { ...start.station.inventory };

    const retargeted = runUntil(start, (state) => state.ships[0]!.target?.asteroidId === 101);
    expect(retargeted.ships[0]).toMatchObject({ state: "outbound", cargo: 6, cargoByMaterial: { Metal: 6, Ice: 0 } });

    const full = runUntil(retargeted, (state) => state.ships[0]!.state === "homebound");
    expect(full.ships[0]).toMatchObject({ cargo: 20, cargoByMaterial: { Metal: 12, Ice: 8 } });

    const unloaded = runUntil(full, (state) => state.ships[0]!.cargo === 0);
    expect(unloaded.station.inventory).toEqual({ Metal: initial.Metal + 12, Ice: initial.Ice + 8 });
  });

  it("goes home part-full when no ticked rock remains in reach", () => {
    const start = mining(withRocks([{ id: 100, x: 100, ore: 6, material: "Metal" }]), ["Metal"]);
    const homebound = runUntil(start, (state) => state.ships[0]!.state === "homebound");
    expect(homebound.ships[0]).toMatchObject({ cargo: 6, cargoByMaterial: { Metal: 6, Ice: 0 } });
  });

  it("keeps other sectors off by default, then takes the nearest reachable ticked rock through a gate when enabled", () => {
    const base = mining(withRocks([
      { id: 100, x: 2_000, ore: 30, material: "Metal" },
      { id: 101, sectorId: 1, x: 0, ore: 30, material: "Metal" },
    ]), ["Metal"]);
    expect(base.ships[0]!.mineOtherSectors).toBe(false);
    const local = runUntil(base, (state) => state.ships[0]!.target !== null);
    expect(local.ships[0]!.target?.asteroidId).toBe(100);

    const reset = { ...base, ships: [{ ...base.ships[0]!, state: "idle" as const, position: { ...base.station.dock.position },
      timer: 0, target: null, leg: null }] };
    const enabled = setMineOtherSectors(reset, [0], true);
    expect(enabled.ships[0]).toMatchObject({ mineOtherSectors: true, state: "outbound", target: { asteroidId: 101, sectorId: 1 } });
    const jumping = runUntil(enabled, (state) => state.ships[0]!.state === "jumpingOut");
    expect(jumping.ships[0]!.position).toEqual(base.sectors[HOME_SECTOR]!.gate.position);
  });

  it("tops up a right-click mine order from other rocks before going home", () => {
    const start = withRocks([
      { id: 100, x: 100, ore: 3, material: "Metal" },
      { id: 101, x: 140, ore: 30, material: "Ice" },
    ]);
    const ordered = giveOrder(start, [0], { kind: "mine", asteroidId: 100 });
    const toppedUp = runUntil(ordered, (state) => state.ships[0]!.state === "homebound");
    expect(toppedUp.ships[0]).toMatchObject({ cargo: 20, cargoByMaterial: { Metal: 3, Ice: 17 }, order: { kind: "mine", loaded: true } });
  });
});
