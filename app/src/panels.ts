import {
  deleteStock, resumeDefault, setDefaultBehaviour, setMineMaterial, setShipHome,
  setMineOtherSectors, setStorageLimit, type DefaultBehaviour,
  launchAll, type Material, type SimState,
} from "sim";
import { deleteButtonAction } from "./storage";
import { selectionPanel } from "./selection";
import { renderStoragePanel } from "./storage-panel";
import type { UiState } from "./ui-state";
import { applyHaulRouteFieldChangeWithFeedback } from "./haul-route";

export function installPanels(
  ui: UiState,
  getState: () => SimState,
  setState: (state: SimState) => void,
  storagePanel: HTMLElement,
  shipPanelBox: HTMLElement,
): () => void {
  const closeStoragePanel = (): void => {
    ui.storagePanelOpen = false;
    storagePanel.hidden = true;
    ui.deleteConfirmations.clear();
  };

  storagePanel.addEventListener("change", (event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>("input[data-limit]");
    if (!input) return;
    const value = input.value.trim() === "" ? null : Number(input.value);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;
    setState(setStorageLimit(getState(), input.dataset.limit as Material, value));
  });

  storagePanel.addEventListener("click", (event) => {
    const remove = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-delete]");
    if (!remove) return;
    const material = remove.dataset.delete as Material;
    const quantity = storagePanel.querySelector<HTMLInputElement>(`input[data-delete-amount="${material}"]`)!;
    const action = deleteButtonAction(ui.deleteConfirmations.get(material) ?? null, material, quantity.value, performance.now());
    if (action.deleteAmount !== null) {
      setState(deleteStock(getState(), material, action.deleteAmount));
      quantity.value = "";
    }
    if (action.confirmation) ui.deleteConfirmations.set(material, action.confirmation);
    else ui.deleteConfirmations.delete(material);
    renderStoragePanel(storagePanel, getState(), ui.storagePanelOpen, performance.now(), ui.deleteConfirmations);
  });

  shipPanelBox.addEventListener("change", (event) => {
    const select = event.target as HTMLSelectElement;
    if (select.name === "default") setState(setDefaultBehaviour(getState(), ui.selectedShips, select.value as DefaultBehaviour));
    if (select.name === "ship-home" && select.value !== "mixed") {
      const home = select.value === "none" ? null : Number(select.value);
      setState(setShipHome(getState(), ui.selectedShips, home));
    }
    if (["haul-from", "haul-to", "haul-material"].includes(select.name)) {
      ui.routeRefusalMessage = null;
      const panel = selectionPanel(getState(), ui.selectedShips);
      if (!panel?.haulRoute) return;
      if (select.value === "mixed") return;
      if (select.name === "haul-material") {
        if (select.value !== "Metal" && select.value !== "Ice") return;
        applyRouteChange(ui, getState, setState, { field: "material", value: select.value });
        return;
      }
      if (select.name === "haul-from") {
        const station = panel.stations.find(({ id }) => id === select.value);
        if (!station) return;
        applyRouteChange(ui, getState, setState, { field: "from", value: station.id });
        return;
      }
      const destination = panel.destinations.find(({ id }) => id === select.value);
      if (!destination) return;
      applyRouteChange(ui, getState, setState, { field: "to", value: destination.id });
    }
  });
  shipPanelBox.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name === "mine-material") setState(setMineMaterial(getState(), ui.selectedShips, input.value as Material, input.checked));
    if (input.name === "mine-other-sectors") setState(setMineOtherSectors(getState(), ui.selectedShips, input.checked));
  });
  shipPanelBox.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("button[data-resume]")) setState(resumeDefault(getState(), ui.selectedShips));
    const launch = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-launch-all]");
    if (launch) setState(launchAll(getState(), Number(launch.dataset.launchAll)));
  });

  return closeStoragePanel;
}

function applyRouteChange(
  ui: UiState,
  getState: () => SimState,
  setState: (state: SimState) => void,
  change: Parameters<typeof applyHaulRouteFieldChangeWithFeedback>[2],
): void {
  const result = applyHaulRouteFieldChangeWithFeedback(getState(), ui.selectedShips, change);
  setState(result.state);
  if (result.skipped.length > 0) {
    ui.routeRefusalMessage = `Skipped ${result.skipped.join(", ")}.`;
    ui.renderedPanel = "";
  }
}
