import { renameSector, type SimState } from "sim";
import type { UiState } from "./ui-state";

export function installRenameInput(ui: UiState, getState: () => SimState, setState: (state: SimState) => void, renameBox: HTMLInputElement): (sectorId: number) => void {
  function startRename(sectorId: number): void {
    ui.renamingSector = sectorId;
    renameBox.value = getState().sectors[sectorId]!.name;
    renameBox.hidden = false;
    renameBox.focus();
    renameBox.select();
  }

  // Keys typed into the name box are not map or camera keys.
  renameBox.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter" && ui.renamingSector !== null) {
      setState(renameSector(getState(), ui.renamingSector, renameBox.value));
      ui.renamingSector = null;
    } else if (event.key === "Escape") ui.renamingSector = null;
  });
  return startRename;
}
