import { validDesign, type SimState } from "sim";
import { buildCountFor, designOf, shipMenuView, shipQueueView } from "./shipyard";
import type { UiState } from "./ui-state";

export function syncShipMenuStats(ui: UiState, getState: () => SimState, shipMenu: HTMLElement): void {
  if (ui.shipMenuBuilder === null) return;
  const view = shipMenuView(getState(), ui.shipMenuBuilder, ui.draft, ui.shipMenuStation);
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
  // Queueing itself costs nothing: only a valid design is required, even if
  // the station will have to wait for materials before starting it.
  shipMenu.querySelector<HTMLButtonElement>(".build")!.disabled = !validDesign(designOf(ui.draft));
  const queue = shipQueueView(getState(), ui.shipMenuBuilder, ui.shipMenuStation);
  const list = shipMenu.querySelector<HTMLElement>(".ship-build-queue")!;
  const queueKey = JSON.stringify(queue);
  if (list.dataset.key !== queueKey) {
    list.dataset.key = queueKey;
    list.replaceChildren();
    queue.forEach((line) => {
      const row = document.createElement("div");
      row.className = "ship-build-line";
      row.append(document.createTextNode(`${line.waiting ? "Waiting" : "Building"}: ${line.label}${line.count > 1 ? ` x${line.count}` : ""}${line.remaining ? ` — ${line.remaining} left` : ""}${line.shortfall ? `\n${line.shortfall}` : ""} `));
      const cancel = document.createElement("button");
      cancel.textContent = "Cancel";
      cancel.dataset.cancelBuild = String(line.place);
      row.append(cancel);
      list.append(row);
    });
  }
  const count = shipMenu.querySelector<HTMLElement>(".count-value")!;
  const chosenCount = String(buildCountFor(ui.shipMenuCounts, designOf(ui.draft)));
  if (count.textContent !== chosenCount) count.textContent = chosenCount;
  const blueprintName = shipMenu.querySelector<HTMLInputElement>(".blueprint-name")!;
  shipMenu.querySelector<HTMLButtonElement>("button[data-blueprint-save]")!.disabled =
    blueprintName.value.trim() === "" || designOf(ui.draft).width === 0;
}
