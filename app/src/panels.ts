import {
  configureHaul, deleteStock, resumeDefault, setDefaultBehaviour, setMineMaterial,
  setMineOtherSectors, setStorageLimit, type DefaultBehaviour, type HaulRoute, type HaulStationId,
  launchAll, type Material, type SimState,
} from "sim";
import { deleteButtonAction } from "./storage";
import { selectionPanel, type DisplayHaulRoute } from "./selection";
import { renderStoragePanel } from "./storage-panel";
import type { UiState } from "./ui-state";

/**
 * Applies a haul route field change to all selected ships.
 * For each ship, preserves its other field values and only updates the changed field.
 * Ships that would end up with same From and To reject the change.
 */
export function applyHaulRouteFieldChange(
  state: SimState,
  selectedShipIds: number[],
  field: "from" | "to" | "material",
  newValue: HaulStationId | Material,
): SimState {
  let nextState = state;
  for (const shipId of selectedShipIds) {
    const ship = nextState.ships.find((s) => s.id === shipId);
    if (!ship || !ship.haulRoute) continue;
    const currentRoute = ship.haulRoute;
    const mergedRoute: HaulRoute = {
      from: field === "from" ? (newValue as HaulStationId) : currentRoute.from,
      to: field === "to" ? (newValue as HaulStationId) : currentRoute.to,
      material: field === "material" ? (newValue as Material) : currentRoute.material,
    };
    // configureHaul validates the route (rejects same From/To) and applies per-ship
    nextState = configureHaul(nextState, [shipId], mergedRoute);
  }
  return nextState;
}

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
      const route = panel?.haulRoute as DisplayHaulRoute | null;
      if (!route) return;
      if (select.value === "mixed") return;
      const field = select.name === "haul-from" ? "from" : select.name === "haul-to" ? "to" : "material";
      const newValue = select.name === "haul-material"
        ? (select.value as Material)
        : (select.value as HaulStationId);
      setState(applyHaulRouteFieldChange(getState(), ui.selectedShips, field, newValue));
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
