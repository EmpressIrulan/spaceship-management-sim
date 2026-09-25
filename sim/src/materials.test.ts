import { describe, expect, it } from "vitest";
import { CARGO_PER_TRIP, UNLOADING_SECONDS, WORKING_SECONDS, createInitialState, depart, type SimState } from "./state";
import { tick } from "./tick";

describe("material deliveries", () => {
  it("starts with both materials in seeded positions, without reserving the nearest for either type", () => {
    const nearestTypes = new Set<string>();
    for (let seed = 0; seed < 50; seed += 1) {
      const state = createInitialState(seed);
      expect(state.asteroids).toHaveLength(4);
      expect(new Set(state.asteroids.map((rock) => rock.material))).toEqual(
        new Set(["Metal", "Ice"]),
      );
      const nearest = [...state.asteroids].sort(
        (a, b) =>
          Math.hypot(a.position.x, a.position.y) - Math.hypot(b.position.x, b.position.y),
      )[0]!;
      expect(state.ships[0]!.target?.asteroidId).toBe(nearest.id);
      nearestTypes.add(nearest.material);
    }
    expect(nearestTypes).toEqual(new Set(["Metal", "Ice"]));
    expect(createInitialState(42).asteroids).toEqual(createInitialState(42).asteroids);
  });

  it("takes only the targeted rock's material and unloads into that total, one unit at a time", () => {
    const initial = createInitialState(7);
    const first = initial.asteroids.find((rock) => rock.material === "Metal")!;
    const second = initial.asteroids.find((rock) => rock.material === "Ice")!;
    const rocks = [first, second].map((rock, i) => ({
      ...rock,
      position: { x: 200 + i * 100, y: 0 },
      ore: CARGO_PER_TRIP,
    }));
    const start: SimState = {
      ...initial,
      asteroids: rocks,
      ships: [depart(initial.ships[0]!, initial.station.position, rocks)],
    };
    const atWork = tick(start, start.ships[0]!.timer + 6.1);
    expect(atWork.ships[0]!.cargo).toBe(5);
    expect(atWork.ships[0]!.cargoMaterial).toBe("Metal");
    expect(atWork.asteroids[0]!.ore).toBe(5);

    const firstCycle = 2 * start.ships[0]!.timer + WORKING_SECONDS + UNLOADING_SECONDS;
    const afterMetal = tick(start, firstCycle + 0.1);
    expect(afterMetal.station.inventory).toEqual({ Metal: 10, Ice: 0 });
    expect(afterMetal.ships[0]!.target?.asteroidId).toBe(second.id);
    expect(afterMetal.ships[0]!.cargoMaterial).toBe("Ice");

    const secondCycle = 2 * (afterMetal.ships[0]!.timer + 0.1) + WORKING_SECONDS + UNLOADING_SECONDS;
    const delivered = tick(afterMetal, secondCycle);
    expect(delivered.station.inventory).toEqual({ Metal: 10, Ice: 10 });
    expect(start.station.inventory).toEqual({ Metal: 0, Ice: 0 });
  });

  it("replays replacement positions and types from the seed, while allowing either type", () => {
    const replacementTypes = new Set<string>();
    for (let seed = 0; seed < 30; seed += 1) {
      const a = tick(createInitialState(seed), 600);
      const b = tick(createInitialState(seed), 600);
      const replacements = a.asteroids.filter((rock) => rock.id >= 4);
      expect(replacements.length).toBeGreaterThan(0);
      expect(a.asteroids).toEqual(b.asteroids);
      for (const rock of replacements) replacementTypes.add(rock.material);
    }
    expect(replacementTypes).toEqual(new Set(["Metal", "Ice"]));
  });
});
