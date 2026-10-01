import { SHIP_CRUISE_SPEED } from "./motion";
import { SHIP_MODULES } from "./model";
import type { Material, ShipDesign, ShipModule, Size } from "./model";
export { SHIP_MODULES };
export type { ShipDesign, ShipModule } from "./model";

// Placeholder tuning. The client asked for the first cut to run four times
// slower, which puts one cycle at roughly 35 to 50 seconds. These are the
// rates of one Laser filling one Storage and of the Dock emptying it.
export const CARGO_PER_TRIP = 10;
export const WORKING_SECONDS = 12;
export const UNLOADING_SECONDS = 6;

// A ship is painted pixels, each one a module cell. The design is their
// bounding box, stored row by row, and a null slot is an empty pixel inside
// the box: it is not part of the ship, so it costs and weighs nothing.
// World units per pixel. A pixel is a quarter of the old 4.5 module square,
// so the starting ship painted 4x4 is the size it was as a 2x2 of modules.
// Placeholder until the client has seen a big ship next to a station.
export const PIXEL_SIZE = 2.25;
const PIXELS_PER_OLD_MODULE = 4;

export const STARTING_SHIP: ShipDesign = {
  width: 4,
  height: 4,
  slots: [
    "Engine", "Engine", "Laser", "Laser",
    "Engine", "Engine", "Laser", "Laser",
    "Storage", "Storage", "Storage", "Storage",
    "Storage", "Storage", "Storage", "Storage",
  ],
};

// How far off the asteroid's edge a ship stops to mine: three lengths of the
// starting ship. Placeholder, to tune at the demo.
export const MINING_GAP = 3 * STARTING_SHIP.width * PIXEL_SIZE;

// Placeholder prices. Hull is the 1x baseline, Storage is 1.5x, Laser is 3x
// and Engine is 4x. Engines and Lasers lean Metal, Storage leans Ice, and
// Hull uses both evenly.
export const SHIP_MODULE_COST: Record<ShipModule, Record<Material, number>> = {
  Engine: { Metal: 30, Ice: 10 },
  Laser: { Metal: 20, Ice: 10 },
  Storage: { Metal: 5, Ice: 10 },
  // Placeholder: a Hangar costs the same total as Storage, but leans Metal.
  Hangar: { Metal: 10, Ice: 5 },
  Hull: { Metal: 5, Ice: 5 },
};
export const SHIP_BUILD_SECONDS_PER_RESOURCE = 0.1;
// Engines per painted pixel that move a ship at SHIP_CRUISE_SPEED: one in four.
const ENGINES_PER_PIXEL_AT_CRUISE = 1 / 4;

export interface ShipStats {
  // Cruise speed in world units per second.
  speed: number;
  hold: number;
  // Seconds to fill the hold from empty, or null with no Laser.
  miningSeconds: number | null;
}

export function pixelCount(design: ShipDesign): number {
  return design.slots.filter((slot) => slot !== null).length;
}

function count(design: ShipDesign, module: ShipModule): number {
  return design.slots.filter((slot) => slot === module).length;
}

export function shipModuleCounts(design: ShipDesign): Record<ShipModule, number> {
  return Object.fromEntries(SHIP_MODULES.map((module) => [module, count(design, module)])) as Record<ShipModule, number>;
}

// Multiplies the base cruise speed and acceleration.
export function speedFactor(design: ShipDesign): number {
  return count(design, "Engine") / pixelCount(design) / ENGINES_PER_PIXEL_AT_CRUISE;
}

export function shipStats(design: ShipDesign): ShipStats {
  const lasers = count(design, "Laser");
  // The old per-module numbers spread over the four pixels of a module, so
  // the starting ship keeps its hold and mining time. The hold is whole units.
  const hold = Math.floor(count(design, "Storage") * CARGO_PER_TRIP / PIXELS_PER_OLD_MODULE);
  return {
    speed: pixelCount(design) === 0 ? 0 : SHIP_CRUISE_SPEED * speedFactor(design),
    hold,
    miningSeconds: lasers > 0
      ? (hold / CARGO_PER_TRIP) * WORKING_SECONDS / (lasers / PIXELS_PER_OLD_MODULE)
      : null,
  };
}

// Loading and unloading use one rate everywhere cargo changes hands. Keeping
// this independent of the destination lets station hauling adopt the same
// timing without copying the gate or Dock state machines.
export function cargoTransferSeconds(units: number): number {
  return (units / CARGO_PER_TRIP) * UNLOADING_SECONDS;
}

// A ship missing any of these sits at the Dock.
export function canMine(design: ShipDesign): boolean {
  return count(design, "Engine") > 0 && count(design, "Laser") > 0 && count(design, "Storage") > 0;
}

export function shipSize(design: ShipDesign): Size {
  return { width: design.width * PIXEL_SIZE, height: design.height * PIXEL_SIZE };
}

export function shipBuildCost(design: ShipDesign): Record<Material, number> {
  const counts = shipModuleCounts(design);
  return Object.fromEntries((["Metal", "Ice"] as const).map((material) => [
    material,
    SHIP_MODULES.reduce((total, module) => total + counts[module] * SHIP_MODULE_COST[module][material], 0),
  ])) as Record<Material, number>;
}

export function shipBuildSeconds(design: ShipDesign): number {
  const cost = shipBuildCost(design);
  return (cost.Metal + cost.Ice) * SHIP_BUILD_SECONDS_PER_RESOURCE;
}

export function validDesign(design: ShipDesign): boolean {
  const side = (n: number) => Number.isInteger(n) && n >= 1;
  return side(design.width) && side(design.height)
    && design.slots.length === design.width * design.height && pixelCount(design) > 0;
}
