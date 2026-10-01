import { describe, expect, it } from "vitest";
import { miningStart } from "./test-ships";
import { JUMP_SECONDS, startGateBuild, type SimState } from "./state";
import { tick } from "./tick";
import { giveOrder, formation, resumeDefault, setDefaultBehaviour } from "./orders";

function fleet(count: number): SimState {
  const state = miningStart(7);
  const first = state.ships[0]!;
  return { ...state, ships: Array.from({ length: count }, (_, id) => ({ ...first, id })) };
}

function run(state: SimState, seconds: number): SimState {
  let next = state;
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 30) next = tick(next, Math.min(1 / 30, seconds - elapsed));
  return next;
}

function until(state: SimState, done: (state: SimState) => boolean): SimState {
  let next = state;
  for (let elapsed = 0; elapsed < 180; elapsed += 1 / 30) {
    if (done(next)) return next;
    next = tick(next, 1 / 30);
  }
  throw new Error("condition never held");
}

function materialTotal(state: SimState, material: "Metal" | "Ice"): number {
  return state.station.inventory[material]
    + state.ships.filter((ship) => ship.cargoMaterial === material).reduce((sum, ship) => sum + ship.cargo, 0)
    + state.gateProjects.reduce((sum, project) => sum + project.delivered[material], 0);
}

function farSector(state: SimState, changes: Partial<SimState["ships"][number]> = {}): SimState {
  const ship = state.ships[0]!;
  return {
    ...state,
    ships: [{ ...ship, sectorId: 1, state: "holding", position: { ...state.sectors[1]!.gate.position }, timer: 0,
      target: null, leg: null, order: null, ...changes }],
  };
}

