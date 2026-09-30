import { describe, expect, it } from "vitest";
import { createInitialState, type SimState } from "sim";
import { asteroidColor } from "./asteroid";
import { infoBox, sectorBox } from "./labels";
import { mapHit, mapLayout } from "./sectors";

const viewport = { width: 1000, height: 640 };

function withCharacter(state: SimState, id: number, character: SimState["sectors"][number]["character"]): SimState {
  return { ...state, sectors: state.sectors.map((sector) => (sector.id === id ? { ...sector, character } : sector)) };
}

describe("sector character on the map", () => {
  it("reads 'Metal-rich · dense · Rich rocks: 3' for a dense metal sector with three rich rocks", () => {
    const start = createInitialState(5);
    const state = withCharacter(start, 1, { abundant: "Metal", density: "dense", richRocks: 3 });
    const rich = state.asteroids.map((rock) => (rock.sectorId === 1 ? { ...rock, rich: false } : rock));
    let marked = 0;
    const three = rich.map((rock) => (rock.sectorId === 1 && marked++ < 3 ? { ...rock, rich: true } : rock));
    expect(sectorBox({ ...state, asteroids: three }, 1)).toEqual({
      title: state.sectors[1]!.name,
      line: "Metal-rich · dense · Rich rocks: 3",
    });
  });

  it("counts the rich rocks that are there now, and leaves the count out when there are none", () => {
    const start = createInitialState(5);
    const sector = start.sectors.find((s) => s.character.richRocks > 0)!;
    const live = start.asteroids.filter((rock) => rock.sectorId === sector.id && rock.rich).length;
    expect(sectorBox(start, sector.id)?.line).toContain(`Rich rocks: ${live}`);
    const mined = { ...start, asteroids: start.asteroids.filter((rock) => !(rock.sectorId === sector.id && rock.rich)) };
    expect(sectorBox(mined, sector.id)?.line).not.toContain("Rich rocks");
  });

  it("describes the ice-rich sparse sector without a rich-rock clause", () => {
    const state = withCharacter(createInitialState(5), 2, { abundant: "Ice", density: "sparse", richRocks: 0 });
    const plain = { ...state, asteroids: state.asteroids.map((rock) => ({ ...rock, rich: false })) };
    expect(sectorBox(plain, 2)?.line).toBe("Ice-rich · sparse");
  });

  it("is what hovering a circle on the map finds, and nothing off the circles", () => {
    const state = createInitialState(5);
    const layout = mapLayout(state, viewport);
    for (const circle of layout.circles) {
      const id = mapHit(layout, circle.center)!;
      expect(sectorBox(state, id)?.title).toBe(circle.name);
    }
    expect(sectorBox(state, 99)).toBeNull();
  });
});

describe("rich rocks on screen", () => {
  it("draws a rich rock brighter than a plain one of the same material", () => {
    expect(asteroidColor("Metal", true)).not.toBe(asteroidColor("Metal"));
    expect(asteroidColor("Ice", true)).not.toBe(asteroidColor("Ice"));
    expect(asteroidColor("Metal", false)).toBe("#a16207");
  });

  it("titles a hovered rich rock 'Rich asteroid' with its ore left", () => {
    const state = createInitialState(5);
    const rock = state.asteroids.find((a) => a.rich)!;
    expect(infoBox(state, { kind: "asteroid", id: rock.id })).toEqual({
      title: "Rich asteroid",
      line: `${rock.material}: 120`,
    });
  });
});
