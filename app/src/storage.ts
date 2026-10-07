import { MATERIALS, type Material, type SimState } from "sim";

export interface StoragePanelRow {
  material: Material;
  amount: number;
  limit: string;
}

export function storagePanelRows(state: SimState): StoragePanelRow[] {
  return MATERIALS.map((material) => ({
    material,
    amount: homeStation(state).inventory[material],
    limit: homeStation(state).storageLimits[material]?.toString() ?? "",
  }));
}

export type StoragePanelClick = "storage" | "empty" | "other";

export function storagePanelOpenAfterClick(open: boolean, click: StoragePanelClick): boolean {
  if (click === "storage") return true;
  if (click === "empty") return false;
  return open;
}

export interface DeleteConfirmation {
  material: Material;
  amount: number;
  until: number;
}

export function deleteButtonAction(
  confirmation: DeleteConfirmation | null,
  material: Material,
  input: string,
  now: number,
): { confirmation: DeleteConfirmation | null; deleteAmount: number | null } {
  if (confirmation?.material === material && now <= confirmation.until) {
    return { confirmation: null, deleteAmount: confirmation.amount };
  }
  const value = Number(input);
  if (input.trim() === "" || !Number.isFinite(value) || value <= 0) {
    return { confirmation: null, deleteAmount: null };
  }
  return {
    confirmation: { material, amount: Math.floor(value), until: now + 3_000 },
    deleteAmount: null,
  };
}
import { homeStation } from "sim";
