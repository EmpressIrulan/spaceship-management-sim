import { MATERIALS, type Material, type SimState } from "sim";

export interface StoragePanelRow {
  material: Material;
  amount: number;
  limit: string;
}

export function storagePanelRows(state: SimState): StoragePanelRow[] {
  return MATERIALS.map((material) => ({
    material,
    amount: state.station.inventory[material],
    limit: state.station.storageLimits[material]?.toString() ?? "",
  }));
}

export function deleteButtonAction(confirmUntil: number | null, now: number): { confirmUntil: number | null; deleteNow: boolean } {
  if (confirmUntil !== null && now <= confirmUntil) return { confirmUntil: null, deleteNow: true };
  return { confirmUntil: now + 3_000, deleteNow: false };
}
