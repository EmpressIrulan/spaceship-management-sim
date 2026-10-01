import { type Material, type SimState } from "sim";
import { storagePanelRows, type DeleteConfirmation } from "./storage";

export function openStoragePanel(storagePanel: HTMLElement, state: SimState, setOpen: () => void): void {
  setOpen();
  storagePanel.hidden = false;
  if (storagePanel.children.length > 0) return;
  const title = document.createElement("h2");
  title.textContent = "Storage";
  const rows = storagePanelRows(state).map(({ material }) => {
    const row = document.createElement("div"); row.className = "storage-row"; row.dataset.material = material;
    const name = document.createElement("span"); name.className = "material"; name.textContent = material;
    const amount = document.createElement("span"); amount.className = "amount";
    const limitLabel = document.createElement("label"); limitLabel.textContent = "Limit";
    const limit = document.createElement("input"); limit.type = "number"; limit.min = "0"; limit.placeholder = "No limit"; limit.dataset.limit = material; limitLabel.append(limit);
    const deleteLabel = document.createElement("label"); deleteLabel.textContent = "Amount";
    const quantity = document.createElement("input"); quantity.type = "number"; quantity.min = "1"; quantity.dataset.deleteAmount = material; deleteLabel.append(quantity);
    const remove = document.createElement("button"); remove.textContent = "Delete"; remove.dataset.delete = material;
    row.append(name, amount, limitLabel, deleteLabel, remove);
    return row;
  });
  storagePanel.replaceChildren(title, ...rows);
}


export function renderStoragePanel(storagePanel: HTMLElement, state: SimState, isOpen: boolean, now: number, deleteConfirmations: Map<Material, DeleteConfirmation>): void {
  if (!isOpen) return;
  for (const row of storagePanelRows(state)) {
    const element = storagePanel.querySelector<HTMLElement>(`.storage-row[data-material="${row.material}"]`)!;
    element.querySelector<HTMLElement>(".amount")!.textContent = String(row.amount);
    const limit = element.querySelector<HTMLInputElement>("input[data-limit]")!;
    if (document.activeElement !== limit) limit.value = row.limit;
    const confirmation = deleteConfirmations.get(row.material);
    const remove = element.querySelector<HTMLButtonElement>("button[data-delete]")!;
    remove.textContent = confirmation !== undefined && now <= confirmation.until ? "Confirm" : "Delete";
    if (confirmation !== undefined && now > confirmation.until) deleteConfirmations.delete(row.material);
  }
}
