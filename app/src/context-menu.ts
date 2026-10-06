import { giveOrder, HOME_SECTOR, stationById, type SimState, type Vec } from "sim";
import { hoveredBody, screenToWorld } from "./camera";
import { dismissGatePlacement } from "./sectors";
import { contextOrderAllowed, orderTargetAt } from "./selection";
import type { UiState } from "./ui-state";
import { dockAtHoveredCarrier } from "./hangar-input";

export function installContextMenu(
  ui: UiState,
  getState: () => SimState,
  setState: (state: SimState) => void,
  canvas: HTMLCanvasElement,
  gateMenu: HTMLElement,
  stationButton: HTMLButtonElement,
  mousePoint: (event: MouseEvent) => Vec,
): () => void {
  const closeGateMenu = (): void => {
    gateMenu.hidden = true;
    ui.pendingGate = dismissGatePlacement(ui.pendingGate);
  };
  document.addEventListener("click", (event) => {
    if (!gateMenu.hidden && !gateMenu.contains(event.target as Node | null)) closeGateMenu();
  });
  window.addEventListener("mousedown", (event) => {
    if (!gateMenu.hidden && !gateMenu.contains(event.target as Node | null)) closeGateMenu();
  }, true);
  stationButton.addEventListener("click", () => {
    ui.pendingStation = true;
    closeGateMenu();
  });
  gateMenu.addEventListener("click", () => {
    gateMenu.hidden = true;
    ui.mapOpen = ui.pendingGate !== null;
  });
  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    if (!contextOrderAllowed(ui.mapOpen)) return;
    const state = getState();
    const point = mousePoint(event);
    const shipHovered = hoveredBody(state, ui.camera, ui.viewport, point, ui.currentSector);
    const docked = dockAtHoveredCarrier(state, ui.selectedShips, shipHovered);
    if (docked) {
      if (docked.refused.length > 0) {
        ui.routeRefusalMessage = `Skipped ${docked.refused.join(", ")}.`;
        ui.renderedPanel = "";
      } else ui.routeRefusalMessage = null;
      const carrier = shipHovered?.kind === "ship" ? state.ships[shipHovered.index] : null;
      if (carrier && docked.state !== state) ui.orderLines = { from: ui.selectedShips.flatMap((id) => { const ship = state.ships.find((item) => item.id === id); return ship ? [ship.position] : []; }), to: carrier.position, start: performance.now() / 1000 };
      if (docked.state !== state) setState(docked.state);
      return;
    }
    const hovered = hoveredBody(state, ui.camera, ui.viewport, point, ui.currentSector, { includeShips: false });
    if (!ui.selectedShips.length && !hovered && ui.currentSector === HOME_SECTOR) {
      ui.pendingGate = { sectorId: ui.currentSector, position: screenToWorld(ui.camera, ui.viewport, point) };
      gateMenu.style.left = `${point.x}px`;
      gateMenu.style.top = `${point.y}px`;
      gateMenu.hidden = false;
      return;
    }
    if (!ui.selectedShips.length) return;
    const world = screenToWorld(ui.camera, ui.viewport, point);
    const target = orderTargetAt(state, hovered, world, ui.currentSector);
    const to = target.kind === "move" ? target.point : target.kind === "home" ? homeStation(state).dock.position
      : target.kind === "haulGate" ? world
      : target.kind === "supplyBuild" ? stationById(state, target.stationId)?.constructionSite.position ?? world
      : state.asteroids.find((asteroid) => asteroid.id === target.asteroidId)?.position ?? world;
    ui.orderLines = { from: ui.selectedShips.flatMap((id) => { const ship = state.ships.find((item) => item.id === id); return ship ? [ship.position] : []; }), to, start: performance.now() / 1000 };
    setState(giveOrder(state, ui.selectedShips, target));
    ui.routeRefusalMessage = null;
  });
  return closeGateMenu;
}
import { homeStation } from "sim";
