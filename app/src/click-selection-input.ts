import { hoveredBody } from "./camera";
import { storagePanelOpenAfterClick } from "./storage";
import { openStoragePanel } from "./storage-panel";
import { toggleShip } from "./selection";
import { homeStation, stationById } from "sim";
import type { InputContext } from "./input-context";

export function selectClick(context: InputContext, event: MouseEvent, additive: boolean): void {
  const { ui, getState, canvas, storagePanel, closeStoragePanel, openShipMenu, mousePoint } = context;
  const priorSelection = ui.selectedShips.join(",");
  if (event.target !== canvas) return;
  const point = mousePoint(event);
  const hovered = hoveredBody(getState(), ui.camera, ui.viewport, point, ui.currentSector);
  ui.stickyQueuedBuild = hovered?.kind === "queuedBuild"
    ? { ...homeStation(getState()).buildQueue[hovered.index]!.position }
    : null;
  const clickedStorage = hovered?.kind === "storage"
    || (hovered?.kind === "module" && homeStation(getState()).modules[hovered.index]?.type === "Storage");
  const storageOpen = storagePanelOpenAfterClick(ui.storagePanelOpen, clickedStorage ? "storage" : hovered ? "other" : "empty");
  if (storageOpen && !ui.storagePanelOpen) openStoragePanel(storagePanel, getState(), () => { ui.storagePanelOpen = true; });
  else if (!storageOpen && ui.storagePanelOpen) closeStoragePanel();
  if (hovered?.kind === "ship") ui.selectedShips = additive ? toggleShip(ui.selectedShips, getState().ships[hovered.index]!.id) : [getState().ships[hovered.index]!.id];
  else if (!additive) ui.selectedShips = [];
  if (ui.selectedShips.join(",") !== priorSelection) ui.routeRefusalMessage = null;
  ui.selectedShip = ui.selectedShips[0] ?? null;
  if (hovered?.kind === "module" && stationById(getState(), hovered.stationId)?.modules[hovered.index]?.type === "Builder") openShipMenu(hovered.index, hovered.stationId);
  const stationDockId = hovered?.kind === "dock" ? hovered.stationId
    : hovered?.kind === "module" && stationById(getState(), hovered.stationId)?.modules[hovered.index]?.type === "Dock" ? hovered.stationId : null;
  if (stationDockId !== null) {
    ui.stationPanelId = stationById(getState(), stationDockId) ? stationDockId : null;
    ui.removeStationConfirmation = null;
  } else {
    ui.stationPanelId = null;
    ui.removeStationConfirmation = null;
  }
}
