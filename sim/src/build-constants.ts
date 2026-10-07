import type { Material, Size } from "./model";

export const ASTEROID_MIN_SPACING = 40;
export const BUILD_SECONDS = 15;
export const CLAIM_BUILD_SECONDS = 300;
export const DOCK_SIZE: Size = { width: 40, height: 70 };
export const HOME_SECTOR = 0;
// The cost of Dock, Storage and Builder. A Claim costs CLAIM_COST.
export const MODULE_COST: Record<Material, number> = { Metal: 25, Ice: 25 };
export const CLAIM_COST: Record<Material, number> = { Metal: 1000, Ice: 1000 };
export const MODULE_SPACING = 40;
export const BUILDER_SIZE: Size = { width: 30, height: 40 };
export const STORAGE_SIZE: Size = { width: 30, height: 40 };
export const CLAIM_SIZE: Size = { width: 30, height: 40 };
