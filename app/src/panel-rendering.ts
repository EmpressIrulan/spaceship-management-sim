import { stationById, type SimState } from "sim";
import { renderShipPanel } from "./ship-panel";
import { renderStoragePanel } from "./storage-panel";
import type { UiState } from "./ui-state";

export function refreshPanels(ui: UiState, getState: () => SimState, shipPanelBox: HTMLElement, storagePanel: HTMLElement, stationPanel?: HTMLElement): void {
  const panel = renderShipPanel(getState(), shipPanelBox, {
    selectedShips: ui.selectedShips,
    selectedShip: ui.selectedShip,
    renderedPanel: ui.renderedPanel,
  });
  ui.selectedShips = panel.selectedShips;
  ui.selectedShip = panel.selectedShip;
  ui.renderedPanel = panel.renderedPanel;
  renderStoragePanel(storagePanel, getState(), ui.storagePanelOpen, performance.now(), ui.deleteConfirmations);
  if (stationPanel) {
    const station = ui.stationPanelId === null ? null : stationById(getState(), ui.stationPanelId);
    stationPanel.hidden = !station;
    const key = station ? `${station.id}:${station.name}:${ui.removeStationConfirmation === station.id}` : "";
    if (key !== ui.renderedStationPanel) {
      ui.renderedStationPanel = key;
      stationPanel.replaceChildren();
    }
    if (station && key !== "" && stationPanel.childElementCount === 0) {
      const heading = document.createElement("h2"); heading.textContent = station.name;
      const input = document.createElement("input"); input.name = "station-name"; input.value = station.name; input.setAttribute("aria-label", "Station name");
      const rename = document.createElement("button"); rename.dataset.stationRename = String(station.id); rename.textContent = "Rename";
      const remove = document.createElement("button"); remove.dataset.stationRemove = String(station.id); remove.textContent = ui.removeStationConfirmation === station.id ? `Remove ${station.name}? Its stock is lost` : "Remove station";
      stationPanel.append(heading, input, rename, remove);
    }
  }
}
