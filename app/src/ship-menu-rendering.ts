import type { SimState } from "sim";
import { designOf, shipMenuView } from "./shipyard";
import type { UiState } from "./ui-state";

export function syncShipMenuStats(ui: UiState, getState: () => SimState, shipMenu: HTMLElement): void {
  if (ui.shipMenuBuilder === null) return;
  const view = shipMenuView(getState(), ui.shipMenuBuilder, ui.draft);
  const stats = shipMenu.querySelector<HTMLElement>(".stats")!;
  const text = `Pixels ${view.pixels}\nSpeed ${view.stats.speed}\nHold ${view.stats.hold}\nMining time ${view.stats.miningTime}`;
  if (stats.textContent !== text) stats.textContent = text;
  const cost = shipMenu.querySelector<HTMLElement>(".cost")!;
  const costKey = JSON.stringify([view.parts, view.buildTime, view.materials]);
  if (cost.dataset.key !== costKey) {
    cost.dataset.key = costKey;
    cost.replaceChildren(document.createTextNode(`${view.parts}\nBuild time ${view.buildTime}\nCost `));
    view.materials.forEach((material, index) => {
      if (index > 0) cost.append(" ");
      const total = document.createElement("span");
      total.textContent = `${material.amount} ${material.material}`;
      total.classList.toggle("short", material.short);
      cost.append(total);
    });
  }
  shipMenu.querySelector<HTMLButtonElement>(".build")!.disabled = !view.canBuild;
  const blueprintName = shipMenu.querySelector<HTMLInputElement>(".blueprint-name")!;
  shipMenu.querySelector<HTMLButtonElement>("button[data-blueprint-save]")!.disabled =
    blueprintName.value.trim() === "" || designOf(ui.draft).width === 0;
}
