import { buildMenuItems } from "./building";
import type { SimState } from "sim";
import type { UiState } from "./ui-state";

export function syncBuildMenuItems(ui: UiState, getState: () => SimState, buildMenu: HTMLElement): void {
  const menuItems = buildMenuItems(getState());
  const menuKey = JSON.stringify(menuItems);
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
