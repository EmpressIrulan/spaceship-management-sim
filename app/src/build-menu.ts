import { queueModuleBuild, type ModuleType, type SimState, type Vec } from "sim";
import { dismissBuildMenuForClick } from "./building";
import type { UiState } from "./ui-state";

export function installBuildMenu(
  ui: UiState,
  getState: () => SimState,
  setState: (state: SimState) => void,
  buildControls: HTMLElement,
  buildMenu: HTMLElement,
  mousePoint: (event: MouseEvent) => Vec,
): () => void {
  const closeBuildMenu = (): void => {
    ui.buildMenuOpen = false;
    buildMenu.hidden = true;
    ui.selectedBuildSite = null;
  };
  buildControls.addEventListener("pointerover", () => { ui.controlsHovered = true; });
  buildControls.addEventListener("pointermove", (event) => { ui.pointer = mousePoint(event); });
  buildControls.addEventListener("pointerout", (event) => {
    if (!buildControls.contains(event.relatedTarget as Node | null)) ui.controlsHovered = false;
  });
  buildControls.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-x]");
    if (!button) return;
    ui.selectedBuildSite = { x: Number(button.dataset.x), y: Number(button.dataset.y) };
    ui.buildMenuOpen = true;
    buildMenu.hidden = false;
  });
  buildMenu.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-module]");
    if (!button || button.disabled || !ui.selectedBuildSite) return;
    setState(queueModuleBuild(getState(), button.dataset.module as ModuleType, ui.selectedBuildSite));
    closeBuildMenu();
  });
  document.addEventListener("click", (event) => {
    if (!ui.buildMenuOpen) return;
    const target = event.target as Node | null;
    if (dismissBuildMenuForClick(buildMenu.contains(target), buildControls.contains(target))) closeBuildMenu();
  });
  return closeBuildMenu;
}
