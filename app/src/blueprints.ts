import { SHIP_MODULES, type ShipDesign } from "sim";
import type { Camera } from "./camera";
import type { ShipDraft } from "./shipyard";

export interface Blueprint {
  name: string;
  design: ShipDesign;
}

// The part of localStorage the blueprints need, so tests can pass a plain
// object and the game passes the real one.
export interface BlueprintStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const BLUEPRINTS_KEY = "spaceship-management-sim.blueprints";

function isDesign(value: unknown): value is ShipDesign {
  if (typeof value !== "object" || value === null) return false;
  const { width, height, slots } = value as Partial<ShipDesign>;
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width! > 0 &&
    height! > 0 &&
    Array.isArray(slots) &&
    slots.length === width! * height! &&
    slots.every((slot) => slot === null || (SHIP_MODULES as readonly unknown[]).includes(slot))
  );
}

function isBlueprint(value: unknown): value is Blueprint {
  if (typeof value !== "object" || value === null) return false;
  const { name, design } = value as Partial<Blueprint>;
  return typeof name === "string" && name !== "" && isDesign(design);
}

// Storage can be missing, blocked or hold something another version wrote,
// and none of that should stop the menu from opening.
export function loadBlueprints(store: BlueprintStore): Blueprint[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(BLUEPRINTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isBlueprint) : [];
  } catch {
    return [];
  }
}

function write(store: BlueprintStore, blueprints: Blueprint[]): void {
  try {
    store.setItem(BLUEPRINTS_KEY, JSON.stringify(blueprints));
  } catch {
    // The list still works for this session, it just will not survive a reload.
  }
}

// Saving under a name that exists replaces that blueprint in place. Returns
// the list as it now stands.
export function saveBlueprint(store: BlueprintStore, name: string, design: ShipDesign): Blueprint[] {
  const blueprints = loadBlueprints(store);
  const trimmed = name.trim();
  if (trimmed === "" || !isDesign(design)) return blueprints;
  const at = blueprints.findIndex((blueprint) => blueprint.name === trimmed);
  const saved = { name: trimmed, design };
  if (at === -1) blueprints.push(saved);
  else blueprints[at] = saved;
  write(store, blueprints);
  return blueprints;
}

export function deleteBlueprint(store: BlueprintStore, name: string): Blueprint[] {
  const blueprints = loadBlueprints(store).filter((blueprint) => blueprint.name !== name);
  write(store, blueprints);
  return blueprints;
}

// A draft holding the design at the canvas origin, with the brush carried
// over from `draft`. The cells are a new map, so editing it never reaches the
// blueprint or the draft it replaces.
export function draftFromDesign(draft: ShipDraft, design: ShipDesign): ShipDraft {
  const cells: ShipDraft["cells"] = new Map();
  design.slots.forEach((module, index) => {
    if (module) cells.set(`${index % design.width},${Math.floor(index / design.width)}`, module);
  });
  return { ...draft, cells };
}

// Loading puts the design at the canvas origin, which may be off screen for a
// ship wider than the menu, so the view moves to its middle.
export function viewCentredOn(view: Camera, design: ShipDesign): Camera {
  return { ...view, center: { x: design.width / 2, y: design.height / 2 } };
}
