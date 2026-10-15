import type { Material, ShipDesign, Size } from "./model";
import { PIXEL_SIZE } from "./ship";
import { DOCK_WIDTH, DOCK_HEIGHT } from "./dock-packing";
import { SIZE_MULTIPLIER } from "./size-constants";
export { SIZE_MULTIPLIER, DISTANCE_MULTIPLIER } from "./size-constants";

export const ASTEROID_MIN_SPACING = 40;
export const BUILD_SECONDS = 15;
export const CLAIM_BUILD_SECONDS = 300;
export const DOCK_SIZE: Size = { width: DOCK_WIDTH * PIXEL_SIZE, height: DOCK_HEIGHT * PIXEL_SIZE };
export const HOME_SECTOR = 0;
// The cost of Dock, Storage and Builder. A Claim costs CLAIM_COST.
export const MODULE_COST: Record<Material, number> = { Metal: 25, Ice: 25 };
export const CLAIM_COST: Record<Material, number> = { Metal: 1000, Ice: 1000 };
export const MODULE_SPACING = 40 * SIZE_MULTIPLIER;
export const MODULE_HP = 40;
export const SHIELD_CAPACITY_PER_PIXEL = 20;
export const SHIELD_RECHARGE_PER_PIXEL = 1;
export const SHIELD_RECHARGE_DELAY = 5;
export const BUILDER_SIZE: Size = { width: 30 * SIZE_MULTIPLIER, height: 40 * SIZE_MULTIPLIER };
export const STORAGE_SIZE: Size = { width: 30 * SIZE_MULTIPLIER, height: 40 * SIZE_MULTIPLIER };
export const CLAIM_SIZE: Size = { width: 30 * SIZE_MULTIPLIER, height: 40 * SIZE_MULTIPLIER };
export const TURRET_SIZE: Size = { width: 30 * SIZE_MULTIPLIER, height: 40 * SIZE_MULTIPLIER };

// The hive sits in the sector next to home on the map, the one Home's gate
// leads to. HP, spawn rate and sizes are placeholders in config until there is
// something to play with.
export const HIVE_SECTOR = 1;
export const HIVE_HP = 200;
export const HIVE_SIZE: Size = { width: 30 * SIZE_MULTIPLIER, height: 30 * SIZE_MULTIPLIER };
// How far along the line from the sector's middle to its gate the hive sits.
export const HIVE_GATE_FRACTION = 0.75;
// A bug hatches every BUG_SPAWN_SECONDS. Each occupied design pixel contributes BUG_HP.
export const BUG_SPAWN_SECONDS = 10;
export const BUG_HP = 6;
// Bug hull scales with its number of occupied pixels.
export const BUG_DESIGNS: readonly ShipDesign[] = [
  { width: 1, height: 1, slots: ["Gun"] },
  { width: 2, height: 1, slots: ["Gun", "Gun"] },
  { width: 4, height: 1, slots: ["Gun", "Gun", "Gun", "Gun"] },
];
export const BUG_SIZE: Size = { width: 10 * SIZE_MULTIPLIER, height: 8 * SIZE_MULTIPLIER };
// The sim's clock runs at up to 4x speed while the app's explosion burst
// lasts EXPLOSION_SECONDS = 0.9 real seconds (app/src/world-rendering.ts), so
// a blast can fill 0.9 * 4 = 3.6 game seconds of sim time. Entries older than
// that cannot still be on screen, so the tick drops them.
export const EXPLOSION_CUTOFF_SECONDS = 3.6;
// Alive bugs below this count loiter by the hive; at it or above they hunt
// ships in their sector.
export const BUG_ATTACK_THRESHOLD = 5;
// How far a loitering bug strays from the hive, the closest it settles, and
// how fast it flits (a share of a ship's cruise speed).
export const BUG_HOVER_RADIUS = 40;
export const BUG_HOVER_MIN_REACH = 10;
export const BUG_SPEED_FACTOR = 0.6;
// How far from its quarry a bug stands alongside and bites, how much hull
// each bite takes, and how long between bites. Placeholders, like the hive
// numbers, until there is something to play with.
export const BUG_BITE_RANGE = 2 * SIZE_MULTIPLIER;
export const BUG_BITE_DAMAGE = 1;
export const BUG_BITE_SECONDS = 6;
// A gun ship shoots the nearest bug in range, or the hive when no bug is
// close enough, every GUN_SECONDS. Range, damage and cadence are placeholders,
// like the hive numbers, until there is something to play with. Bug hull scales
// with occupied pixels; the hive's 200 are a long stand-off.
export const GUN_RANGE = 80;
export const GUN_DAMAGE = 3;
export const GUN_SECONDS = 2;
// A dying hive leaves one drop of queen larvae, a shot bug one of bug juice,
// floating where the thing died, at a third of its former size so it stays
// smaller than the ship that would collect it. Nothing collects them yet.
export const DROP_SIZE: Size = { width: 4 * SIZE_MULTIPLIER, height: 4 * SIZE_MULTIPLIER };
// How long a fired shot stays on screen, in game seconds, for the renderer to
// draw. A dyadic fraction, so it burns out exactly on a tick boundary.
export const GUN_SHOT_SECONDS = 1 / 2;
export const TURRET_RANGE = GUN_RANGE;
export const TURRET_DAMAGE = GUN_DAMAGE;
export const TURRET_SECONDS = GUN_SECONDS;
export const TURRET_SHOT_SECONDS = GUN_SHOT_SECONDS;
export const TURRET_METAL_PER_SHOT = 1;
