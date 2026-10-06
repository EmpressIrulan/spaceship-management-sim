import { availableModuleBuildSites, stationById, type SimState } from "sim";
import { screenToWorld, worldToScreen } from "./camera";
import { buildAreaStation, buildControlSize, buildControlsVisible } from "./building";
import type { UiState } from "./ui-state";

export function syncBuildControls(ui: UiState, getState: () => SimState, buildControls: HTMLElement, buildMenu: HTMLElement): void {
  // The controls belong to whichever station the pointer is near, so each
  // station's + buttons show round it, the way they do at Home.
  const stationId = ui.pointer === null ? null
    : buildAreaStation(getState(), screenToWorld(ui.camera, ui.viewport, ui.pointer));
  const sectorId = stationId === null ? null
    : (stationId === 0 ? getState().stations[0]!.sectorId : stationById(getState(), stationId)?.sectorId) ?? null;
  const sites = stationId === null ? [] : availableModuleBuildSites(getState(), stationId);
  const sitesKey = JSON.stringify({ station: stationId, sites });
  if (sitesKey !== ui.renderedSites) {
    ui.renderedSites = sitesKey;
    buildControls.replaceChildren(...sites.map((site) => {
      const button = document.createElement("button");
      button.className = "build-toggle";
      button.dataset.x = String(site.x);
      button.dataset.y = String(site.y);
      button.setAttribute("aria-label", `Add station module at ${site.x}, ${site.y}`);
      const symbol = document.createElement("span");
      symbol.textContent = "+";
      button.append(symbol);
      return button;
    }));
  }
  const control = buildControlSize(ui.camera.zoom);
  buildControls.style.setProperty("--cell", `${control.cell}px`);
  buildControls.style.setProperty("--glyph", `${control.glyph}px`);
  for (const button of buildControls.querySelectorAll<HTMLButtonElement>("button[data-x]")) {
    const screen = worldToScreen(ui.camera, ui.viewport, { x: Number(button.dataset.x), y: Number(button.dataset.y) });
    button.style.left = `${screen.x - control.cell / 2}px`;
    button.style.top = `${screen.y - control.cell / 2}px`;
  }
  const inBuildArea = stationId !== null;
  buildControls.hidden = sectorId !== ui.currentSector || !buildControlsVisible(inBuildArea, ui.controlsHovered);
  if (ui.buildMenuOpen && ui.selectedBuildSite) {
    const screen = worldToScreen(ui.camera, ui.viewport, ui.selectedBuildSite);
    buildMenu.style.left = `${Math.round(screen.x + 20)}px`;
    buildMenu.style.top = `${Math.round(screen.y - 20)}px`;
  }
}
