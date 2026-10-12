import { describe, expect, it } from "vitest";
import { STARTING_SHIP, SHIP_MODULES, type ShipDesign } from "sim";
import { moduleLines } from "./ship-modules";

describe("module list lines (#123)", () => {
  it("lists the starting miner's modules with their block counts (criteria 1, 4)", () => {
    expect(moduleLines(STARTING_SHIP)).toEqual(["Engine x4", "Laser x4", "Storage x8"]);
  });

  it("leaves out module types the ship has none of (criterion 2)", () => {
    const design: ShipDesign = { width: 3, height: 1, slots: ["Gun", null, "Gun"] };
    expect(moduleLines(design)).toEqual(["Gun x2"]);
  });

  it("keeps the designer's order whatever order the blocks sit in (criterion 3)", () => {
    const slots = [...SHIP_MODULES].reverse();
    const design: ShipDesign = { width: slots.length, height: 1, slots };
    expect(moduleLines(design)).toEqual(SHIP_MODULES.map((module) => `${module} x1`));
  });

  it("counts every block of a type, matching the outline's blocks (criterion 4)", () => {
    const slots = Array.from({ length: 12 }, (_, index) => (index % 3 === 0 ? "Hull" : index % 3 === 1 ? "Capacitor" : null));
    const design: ShipDesign = { width: 4, height: 3, slots };
    expect(moduleLines(design)).toEqual(["Hull x4", "Capacitor x4"]);
  });

  it("has no overall size line, only the counts (criterion 7)", () => {
    expect(moduleLines(STARTING_SHIP).every((line) => /^[A-Z][a-z]+ x\d+$/.test(line))).toBe(true);
  });
});
