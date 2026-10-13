import { SHIP_MODULES, shipModuleCounts, type ShipDesign } from "sim";

// One "Engine x4" line per module type the design has, in the designer's order.
export function moduleLines(design: ShipDesign): string[] {
  const counts = shipModuleCounts(design);
  return SHIP_MODULES.filter((module) => counts[module] > 0).map((module) => `${module} x${counts[module]}`);
}

// The "Modules" section of a selected ship's panel.
export function createModuleList(design: ShipDesign): HTMLElement {
  const section = document.createElement("section");
  section.className = "ship-modules";
  const heading = document.createElement("h3");
  heading.textContent = "Modules";
  const lines = moduleLines(design).map((text) => {
    const line = document.createElement("div");
    line.textContent = text;
    return line;
  });
  section.append(heading, ...lines);
  return section;
}
