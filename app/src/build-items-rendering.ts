import { stationOwningSite, type SimState } from "sim";
import { buildMenuItems } from "./building";
import type { UiState } from "./ui-state";

export function syncBuildMenuItems(ui: UiState, getState: () => SimState, buildMenu: HTMLElement): void {
  // The menu reads the stock of the station that owns the site it opened on,
  // so each station offers builds paid from its own construction site.
  const stationId = ui.selectedBuildSite ? stationOwningSite(getState(), ui.selectedBuildSite, ui.dockBuildSize ?? undefined) : 0;
  const menuItems = buildMenuItems(getState(), stationId, ui.dockBuildSize ?? undefined);
  const menuKey = JSON.stringify({ station: stationId, items: menuItems, dockSize: ui.dockBuildSize });
  if (menuKey !== ui.renderedMenu) {
    const focusedDimension = document.activeElement instanceof HTMLInputElement
      ? document.activeElement.dataset.dockDimension : undefined;
    ui.renderedMenu = menuKey;
    if (ui.dockBuildSize) {
      const form = document.createElement("div");
      form.dataset.dockSizeForm = "";
      for (const dimension of ["width", "height"] as const) {
        const label = document.createElement("label");
        label.textContent = `${dimension} `;
        const input = document.createElement("input");
        input.type = "number";
        input.min = "4";
        input.value = String(ui.dockBuildSize[dimension]);
        input.dataset.dockDimension = dimension;
        input.setAttribute("aria-label", `Dock ${dimension}`);
        label.append(input);
        form.append(label);
      }
      const cost = document.createElement("span");
      cost.dataset.dockCost = "";
      cost.textContent = menuItems[0]!.cost;
      const build = document.createElement("button");
      build.dataset.buildDock = "";
      build.disabled = menuItems[0]!.disabled;
      build.title = menuItems[0]!.title;
      build.textContent = "Build";
      form.append(cost, build);
      buildMenu.replaceChildren(form);
    } else buildMenu.replaceChildren(...menuItems.map((item) => {
      const button = document.createElement("button");
      button.dataset.module = item.type;
      button.disabled = item.disabled;
      button.title = item.title;
      const name = document.createElement("span");
      name.textContent = item.type;
      const cost = document.createElement("span");
      cost.textContent = item.cost;
      button.append(name, cost);
      return button;
    }));
    if (focusedDimension) buildMenu.querySelector<HTMLInputElement>(`input[data-dock-dimension="${focusedDimension}"]`)?.focus();
  }
}
