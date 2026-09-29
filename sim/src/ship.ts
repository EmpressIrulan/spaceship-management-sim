import { SHIP_CRUISE_SPEED } from "./motion";
import type { Material, Size } from "./state";

// Placeholder tuning. The client asked for the first cut to run four times
// slower, which puts one cycle at roughly 35 to 50 seconds. These are the
// rates of one Laser filling one Storage and of the Dock emptying it.
export const CARGO_PER_TRIP = 10;
export const WORKING_SECONDS = 12;
export const UNLOADING_SECONDS = 6;

export const SHIP_MODULES = ["Engine", "Laser", "Storage"] as const;
export type ShipModule = (typeof SHIP_MODULES)[number];

// A hull is a rectangle of slots, stored row by row. Empty slots are allowed
// and still cost, since the hull is what is paid for.
export interface ShipDesign {
  width: number;
  height: number;
  slots: (ShipModule | null)[];
}

export const MAX_HULL = 3;
// World units per slot. 4.5 keeps the starting 2x2 a couple of units smaller
// than an asteroid, as it was before hulls had sizes.
export const SHIP_SLOT_SIZE = 4.5;

export const STARTING_SHIP: ShipDesign = {
  width: 2,
  height: 2,
  slots: ["Engine", "Laser", "Storage", "Storage"],
};

// How far off the asteroid's edge a ship stops to mine: three lengths of the
// starting ship. Placeholder, to tune at the demo.
export const MINING_GAP = 3 * STARTING_SHIP.width * SHIP_SLOT_SIZE;

// Placeholders, to tune over time. Metal and Ice come in evenly, so the cost is even.
export const SHIP_COST_PER_SQUARE: Record<Material, number> = { Metal: 20, Ice: 20 };
// 3 s x squares^1.68 grows fast early and flattens, so a future 10x10 takes
// about 2 hours rather than days.
const BUILD_SECONDS_BASE = 3;
const BUILD_SECONDS_EXPONENT = 1.68;
// Engines per square that move a ship at SHIP_CRUISE_SPEED: one in a 2x2.
const ENGINES_PER_SQUARE_AT_CRUISE = 1 / 4;

export interface ShipStats {
  // Cruise speed in world units per second.
  speed: number;
  hold: number;
  // Seconds to fill the hold from empty, or null with no Laser.
  miningSeconds: number | null;
}

function squares(design: ShipDesign): number {
  return design.width * design.height;
}

function count(design: ShipDesign, module: ShipModule): number {
  return design.slots.filter((slot) => slot === module).length;
}

// Multiplies the base cruise speed and acceleration.
export function speedFactor(design: ShipDesign): number {
  return count(design, "Engine") / squares(design) / ENGINES_PER_SQUARE_AT_CRUISE;
}

export function shipStats(design: ShipDesign): ShipStats {
  const lasers = count(design, "Laser");
  const hold = count(design, "Storage") * CARGO_PER_TRIP;
  return {
    speed: SHIP_CRUISE_SPEED * speedFactor(design),
    hold,
    miningSeconds: lasers > 0 ? (hold / CARGO_PER_TRIP) * WORKING_SECONDS / lasers : null,
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
  return { width: design.width * SHIP_SLOT_SIZE, height: design.height * SHIP_SLOT_SIZE };
}

export function shipBuildCost(design: ShipDesign): Record<Material, number> {
  return {
    Metal: SHIP_COST_PER_SQUARE.Metal * squares(design),
    Ice: SHIP_COST_PER_SQUARE.Ice * squares(design),
  };
}

export function shipBuildSeconds(design: ShipDesign): number {
  return BUILD_SECONDS_BASE * squares(design) ** BUILD_SECONDS_EXPONENT;
}

export function validDesign(design: ShipDesign): boolean {
  const side = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_HULL;
  return side(design.width) && side(design.height) && design.slots.length === squares(design);
}
