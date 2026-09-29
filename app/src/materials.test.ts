import { describe, expect, it } from "vitest";
import { createInitialState, tick } from "sim";
import { asteroidColor } from "./asteroid";
import { infoBox } from "./labels";

describe("material display", () => {
  it("draws brown Metal and pale blue Ice rocks", () => {
    expect(asteroidColor("Metal")).toBe("#a16207");
    expect(asteroidColor("Ice")).toBe("#bae6fd");
  });

  it("shows the material and live remaining amount on each rock", () => {
    const start = createInitialState(7);
    const rock = start.asteroids.find((a) => a.id === start.ships[0]!.target!.asteroidId)!;
    const hovered = { kind: "asteroid" as const, id: rock.id };
    expect(infoBox(start, hovered)).toEqual({ title: "Asteroid", line: `${rock.material}: 30` });
    const mined = tick(start, start.ships[0]!.timer + 6.1);
    expect(infoBox(mined, hovered)?.line).toBe(`${rock.material}: 25`);
  });

  it("shows initial and changed material totals on separate lines", () => {
    const state = createInitialState(7);
    const hovered = { kind: "storage" as const };
    expect(infoBox(state, hovered)).toEqual({
      title: "Storage",
      line: "Stored 40 / 100\nMetal: 20\nIce: 20",
    });
    const one = { ...state, station: { ...state.station, inventory: { Metal: 10, Ice: 0 } } };
    expect(infoBox(one, hovered)).toEqual({ title: "Storage", line: "Stored 10 / 100\nMetal: 10" });
    const both = { ...state, station: { ...state.station, inventory: { Metal: 10, Ice: 10 } } };
    expect(infoBox(both, hovered)).toEqual({
      title: "Storage",
      line: "Stored 20 / 100\nMetal: 10\nIce: 10",
    });
  });
});
