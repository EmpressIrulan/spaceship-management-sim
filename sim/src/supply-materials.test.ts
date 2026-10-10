import { describe, expect, it } from "vitest";
import { createInitialState, HOME_SECTOR, MATERIALS, newAsteroid, type Material, type SimState } from "./state";
import { tick } from "./tick";
import { giveOrder, setDefaultBehaviour, setMineMaterial } from "./orders";
import { queueModuleBuild } from "./station-build-queue";
import { waitingForOre } from "./ore-wait";

function step(state: SimState): SimState {
  return tick(state, 1 / 30);
}

function until(state: SimState, done: (state: SimState) => boolean, limit = 600): SimState {
  let next = state;
  for (let elapsed = 0; elapsed < limit; elapsed += 1 / 30) {
    if (done(next)) return next;
    next = step(next);
  }
  throw new Error("condition never held");
}

function run(state: SimState, seconds: number): SimState {
  let next = state;
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 30) next = step(next);
  return next;
}

// The game's own ship, switched to Supply with a Storage queued so it has a
// site to supply.
function supplier(): SimState {
  return queueModuleBuild(setDefaultBehaviour(createInitialState(7), [0], "supply"), "Storage", { x: 80, y: 0 });
}

function withOnly(state: SimState, material: Material): SimState {
  return MATERIALS.reduce((next, item) => setMineMaterial(next, [0], item, item === material), state);
}

function rockMaterial(state: SimState): Material | null {
  const target = state.ships[0]!.target;
  return state.asteroids.find((rock) => rock.id === target?.asteroidId)?.material ?? null;
}

const site = (state: SimState) => state.stations[0]!.constructionSite.inventory;

describe("which materials a supply ship mines", () => {
  it("ticks both materials when a ship with nothing ticked is set to Supply", () => {
    expect(supplier().ships[0]!.mineMaterials).toEqual(["Metal", "Ice"]);
  });

  it("keeps the ticks a ship already had when it is set to Supply", () => {
    const ice = setMineMaterial(createInitialState(7), [0], "Ice", true);
    expect(setDefaultBehaviour(ice, [0], "supply").ships[0]!.mineMaterials).toEqual(["Ice"]);
  });

  it("supplies the site from both materials when nobody has touched the ticks", () => {
    const later = run(supplier(), 200);
    expect(site(later).Metal + site(later).Ice).toBeGreaterThan(0);
  });

  for (const material of MATERIALS) {
    const other: Material = material === "Metal" ? "Ice" : "Metal";
    it(`mines only ${material} with only ${material} ticked, and the site gains ${material} only`, () => {
      let state = withOnly(supplier(), material);
      const seen = new Set<Material>();
      let most = 0;
      for (let elapsed = 0; elapsed < 200; elapsed += 1 / 30) {
        state = step(state);
        const rock = rockMaterial(state);
        if (rock) seen.add(rock);
        most = Math.max(most, site(state)[material]);
        expect(site(state)[other]).toBe(0);
      }
      expect([...seen]).toEqual([material]);
      expect(most).toBeGreaterThan(0);
    });
  }

  it("turns to the other ticked material when the one it is flying to is unticked", () => {
    const outbound = until(supplier(), (state) => state.ships[0]!.state === "outbound");
    const heading = rockMaterial(outbound)!;
    const switched = setMineMaterial(outbound, [0], heading, false);
    expect(rockMaterial(switched)).toBe(heading === "Metal" ? "Ice" : "Metal");
  });
});

describe("a supply ship with no ore of its ticked material left", () => {
  const noIce = (state: SimState): SimState => ({
    ...state, asteroids: state.asteroids.filter((rock) => rock.sectorId !== HOME_SECTOR || rock.material !== "Ice"),
  });

  it("holds at the Dock, says it is waiting for Ice, and sets off once Ice respawns", () => {
    const base = withOnly(supplier(), "Ice");
    const waiting = run(noIce(base), 5);
    expect(waiting.ships[0]).toMatchObject({ state: "idle", position: base.stations[0]!.dock.position, target: null });
    expect(waitingForOre(waiting, waiting.ships[0]!)).toEqual(["Ice"]);

    const spot = base.asteroids.find((rock) => rock.sectorId === HOME_SECTOR)!;
    const respawned = { ...waiting, asteroids: [...waiting.asteroids, newAsteroid(9999, HOME_SECTOR, spot.fieldId, spot.position, "Ice", false)] };
    const away = step(respawned);
    expect(away.ships[0]).toMatchObject({ state: "outbound", target: { asteroidId: 9999 } });
    expect(waitingForOre(away, away.ships[0]!)).toEqual([]);
  });

  it("waits for nothing while there is ore of a ticked material", () => {
    const state = run(supplier(), 1);
    expect(waitingForOre(state, state.ships[0]!)).toEqual([]);
  });

  it("is not waiting for ore when nothing is queued at the site", () => {
    const idle = withOnly(setDefaultBehaviour(createInitialState(7), [0], "supply"), "Ice");
    const state = run(noIce(idle), 5);
    expect(waitingForOre(state, state.ships[0]!)).toEqual([]);
  });

  it("reads the same for a miner, so the panel can use one wording", () => {
    const miner = withOnly(createInitialState(7), "Ice");
    const state = run(noIce(miner), 5);
    expect(waitingForOre(state, state.ships[0]!)).toEqual(["Ice"]);
  });
});

describe("a one-off supply order", () => {
  for (const material of MATERIALS) {
    it(`brings only ${material} to the site from a ship with only ${material} ticked, then keeps to the tick`, () => {
      const miner = withOnly(setMineMaterial(createInitialState(7), [0], material, true), material);
      const loaded = until(miner, (state) => state.ships[0]!.state === "homebound" && state.ships[0]!.cargo > 0);
      const ordered = giveOrder(loaded, [0], { kind: "supplyBuild", stationId: 0 });
      const delivered = until(ordered, (state) => state.ships[0]!.order === null);
      expect(site(delivered)[material]).toBe(loaded.ships[0]!.cargo);
      expect(site(delivered)[material === "Metal" ? "Ice" : "Metal"]).toBe(0);
      const next = until(delivered, (state) => state.ships[0]!.target !== null);
      expect(rockMaterial(next)).toBe(material);
    });
  }
});
