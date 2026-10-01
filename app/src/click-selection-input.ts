import { hoveredBody } from "./camera";
import { storagePanelOpenAfterClick } from "./storage";
import { openStoragePanel } from "./storage-panel";
import { toggleShip } from "./selection";
import type { InputContext } from "./input-context";

export function selectClick(context: InputContext, event: MouseEvent, additive: boolean): void {
  const { ui, getState, canvas, storagePanel, closeStoragePanel, openShipMenu, mousePoint } = context;
  if (event.target !== canvas) return;
  const point = mousePoint(event);
  const hovered = hoveredBody(getState(), ui.camera, ui.viewport, point, ui.currentSector);
  const clickedStorage = hovered?.kind === "storage"
    || (hovered?.kind === "module" && getState().station.modules[hovered.index]?.type === "Storage");
  const storageOpen = storagePanelOpenAfterClick(ui.storagePanelOpen, clickedStorage ? "storage" : hovered ? "other" : "empty");
  if (storageOpen && !ui.storagePanelOpen) openStoragePanel(storagePanel, getState(), () => { ui.storagePanelOpen = true; });
  else if (!storageOpen && ui.storagePanelOpen) closeStoragePanel();
  if (hovered?.kind === "ship") ui.selectedShips = additive ? toggleShip(ui.selectedShips, getState().ships[hovered.index]!.id) : [getState().ships[hovered.index]!.id];
  else if (!additive) ui.selectedShips = [];
  ui.selectedShip = ui.selectedShips[0] ?? null;
  if (hovered?.kind === "module" && getState().station.modules[hovered.index]?.type === "Builder") openShipMenu(hovered.index);
}
