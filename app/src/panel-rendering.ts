import type { SimState } from "sim";
import { renderShipPanel } from "./ship-panel";
import { renderStoragePanel } from "./storage-panel";
import type { UiState } from "./ui-state";

export function refreshPanels(ui: UiState, getState: () => SimState, shipPanelBox: HTMLElement, storagePanel: HTMLElement): void {
  const panel = renderShipPanel(getState(), shipPanelBox, {
    selectedShips: ui.selectedShips,
    selectedShip: ui.selectedShip,
    renderedPanel: ui.renderedPanel,
  });
  ui.selectedShips = panel.selectedShips;
  ui.selectedShip = panel.selectedShip;
  ui.renderedPanel = panel.renderedPanel;
  renderStoragePanel(storagePanel, getState(), ui.storagePanelOpen, performance.now(), ui.deleteConfirmations);
}
