import { SHIP_CRUISE_SPEED } from "./motion";
import type { Material, Size } from "./state";

// Placeholder tuning. The client asked for the first cut to run four times
// slower, which puts one cycle at roughly 35 to 50 seconds. These are the
// rates of one Laser filling one Storage and of the Dock emptying it.
export const CARGO_PER_TRIP = 10;
export const WORKING_SECONDS = 12;
export const UNLOADING_SECONDS = 6;

// Hull is structure only. It costs, weighs (it dilutes the engine share) and
// draws, but does nothing.
export const SHIP_MODULES = ["Engine", "Laser", "Storage", "Hull"] as const;
export type ShipModule = (typeof SHIP_MODULES)[number];

// A ship is painted pixels, each one a module cell. The design is their
// bounding box, stored row by row, and a null slot is an empty pixel inside
// the box: it is not part of the ship, so it costs and weighs nothing.
export interface ShipDesign {
  width: number;
  height: number;
  slots: (ShipModule | null)[];
}

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

// Placeholders until the client has built a real capital ship. Metal and Ice
// come in evenly, so the cost is even.
export const SHIP_COST_PER_PIXEL: Record<Material, number> = { Metal: 5, Ice: 5 };
export const SHIP_BUILD_SECONDS_PER_PIXEL = 1;
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

export function unloadingSeconds(design: ShipDesign): number {
  return (shipStats(design).hold / CARGO_PER_TRIP) * UNLOADING_SECONDS;
}

// A ship missing any of these sits at the Dock.
export function canMine(design: ShipDesign): boolean {
  return count(design, "Engine") > 0 && count(design, "Laser") > 0 && count(design, "Storage") > 0;
}

export function shipSize(design: ShipDesign): Size {
  return { width: design.width * PIXEL_SIZE, height: design.height * PIXEL_SIZE };
}

export function shipBuildCost(design: ShipDesign): Record<Material, number> {
  return {
    Metal: SHIP_COST_PER_PIXEL.Metal * pixelCount(design),
    Ice: SHIP_COST_PER_PIXEL.Ice * pixelCount(design),
  };
}

export function shipBuildSeconds(design: ShipDesign): number {
  return SHIP_BUILD_SECONDS_PER_PIXEL * pixelCount(design);
}

export function validDesign(design: ShipDesign): boolean {
  const side = (n: number) => Number.isInteger(n) && n >= 1;
  return side(design.width) && side(design.height)
    && design.slots.length === design.width * design.height && pixelCount(design) > 0;
}
