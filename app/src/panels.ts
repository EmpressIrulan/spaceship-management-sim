import {
  configureHaul, deleteStock, resumeDefault, setDefaultBehaviour, setMineMaterial,
  setMineOtherSectors, setStorageLimit, type DefaultBehaviour, type HaulStationId,
  type Material, type SimState,
} from "sim";
import { deleteButtonAction } from "./storage";
import { selectionPanel } from "./selection";
import { renderStoragePanel } from "./storage-panel";
import type { UiState } from "./ui-state";

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
    if (["haul-from", "haul-to", "haul-material"].includes(select.name)) {
      const panel = selectionPanel(getState(), ui.selectedShips);
      const route = panel?.haulRoute;
      if (!route) return;
      setState(configureHaul(getState(), ui.selectedShips, {
        from: select.name === "haul-from" ? select.value as HaulStationId : route.from,
        to: select.name === "haul-to" ? select.value as HaulStationId : route.to,
        material: select.name === "haul-material" ? select.value as Material : route.material,
      }));
    }
  });
  shipPanelBox.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name === "mine-material") setState(setMineMaterial(getState(), ui.selectedShips, input.value as Material, input.checked));
    if (input.name === "mine-other-sectors") setState(setMineOtherSectors(getState(), ui.selectedShips, input.checked));
  });
  shipPanelBox.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("button[data-resume]")) setState(resumeDefault(getState(), ui.selectedShips));
  });

  return closeStoragePanel;
}
