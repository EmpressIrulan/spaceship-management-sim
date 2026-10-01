export interface Vec { x: number; y: number }
export interface Size { width: number; height: number }
export const MATERIALS = ["Metal", "Ice"] as const;
export type Material = (typeof MATERIALS)[number];
export type Density = "sparse" | "dense";

interface FieldBase { id: number; sectorId: number; centre: Vec; radius: number }
export type AsteroidField =
  | (FieldBase & { kind: "cluster" })
  | (FieldBase & { kind: "belt"; from: number; sweep: number; width: number });

export type ModuleType = (typeof MODULE_TYPES)[number];
export const MODULE_TYPES = ["Dock", "Storage", "Builder"] as const;
export interface ClaimSite {
  id: number;
  sectorId: number;
  position: Vec;
  stage: number;
  delivered: Record<Material, number>;
  timer: number | null;
}