describe("RTS ship orders", () => {
  it("loads Storage ships over time and loops deliveries to a gate project", () => {
    let start = startGateBuild(miningStart(7), 0, { x: 80, y: 0 }, 3, { x: -80, y: 0 });
    start = { ...start, station: { ...start.station, inventory: { Metal: 200, Ice: 200 } },
      ships: [{ ...start.ships[0]!, state: "holding", position: { ...start.station.dock.position }, timer: 0, leg: null, target: null }] };
    const ordered = giveOrder(start, [0], { kind: "haulGate", gateId: 0 });
    expect(ordered.ships[0]).toMatchObject({ state: "berthing", cargoMaterial: "Metal", cargo: 0 });
    expect(ordered.station.inventory.Metal).toBe(200);
    const loading = until(ordered, (state) => state.ships[0]!.state === "loading");
    const halfLoaded = run(loading, 6);
    expect(halfLoaded.ships[0]).toMatchObject({ state: "loading", cargoMaterial: "Metal", cargo: 10 });
    expect(halfLoaded.station.inventory.Metal).toBe(190);
    const delivered = until(ordered, (state) => state.gateProjects[0]!.delivered.Metal > 0);
    expect(delivered.gateProjects[0]!.delivered.Metal).toBe(1);
    expect(delivered.ships[0]!.order).toEqual({ kind: "haulGate", gateId: 0 });
  });

  it("shares the Dock's six berths between loading haulers and unloading miners", () => {
    let start = startGateBuild(fleet(7), 0, { x: 80, y: 0 }, 3, { x: -80, y: 0 });
    const dock = start.station.dock.position;
    start = { ...start, station: { ...start.station, inventory: { Metal: 200, Ice: 200 },
      storage: { ...start.station.storage, capacity: 1000 } }, ships: start.ships.map((ship, id) => id < 5
      ? { ...ship, state: "homebound" as const, position: { ...dock }, timer: 0, cargo: 20, cargoMaterial: "Metal" as const, target: null, leg: null }
      : { ...ship, state: "holding" as const, position: { ...dock }, timer: 0, cargo: 0, cargoMaterial: null, target: null, leg: null }) };
    const minersDocking = tick(start, 0);
    const ordered = giveOrder(minersDocking, [5, 6], { kind: "haulGate", gateId: 0 });

    expect(ordered.ships.filter((ship) => ship.state === "berthing" && ship.berth !== null)).toHaveLength(6);
    expect(ordered.ships[6]).toMatchObject({ state: "berthing", berth: null, cargo: 0, order: { kind: "haulGate" } });
    const parked = until(ordered, (state) => state.ships[6]!.state === "waiting");
    expect(parked.ships[6]).toMatchObject({ state: "waiting", berth: null, cargo: 0, order: { kind: "haulGate" } });
  });

  it("unloads at a gate over time and lets every arriving ship unload together", () => {
    let start = startGateBuild(fleet(7), 0, { x: 80, y: 0 }, 3, { x: -80, y: 0 });
    start = { ...start, gateProjects: [{ ...start.gateProjects[0]!, delivered: { Metal: 100, Ice: 200 } }],
      ships: start.ships.map((ship) => ({ ...ship, state: "gateHauling" as const, position: { x: 80, y: 0 }, timer: 0,
        cargo: 10, cargoMaterial: "Metal" as const, target: null, leg: { from: start.station.dock.position, to: { x: 80, y: 0 } },
        order: { kind: "haulGate" as const, gateId: 0 } })) };

    const unloading = tick(start, 0);
    expect(unloading.ships.every((ship) => ship.state === "gateUnloading")).toBe(true);
    expect(unloading.gateProjects[0]!.delivered.Metal).toBe(100);
    const halfway = run(unloading, 3);
    expect(halfway.gateProjects[0]!.delivered.Metal).toBe(135);
    expect(halfway.ships.every((ship) => ship.cargo === 5)).toBe(true);
  });

  it("leaves with the cargo aboard when a new order interrupts loading or gate unloading", () => {
    let start = startGateBuild(miningStart(7), 0, { x: 80, y: 0 }, 3, { x: -80, y: 0 });
    start = { ...start, station: { ...start.station, inventory: { Metal: 200, Ice: 200 } },
      ships: [{ ...start.ships[0]!, state: "holding", position: { ...start.station.dock.position }, timer: 0, leg: null, target: null }] };
    const loading = until(giveOrder(start, [0], { kind: "haulGate", gateId: 0 }), (state) => state.ships[0]!.state === "loading");
    const halfLoaded = run(loading, 6);
    const diverted = giveOrder(halfLoaded, [0], { kind: "move", point: { x: 40, y: 30 } });
    expect(diverted.ships[0]).toMatchObject({ state: "moving", cargo: 10, cargoMaterial: "Metal" });
    expect(materialTotal(diverted, "Metal")).toBe(materialTotal(start, "Metal"));

    const atGate = { ...halfLoaded, gateProjects: [{ ...halfLoaded.gateProjects[0]!, delivered: { Metal: 0, Ice: 0 } }],
      ships: [{ ...halfLoaded.ships[0]!, state: "gateHauling" as const, position: { x: 80, y: 0 }, timer: 0,
        leg: { from: halfLoaded.station.dock.position, to: { x: 80, y: 0 } } }] };
    const halfUnloaded = run(tick(atGate, 0), 3);
    const recalled = giveOrder(halfUnloaded, [0], { kind: "move", point: { x: 20, y: 10 } });
    expect(recalled.ships[0]).toMatchObject({ state: "moving", cargo: 5, cargoMaterial: "Metal" });
    expect(recalled.gateProjects[0]!.delivered.Metal).toBe(5);
    expect(materialTotal(recalled, "Metal")).toBe(materialTotal(atGate, "Metal"));
  });

  it("unloads existing cargo before beginning a haul order without losing material", () => {
    let start = startGateBuild(miningStart(7), 0, { x: 80, y: 0 }, 3, { x: -80, y: 0 });
    start = { ...start, station: { ...start.station, inventory: { Metal: 60, Ice: 40 } },
      ships: [{ ...start.ships[0]!, state: "homebound", cargo: 20, cargoMaterial: "Metal",
      position: { x: 120, y: 0 }, timer: 2, leg: { from: { x: 200, y: 0 }, to: start.station.dock.position }, target: null }] };
    const before = materialTotal(start, "Metal");
    const ordered = giveOrder(start, [0], { kind: "haulGate", gateId: 0 });
    expect(ordered.ships[0]).toMatchObject({ state: "gateReturning", cargo: 20, cargoMaterial: "Metal" });
    const unloaded = until(ordered, (state) => state.gateProjects[0]!.delivered.Metal > 0);
    expect(materialTotal(unloaded, "Metal")).toBe(before);
  });

  it("reserves in-flight loads and returns cargo left when another hauler completes the gate", () => {
    let start = startGateBuild(miningStart(7), 0, { x: 1, y: 0 }, 3, { x: -1, y: 0 });
    const base = start.ships[0]!;
    start = { ...start,
      gateProjects: [{ ...start.gateProjects[0]!, delivered: { Metal: 180, Ice: 200 } }],
      station: { ...start.station, inventory: { Metal: 0, Ice: 0 } },
      ships: [0, 1].map((id) => ({ ...base, id, state: "gateHauling" as const, position: { x: 1, y: 0 }, timer: 0,
        cargo: 20, cargoMaterial: "Metal" as const, target: null, leg: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
        order: { kind: "haulGate" as const, gateId: 0 } })) };
    const before = materialTotal(start, "Metal");
    const completed = until(tick(start, 0), (state) => state.gateProjects[0]!.complete
      && state.ships.every((ship) => ship.state !== "gateUnloading"));
    expect(completed.gateProjects[0]).toMatchObject({ delivered: { Metal: 200 }, complete: true });
    expect(completed.ships.filter((ship) => ship.state === "gateReturning")
      .reduce((sum, ship) => sum + ship.cargo, 0)).toBe(20);
    const returned = until(completed, (state) => state.station.inventory.Metal === 20);
    expect(materialTotal(returned, "Metal")).toBe(before);
  });

  it("does not load more than the gate needs across simultaneous haulers", () => {
    let start = startGateBuild(miningStart(7), 0, { x: 1, y: 0 }, 3, { x: -1, y: 0 });
    const base = start.ships[0]!;
    start = { ...start,
      gateProjects: [{ ...start.gateProjects[0]!, delivered: { Metal: 180, Ice: 200 } }],
      station: { ...start.station, inventory: { Metal: 40, Ice: 0 } },
      asteroids: [],
      ships: [0, 1].map((id) => ({ ...base, id, state: "holding" as const, position: { ...start.station.dock.position },
        cargo: 0, cargoMaterial: null, target: null, timer: 0, leg: null, order: { kind: "haulGate" as const, gateId: 0 } })) };
    const loaded = until(tick(start, 0), (state) => state.ships.some((ship) => ship.state === "gateHauling"));
    expect(loaded.ships.filter((ship) => ship.state === "gateHauling").map((ship) => ship.cargo)).toEqual([20]);
    expect(loaded.station.inventory.Metal).toBe(20);
    expect(materialTotal(loaded, "Metal")).toBe(materialTotal(start, "Metal"));
  });

  it("activates a paid gate and moves a ship through its player-placed ends", () => {
    let start = startGateBuild(miningStart(7), 0, { x: 1, y: 2 }, 3, { x: 30, y: 40 });
    start = { ...start,
      gateProjects: [{ ...start.gateProjects[0]!, delivered: { Metal: 200, Ice: 180 } }],
      station: { ...start.station, inventory: { Metal: 0, Ice: 20 } },
      ships: [{ ...start.ships[0]!, state: "holding", position: { ...start.station.dock.position }, timer: 0, leg: null, target: null }] };
    const hauling = giveOrder(start, [0], { kind: "haulGate", gateId: 0 });
    const active = until(hauling, (state) => state.gateProjects[0]!.complete);
    expect(active.gateProjects[0]!.delivered).toEqual({ Metal: 200, Ice: 200 });
    const ordered = giveOrder(active, [0], { kind: "move", point: { x: 60, y: 70 }, sectorId: 3 });
    expect(ordered.ships[0]!.leg?.to).toEqual({ x: 1, y: 2 });
    const arrived = until(ordered, (state) => state.ships[0]!.sectorId === 3);
    expect(arrived.ships[0]!.position).toEqual({ x: 30, y: 40 });
    const homeward = giveOrder({ ...arrived, ships: [{ ...arrived.ships[0]!, state: "holding", timer: 0, leg: null }] }, [0], { kind: "home" });
    expect(homeward.ships[0]!.leg?.to).toEqual({ x: 30, y: 40 });
    const home = until(homeward, (state) => state.ships[0]!.sectorId === 0);
    expect(home.ships[0]!.position).toEqual({ x: 1, y: 2 });
  });
  it("starts new ships on Mine for Station", () => {
    expect(fleet(1).ships[0]!.defaultBehaviour).toBe("mine");
  });

  it("gives each ship a distinct nearby formation position", () => {
    const points = formation({ x: 50, y: -25 }, 5);
    expect(new Set(points.map((p) => `${p.x},${p.y}`)).size).toBe(5);
    expect(points.every((p) => Math.hypot(p.x - 50, p.y + 25) < 100)).toBe(true);
  });

  it("flies selected ships to a point, preserves cargo, and holds until resumed", () => {
    const start = fleet(2);
    const ordered = giveOrder(start, [start.ships[1]!.id], { kind: "move", point: { x: 0, y: -100 } });
    expect(ordered.ships[0]!.order).toBeNull();
    expect(ordered.ships[1]!.state).toBe("moving");
    const arrived = until(ordered, (s) => s.ships[1]!.state === "holding");
    expect(arrived.ships[1]!.position.y).toBeLessThan(0);
    expect(resumeDefault(arrived, [arrived.ships[1]!.id]).ships[1]!.state).not.toBe("holding");
  });

  it("keeps cargo aboard when a move order interrupts the current trip", () => {
    const state = fleet(1);
    const loaded = { ...state, ships: [{ ...state.ships[0]!, cargo: 7, cargoMaterial: "Metal" as const }] };
    const ordered = giveOrder(loaded, [0], { kind: "move", point: { x: 40, y: 30 } });
    expect(ordered.ships[0]).toMatchObject({ cargo: 7, cargoMaterial: "Metal", order: { kind: "move", sectorId: 0 } });
  });

  it("mines one selected rock load and returns to the default", () => {
    const start = fleet(1);
    const rock = start.asteroids[1]!;
    const ordered = giveOrder(start, [start.ships[0]!.id], { kind: "mine", asteroidId: rock.id });
    const home = until(ordered, (s) => s.ships[0]!.order === null);
    expect(home.station.inventory[rock.material]).toBeGreaterThan(0);
    expect(home.ships[0]!.defaultBehaviour).toBe("mine");
  });

  it("sends a ship home to unload, then resumes its default", () => {
    const start = fleet(1);
    const ordered = giveOrder(start, [0], { kind: "home" });
    expect(ordered.ships[0]!.state).toBe("homebound");
    expect(until(ordered, (s) => s.ships[0]!.order === null && s.ships[0]!.state === "outbound").ships[0]!.defaultBehaviour)
      .toBe("mine");
  });

  it("keeps a same-material partial load while mining the selected rock", () => {
    const start = fleet(1);
    const rock = start.asteroids[0]!;
    const loaded = { ...start, ships: [{ ...start.ships[0]!, cargo: 5, cargoMaterial: rock.material }] };
    const ordered = giveOrder(loaded, [0], { kind: "mine", asteroidId: rock.id });
    const working = until(ordered, (s) => s.ships[0]!.state === "working");
    expect(working.ships[0]!.cargo).toBe(5);
    const homebound = until(working, (s) => s.ships[0]!.state === "homebound");
    expect(homebound.ships[0]!.cargo).toBe(20);
  });

  it("holds after an order when the default is None", () => {
    const start = setDefaultBehaviour(fleet(1), [0], "none");
    const ordered = giveOrder(start, [0], { kind: "move", point: { x: 20, y: 20 } });
    expect(until(ordered, (s) => s.ships[0]!.state === "holding").ships[0]!.order).toEqual({
      kind: "move", point: { x: 20, y: 20 }, sectorId: 0,
    });
  });

  it("keeps a Default: None ship idle when ore respawns", () => {
    const start = setDefaultBehaviour(fleet(1), [0], "none");
    const empty = { ...start, asteroids: start.asteroids.map((rock) => ({ ...rock, ore: 0 })) };
    const idle = tick({ ...empty, ships: [{ ...empty.ships[0]!, state: "idle", position: empty.station.dock.position,
      timer: 0, target: null, leg: null }] }, 1 / 30);
    expect(idle.ships[0]!.state).toBe("idle");

    const restored = { ...idle, asteroids: start.asteroids };
    const stayed = tick(restored, 1 / 30);
    expect(stayed.ships[0]).toMatchObject({ state: "idle", defaultBehaviour: "none", target: null });

    const ordered = giveOrder(stayed, [0], { kind: "move", point: { x: 20, y: 20 } });
    expect(ordered.ships[0]!.state).toBe("moving");
  });

  it("routes a home order from sector 1 to that sector's gate before jumping", () => {
    const start = farSector(fleet(1));
    const ordered = giveOrder(start, [0], { kind: "home" });

    expect(ordered.ships[0]).toMatchObject({
      sectorId: 1,
      state: "homebound",
      leg: { to: start.sectors[1]!.gate.position },
      order: { kind: "home" },
    });
    expect(run(ordered, 1 / 30).ships[0]).toMatchObject({ state: "jumpingHome", position: start.sectors[1]!.gate.position });
    expect(run(ordered, 1 / 30).ships[0]!.timer).toBeLessThan(JUMP_SECONDS);
  });

  it("routes a resume with cargo from sector 1 through its gate", () => {
    const start = farSector(fleet(1), {
      cargo: 3,
      cargoMaterial: "Metal",
      order: { kind: "home" },
    });
    const resumed = resumeDefault(start, [0]);

    expect(resumed.ships[0]).toMatchObject({
      sectorId: 1,
      state: "homebound",
      leg: { to: start.sectors[1]!.gate.position },
      cargo: 3,
      order: null,
    });
    expect(run(resumed, 1 / 30).ships[0]).toMatchObject({ state: "jumpingHome", position: start.sectors[1]!.gate.position, cargo: 3 });
    expect(run(resumed, 1 / 30).ships[0]!.timer).toBeLessThan(JUMP_SECONDS);
  });

  it("routes a loaded ship to the far-sector gate before unloading for a different-material mine order", () => {
    const initial = fleet(1);
    const rock = initial.asteroids.find((candidate) => candidate.sectorId === 1)!;
    const loaded = farSector(initial, {
      cargo: 3,
      cargoMaterial: rock.material === "Metal" ? "Ice" : "Metal",
    });
    const ordered = giveOrder(loaded, [0], { kind: "mine", asteroidId: rock.id });

    expect(ordered.ships[0]).toMatchObject({
      sectorId: 1,
      state: "homebound",
      leg: { to: loaded.sectors[1]!.gate.position },
      cargo: 3,
      order: { kind: "mine", asteroidId: rock.id, loaded: false },
    });
    expect(run(ordered, 1 / 30).ships[0]).toMatchObject({ state: "jumpingHome", position: loaded.sectors[1]!.gate.position, cargo: 3 });
    expect(run(ordered, 1 / 30).ships[0]!.timer).toBeLessThan(JUMP_SECONDS);
  });

  it("moves from sector 1 through its gate before moving to a point in sector 0", () => {
    const start = farSector(fleet(1));
    const point = { x: 123, y: -45 };
    const ordered = giveOrder(start, [0], { kind: "move", point, sectorId: 0 });

    expect(ordered.ships[0]).toMatchObject({
      sectorId: 1,
      state: "moving",
      leg: { to: start.sectors[1]!.gate.position },
      order: { kind: "move", point, sectorId: 0 },
    });
    const atGate = until(ordered, (s) => s.ships[0]!.state === "jumpingOut");
    expect(atGate.ships[0]!.position).toEqual(start.sectors[1]!.gate.position);
    const arrived = run(atGate, JUMP_SECONDS + 0.1);
    expect(arrived.ships[0]).toMatchObject({
      sectorId: 0,
      state: "moving",
      leg: { to: point },
      order: { kind: "move", point, sectorId: 0 },
    });
  });
});
