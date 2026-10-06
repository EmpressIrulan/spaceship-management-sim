import { describe, expect, it } from "vitest";
import { createInitialState, HOME_SECTOR, MATERIALS, newAsteroid, type Material, type SimState } from "./state";
import { tick } from "./tick";
import { setDefaultBehaviour, setMineMaterial } from "./orders";

function run(state: SimState, seconds: number): SimState {
  let next = state;
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 30) next = tick(next, Math.min(1 / 30, seconds - elapsed));
  return next;
}

function until(state: SimState, done: (state: SimState) => boolean): SimState {
  let next = state;
  for (let elapsed = 0; elapsed < 300; elapsed += 1 / 30) {
    if (done(next)) return next;
    next = tick(next, 1 / 30);
  }
  throw new Error("condition never held");
}

function home(state: SimState): SimState["asteroids"] {
  return state.asteroids.filter((rock) => rock.sectorId === HOME_SECTOR);
}

function withOnly(state: SimState, material: Material): SimState {
  return MATERIALS.reduce((next, item) => setMineMaterial(next, [0], item, item === material), state);
}

describe("which materials a miner mines", () => {
  it("starts the game's ship with nothing ticked, sitting idle at the Dock", () => {
    const start = createInitialState(7);
    expect(start.ships[0]!.mineMaterials).toEqual([]);
    const later = run(start, 5);
    expect(later.ships[0]).toMatchObject({ state: "idle", position: start.stations[0]!.dock.position, target: null });
  });

  it("gives a newly built ship nothing ticked", () => {
    const start = createInitialState(7);
    const built = { ...start, stations: [{ ...start.stations[0]!, shipBuilds: [{ builder: 0, design: start.ships[0]!.design, timer: 0 }] }] };
    const next = tick(built, 1 / 30);
    expect(next.ships.map((ship) => ship.mineMaterials)).toEqual([[], []]);
  });

  it("ticks and unticks a material in the order of MATERIALS, for every ship named", () => {
    const start = createInitialState(7);
    const two = { ...start, ships: [start.ships[0]!, { ...start.ships[0]!, id: 1 }] };
    const ice = setMineMaterial(two, [0, 1], "Ice", true);
    const both = setMineMaterial(ice, [0], "Metal", true);
    expect(both.ships.map((ship) => ship.mineMaterials)).toEqual([["Metal", "Ice"], ["Ice"]]);
    expect(setMineMaterial(both, [0], "Metal", false).ships[0]!.mineMaterials).toEqual(["Ice"]);
  });

  it("mines only the ticked material, so Ice reaches storage and no Metal does", () => {
    const start = withOnly(createInitialState(7), "Ice");
    const seen = new Set<Material | null>();
    let state = start;
    for (let elapsed = 0; elapsed < 120; elapsed += 1 / 30) {
      state = tick(state, 1 / 30);
      const target = state.ships[0]!.target;
      // A mined-out rock is gone from the list, so only rocks still there count.
      const rock = target && state.asteroids.find((item) => item.id === target.asteroidId);
      if (rock) seen.add(rock.material);
    }
    expect([...seen]).toEqual(["Ice"]);
    expect(state.stations[0]!.inventory.Ice).toBeGreaterThan(0);
    expect(state.stations[0]!.inventory.Metal).toBe(start.stations[0]!.inventory.Metal);
  });

  it("skips a nearer rock of an unticked material", () => {
    const base = createInitialState(7);
    const dock = base.stations[0]!.dock.position;
    const nearest = [...home(base)].sort((a, b) => Math.hypot(a.position.x - dock.x, a.position.y - dock.y)
      - Math.hypot(b.position.x - dock.x, b.position.y - dock.y))[0]!;
    const other: Material = nearest.material === "Metal" ? "Ice" : "Metal";
    const state = until(withOnly(base, other), (s) => s.ships[0]!.target !== null);
    const target = state.asteroids.find((rock) => rock.id === state.ships[0]!.target!.asteroidId)!;
    expect(target.material).toBe(other);
  });

  it("waits at the Dock when no rock of a ticked material is left, and sets off when one respawns", () => {
    const base = withOnly(createInitialState(7), "Ice");
    const noIce = { ...base, asteroids: base.asteroids.filter((rock) => rock.sectorId !== HOME_SECTOR || rock.material !== "Ice") };
    const waiting = run(noIce, 5);
    expect(waiting.ships[0]).toMatchObject({ state: "idle", position: base.stations[0]!.dock.position, target: null });

    const site = home(base)[0]!.position;
    const respawned = { ...waiting, asteroids: [...waiting.asteroids, newAsteroid(9999, HOME_SECTOR, home(base)[0]!.fieldId, site, "Ice", false)] };
    const away = run(respawned, 1 / 30);
    expect(away.ships[0]).toMatchObject({ state: "outbound", target: { asteroidId: 9999 } });
  });

  it("sends the ship back to the Dock and idle when everything is unticked mid-trip", () => {
    const working = until(withOnly(createInitialState(7), "Ice"), (s) => s.ships[0]!.state === "working");
    const unticked = setMineMaterial(working, [0], "Ice", false);
    const idle = until(unticked, (s) => s.ships[0]!.state === "idle");
    expect(idle.ships[0]).toMatchObject({ position: working.stations[0]!.dock.position, target: null });
    expect(run(idle, 10).ships[0]!.state).toBe("idle");
  });

  it("carries a hold already aboard home before going idle", () => {
    const homebound = until(withOnly(createInitialState(7), "Ice"), (s) => s.ships[0]!.state === "homebound");
    const unticked = setMineMaterial(homebound, [0], "Ice", false);
    const idle = until(unticked, (s) => s.ships[0]!.state === "idle");
    expect(idle.stations[0]!.inventory.Ice).toBeGreaterThan(0);
  });

  it("redirects a ship already flying to a rock whose material has just been unticked", () => {
    const both = MATERIALS.reduce((next, item) => setMineMaterial(next, [0], item, true), createInitialState(7));
    const outbound = until(both, (s) => s.ships[0]!.state === "outbound");
    const heading = outbound.asteroids.find((rock) => rock.id === outbound.ships[0]!.target!.asteroidId)!;
    const kept: Material = heading.material === "Metal" ? "Ice" : "Metal";
    const switched = setMineMaterial(outbound, [0], heading.material, false);
    const target = switched.asteroids.find((rock) => rock.id === switched.ships[0]!.target!.asteroidId)!;
    expect(target.material).toBe(kept);
  });

  it("keeps the ticks when the default is switched to None and back", () => {
    const start = withOnly(createInitialState(7), "Ice");
    const back = setDefaultBehaviour(setDefaultBehaviour(start, [0], "none"), [0], "mine");
    expect(back.ships[0]!.mineMaterials).toEqual(["Ice"]);
  });
});
