import type { Material, Size } from "./model";
import { PIXEL_SIZE } from "./ship";
import { DOCK_WIDTH, DOCK_HEIGHT } from "./dock-packing";

export const ASTEROID_MIN_SPACING = 40;
export const BUILD_SECONDS = 15;
export const CLAIM_BUILD_SECONDS = 300;
export const DOCK_SIZE: Size = { width: DOCK_WIDTH * PIXEL_SIZE, height: DOCK_HEIGHT * PIXEL_SIZE };
export const HOME_SECTOR = 0;
// The cost of Dock, Storage and Builder. A Claim costs CLAIM_COST.
export const MODULE_COST: Record<Material, number> = { Metal: 25, Ice: 25 };
export const CLAIM_COST: Record<Material, number> = { Metal: 1000, Ice: 1000 };
export const MODULE_SPACING = 40;
export const BUILDER_SIZE: Size = { width: 30, height: 40 };
export const STORAGE_SIZE: Size = { width: 30, height: 40 };
export const CLAIM_SIZE: Size = { width: 30, height: 40 };

// The hive sits in the sector next to home on the map, the one Home's gate
// leads to. HP, spawn rate and sizes are placeholders in config until there is
// something to play with.
export const HIVE_SECTOR = 1;
export const HIVE_HP = 200;
export const HIVE_SIZE: Size = { width: 30, height: 30 };
// How far along the line from the sector's middle to its gate the hive sits.
export const HIVE_GATE_FRACTION = 0.75;
// A bug hatches every BUG_SPAWN_SECONDS and starts with BUG_HP.
export const BUG_SPAWN_SECONDS = 10;
export const BUG_HP = 6;
export const BUG_SIZE: Size = { width: 10, height: 8 };
// Alive bugs below this count loiter by the hive; at it or above they hunt
// ships in their sector (a later slice).
export const BUG_ATTACK_THRESHOLD = 5;
// How far a loitering bug strays from the hive, the closest it settles, and
// how fast it flits (a share of a ship's cruise speed).
export const BUG_HOVER_RADIUS = 40;
export const BUG_HOVER_MIN_REACH = 10;
export const BUG_SPEED_FACTOR = 0.6;
