import type { UiState } from "./ui-state";

// The name box sits on the map over the sector's circle, so a finished Claim
// opens the map along with it.
export function openClaimNaming(ui: UiState, finished: readonly number[], startRename: (sectorId: number) => void): void {
  const sectorId = finished[0];
  if (sectorId === undefined) return;
  ui.mapOpen = true;
  startRename(sectorId);
}
