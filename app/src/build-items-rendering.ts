import { stationOwningSite, type SimState } from "sim";
import { buildMenuItems } from "./building";
import type { UiState } from "./ui-state";

export function syncBuildMenuItems(ui: UiState, getState: () => SimState, buildMenu: HTMLElement): void {
  // The menu reads the stock of the station that owns the site it opened on,
  // so each station offers builds paid from its own construction site.
  const stationId = ui.selectedBuildSite ? stationOwningSite(getState(), ui.selectedBuildSite) : 0;
  const menuItems = buildMenuItems(getState(), stationId);
  const menuKey = JSON.stringify({ station: stationId, items: menuItems });
  if (menuKey !== ui.renderedMenu) {
    ui.renderedMenu = menuKey;
    buildMenu.replaceChildren(...menuItems.map((item) => {
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
  }
}
