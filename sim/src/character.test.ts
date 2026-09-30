import { describe, expect, it } from "vitest";
import { tick } from "./tick";
import {
  ASTEROID_ORE,
  ASTEROID_SIZE,
  HOME_SECTOR,
  RESPAWN_SECONDS,
  createInitialState,
  type Asteroid,
  type Material,
  type SimState,
} from "./state";

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

function rocks(state: SimState, sectorId: number): Asteroid[] {
  return state.asteroids.filter((rock) => rock.sectorId === sectorId);
}

function count(list: Asteroid[], material: Material): number {
  return list.filter((rock) => rock.material === material).length;
}

describe("sector character", () => {
  it("makes every seed's map contain metal-rich, ice-rich, sparse, dense, rich and plain sectors", () => {
    for (const seed of SEEDS) {
      const sectors = createInitialState(seed).sectors;
      const has = (test: (s: SimState["sectors"][number]) => boolean) => sectors.some(test);
      expect(has((s) => s.character.abundant === "Metal"), `seed ${seed} metal`).toBe(true);
      expect(has((s) => s.character.abundant === "Ice"), `seed ${seed} ice`).toBe(true);
      expect(has((s) => s.character.density === "sparse"), `seed ${seed} sparse`).toBe(true);
      expect(has((s) => s.character.density === "dense"), `seed ${seed} dense`).toBe(true);
      expect(has((s) => s.character.richRocks > 0), `seed ${seed} rich`).toBe(true);
      expect(has((s) => s.character.richRocks === 0), `seed ${seed} plain`).toBe(true);
    }
  });

  it("puts most of a sector's rocks in the abundant material, and keeps a little of the other", () => {
    for (const seed of SEEDS) {
      const state = createInitialState(seed);
      for (const sector of state.sectors) {
        const here = rocks(state, sector.id);
        const other: Material = sector.character.abundant === "Metal" ? "Ice" : "Metal";
        expect(count(here, sector.character.abundant), `seed ${seed} sector ${sector.id}`).toBeGreaterThan(count(here, other));
        expect(count(here, other), `seed ${seed} sector ${sector.id} other`).toBeGreaterThan(0);
      }
    }
  });

  it("gives dense sectors more rocks than sparse ones", () => {
    for (const seed of SEEDS) {
      const state = createInitialState(seed);
      const sizes = (density: string) => state.sectors
        .filter((sector) => sector.character.density === density)
        .map((sector) => rocks(state, sector.id).length);
      expect(Math.min(...sizes("dense"))).toBeGreaterThan(Math.max(...sizes("sparse")));
    }
  });

  it("makes exactly the sector's richRocks rocks rich, bigger and holding 4 times the ore", () => {
    for (const seed of SEEDS) {
      const state = createInitialState(seed);
      for (const sector of state.sectors) {
        const rich = rocks(state, sector.id).filter((rock) => rock.rich);
        expect(rich.length, `seed ${seed} sector ${sector.id}`).toBe(sector.character.richRocks);
        for (const rock of rich) {
          expect(rock.ore).toBe(ASTEROID_ORE * 4);
          expect(rock.size.width).toBeGreaterThan(ASTEROID_SIZE.width);
          expect(rock.size.height).toBeGreaterThan(ASTEROID_SIZE.height);
        }
        for (const rock of rocks(state, sector.id).filter((candidate) => !candidate.rich)) {
          expect(rock.ore).toBe(ASTEROID_ORE);
          expect(rock.size).toEqual(ASTEROID_SIZE);
        }
      }
    }
  });

  it("keeps the home sector free of rich rocks so the first mining trips stay predictable", () => {
    for (const seed of SEEDS) {
      expect(rocks(createInitialState(seed), HOME_SECTOR).some((rock) => rock.rich)).toBe(false);
    }
  });

  it("replays the same character from the same seed", () => {
    expect(createInitialState(9).sectors.map((s) => s.character)).toEqual(createInitialState(9).sectors.map((s) => s.character));
  });

  it("brings a mined-out rich rock back as a rich rock in the same field", () => {
    const start = createInitialState(3);
    const sector = start.sectors.find((s) => s.character.richRocks > 0)!;
    const rich = rocks(start, sector.id).find((rock) => rock.rich)!;
    const emptied = {
      ...start,
      asteroids: start.asteroids.filter((rock) => rock.id !== rich.id),
      respawns: [{ sectorId: sector.id, fieldId: rich.fieldId, timer: 1, lastPosition: rich.position, rich: true }],
    };
    const after = tick(emptied, RESPAWN_SECONDS);
    const fresh = after.asteroids.find((rock) => rock.id === start.nextAsteroidId)!;
    expect(fresh.rich).toBe(true);
    expect(fresh.ore).toBe(ASTEROID_ORE * 4);
    expect(fresh.size.width).toBeGreaterThan(ASTEROID_SIZE.width);
    expect(rocks(after, sector.id).filter((rock) => rock.rich)).toHaveLength(sector.character.richRocks);
  });

  it("queues a rich respawn when a rich rock is mined out", () => {
    const start = createInitialState(3);
    const sector = start.sectors.find((s) => s.character.richRocks > 0 && s.id !== HOME_SECTOR)!;
    const rich = rocks(start, sector.id).find((rock) => rock.rich)!;
    const nearly = {
      ...start,
      asteroids: start.asteroids.map((rock) => (rock.id === rich.id ? { ...rock, ore: 10 } : rock)),
      ships: start.ships.map((ship) => ({
        ...ship,
        sectorId: sector.id,
        state: "working" as const,
        timer: 0.1,
        position: { ...rich.position },
        target: { asteroidId: rich.id, sectorId: sector.id, site: { ...rich.position } },
      })),
    };
    const after = tick(nearly, 0.2);
    expect(after.asteroids.some((rock) => rock.id === rich.id)).toBe(false);
    expect(after.respawns.some((respawn) => respawn.rich)).toBe(true);
  });

  it("respawns plain rocks as plain and follows the sector's mix", () => {
    const tally = { Metal: { Metal: 0, Ice: 0 }, Ice: { Metal: 0, Ice: 0 } };
    for (const seed of SEEDS) {
      const start = createInitialState(seed);
      for (const sector of start.sectors.filter((s) => s.id !== HOME_SECTOR)) {
        const field = start.fields.find((f) => f.sectorId === sector.id)!;
        const cleared = {
          ...start,
          asteroids: start.asteroids.filter((rock) => rock.sectorId !== sector.id),
          respawns: Array.from({ length: 4 }, () => ({
            sectorId: sector.id, fieldId: field.id, timer: 1, lastPosition: field.centre, rich: false,
          })),
        };
        const after = tick(cleared, RESPAWN_SECONDS);
        for (const rock of rocks(after, sector.id)) {
          expect(rock.rich).toBe(false);
          expect(rock.ore).toBe(ASTEROID_ORE);
          tally[sector.character.abundant][rock.material] += 1;
        }
      }
    }
    expect(tally.Metal.Metal).toBeGreaterThan(tally.Metal.Ice);
    expect(tally.Ice.Ice).toBeGreaterThan(tally.Ice.Metal);
  });
});
