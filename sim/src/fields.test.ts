import { describe, expect, it } from "vitest";
import { oneStorageStart } from "./test-ships";
import { tick } from "./tick";
import {
  ASTEROID_MIN_SPACING,
  RESPAWN_SECONDS,
  createInitialState,
  nearestWithOre,
  type Asteroid,
  type AsteroidField,
  type SimState,
  type Vec,
} from "./state";

function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Whether a rock sits where its belt (an arc of a circle) or cluster (a disc)
// is. A rock outside its own field was put there by something else.
function inside(field: AsteroidField, position: Vec): boolean {
  const d = distance(field.centre, position);
  if (field.kind === "cluster") return d <= field.radius + 1e-6;
  if (Math.abs(d - field.radius) > field.width / 2 + 1e-6) return false;
  const turn = Math.atan2(position.y - field.centre.y, position.x - field.centre.x) - field.from;
  const along = ((turn % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return along <= field.sweep + 1e-6;
}

function fieldOf(state: SimState, rock: Asteroid): AsteroidField {
  const field = state.fields.find((candidate) => candidate.id === rock.fieldId);
  if (!field) throw new Error(`rock ${rock.id} names no field (${rock.fieldId})`);
  return field;
}

function homeRocks(state: SimState): Asteroid[] {
  return state.asteroids.filter((rock) => rock.sectorId === 0);
}

describe("asteroid belts and clusters", () => {
  it("gives every sector at least one belt and one cluster, each holding rocks", () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const state = createInitialState(seed);
      for (const sector of state.sectors) {
        const fields = state.fields.filter((field) => field.sectorId === sector.id);
        expect(fields.filter((field) => field.kind === "belt").length).toBeGreaterThanOrEqual(1);
        expect(fields.filter((field) => field.kind === "cluster").length).toBeGreaterThanOrEqual(1);
        for (const field of fields) {
          expect(state.asteroids.filter((rock) => rock.fieldId === field.id).length).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("places every starting rock inside the belt or cluster it belongs to", () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const state = createInitialState(seed);
      for (const rock of state.asteroids) {
        const field = fieldOf(state, rock);
        expect(field.sectorId).toBe(rock.sectorId);
        expect(inside(field, rock.position)).toBe(true);
      }
    }
  });

  it("puts a sector's fields at points of their own, apart from each other and from the gate", () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const state = createInitialState(seed);
      for (const sector of state.sectors) {
        const fields = state.fields.filter((field) => field.sectorId === sector.id);
        fields.forEach((field, index) => {
          expect(distance(field.centre, sector.gate.position)).toBeGreaterThanOrEqual(100);
          for (const other of fields.slice(index + 1)) {
            expect(distance(field.centre, other.centre)).toBeGreaterThanOrEqual(150);
          }
        });
      }
      const homeCentres = state.fields.filter((field) => field.sectorId === 0).map((field) => field.centre);
      const farCentres = state.fields.filter((field) => field.sectorId === 1).map((field) => field.centre);
      expect(homeCentres).not.toEqual(farCentres);
    }
  });

  it("does not ring the station with rocks or start any on top of it", () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const state = createInitialState(seed);
      for (const rock of homeRocks(state)) {
        for (const module of state.station.modules) {
          expect(distance(rock.position, module.position)).toBeGreaterThanOrEqual(ASTEROID_MIN_SPACING);
        }
      }
      // A ring would put every rock about the same distance out. Fields put
      // them wherever the fields are, so the spread is wide.
      const spread = homeRocks(state).map((rock) => distance(rock.position, state.station.dock.position));
      expect(Math.max(...spread) - Math.min(...spread)).toBeGreaterThan(100);
    }
  });

  it("makes the same fields for the same seed and different ones for another", () => {
    const shape = (state: SimState) => state.fields.map((field) => ({ ...field }));
    expect(shape(createInitialState(9))).toEqual(shape(createInitialState(9)));
    expect(shape(createInitialState(9))).not.toEqual(shape(createInitialState(10)));
  });

  it("respawns a mined-out rock in the belt or cluster it came from", () => {
    const base = oneStorageStart(7);
    const first = base.asteroids.find((rock) => rock.id === base.ships[0]!.target!.asteroidId)!;
    // One unit left, so the first load empties it.
    let state: SimState = { ...base, asteroids: base.asteroids.map((rock) => (rock.id === first.id ? { ...rock, ore: 1 } : rock)) };
    for (let elapsed = 0; state.asteroids.some((rock) => rock.id === first.id); elapsed += 0.1) {
      if (elapsed > 300) throw new Error("the rock was never mined out");
      state = tick(state, 0.1);
    }
    expect(state.respawns).toHaveLength(1);
    expect(state.respawns[0]!.fieldId).toBe(first.fieldId);

    const known = new Set(state.asteroids.map((rock) => rock.id));
    state = tick(state, RESPAWN_SECONDS + 0.1);
    const fresh = state.asteroids.filter((rock) => !known.has(rock.id));
    expect(fresh).toHaveLength(1);
    expect(fresh[0]!.fieldId).toBe(first.fieldId);
    expect(inside(fieldOf(state, fresh[0]!), fresh[0]!.position)).toBe(true);
    expect(fresh[0]!.position).not.toEqual(first.position);
  });

  it("keeps every rock in its field through many respawns", () => {
    let state = oneStorageStart(42);
    const initial = state.asteroids.length;
    for (let elapsed = 0; elapsed < 900; elapsed += 0.1) state = tick(state, 0.1);
    expect(Math.max(...state.asteroids.map((rock) => rock.id))).toBeGreaterThanOrEqual(initial + 1);
    expect(state.asteroids).toHaveLength(initial);
    for (const rock of state.asteroids) expect(inside(fieldOf(state, rock), rock.position)).toBe(true);
  });

  it("still sends a ship to the nearest rock with ore, wherever the fields are", () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const state = oneStorageStart(seed);
      const dock = state.station.dock.position;
      const expected = nearestWithOre(dock, homeRocks(state))!;
      expect(state.ships[0]!.target!.asteroidId).toBe(expected.id);
      for (const rock of homeRocks(state)) {
        expect(distance(dock, expected.position)).toBeLessThanOrEqual(distance(dock, rock.position));
      }
    }
  });
});
