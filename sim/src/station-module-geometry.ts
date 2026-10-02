import { BUILDER_SIZE, DOCK_SIZE, STORAGE_SIZE } from "./build-constants";
import type { ModuleType, Size, Vec } from "./model";

export function samePosition(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}

export function moduleSize(type: ModuleType): Size {
  if (type === "Dock") return DOCK_SIZE;
  if (type === "Storage") return STORAGE_SIZE;
  return BUILDER_SIZE;
}
