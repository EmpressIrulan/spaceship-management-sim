import { BUILDER_SIZE, BUILD_SECONDS, CLAIM_BUILD_SECONDS, CLAIM_COST, CLAIM_SIZE, MODULE_COST, STORAGE_SIZE, TURRET_SIZE } from "./build-constants";
import { DOCK_HEIGHT, DOCK_WIDTH } from "./dock-packing";
import { PIXEL_SIZE } from "./ship";
import type { Material, ModuleType, Size, Vec } from "./model";

export function validDockDimensions(size: Size): boolean {
  return Number.isInteger(size.width) && Number.isInteger(size.height) && size.width >= 4 && size.height >= 4;
}

// Per-type facts about a station module: its footprint, what it costs and how
// long it takes to build. Each one is looked up by type so the build pipeline
// never reads a single global for all of them.

export function samePosition(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}

export function moduleSize(type: ModuleType, width?: number, height?: number): Size {
  if (type === "Dock") return { width: (width ?? DOCK_WIDTH) * PIXEL_SIZE, height: (height ?? DOCK_HEIGHT) * PIXEL_SIZE };
  if (type === "Storage") return STORAGE_SIZE;
  if (type === "Claim") return CLAIM_SIZE;
  if (type === "Turret") return TURRET_SIZE;
  return BUILDER_SIZE;
}

export function moduleCost(type: ModuleType, width?: number, height?: number): Record<Material, number> {
  return type === "Claim" ? CLAIM_COST : type === "Dock"
    ? { Metal: (width ?? DOCK_WIDTH) * (height ?? DOCK_HEIGHT), Ice: (width ?? DOCK_WIDTH) * (height ?? DOCK_HEIGHT) }
    : MODULE_COST;
}

export function moduleBuildSeconds(type: ModuleType): number {
  return type === "Claim" ? CLAIM_BUILD_SECONDS : BUILD_SECONDS;
}
