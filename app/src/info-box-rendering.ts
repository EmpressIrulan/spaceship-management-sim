import { bodyOf, hoveredBody, worldToScreen } from "./camera";
import { infoBox, sectorBox } from "./labels";
import { mapHit, mapLayout } from "./sectors";
import type { SimState, Vec } from "sim";
import type { UiState } from "./ui-state";

interface GateView { to: number; position: Vec; size: { width: number; height: number } }

export function renderHoverInfo(
  ui: UiState,
  getState: () => SimState,
  controls: HTMLElement,
  box: HTMLElement,
  boxTitle: HTMLElement,
  boxLine: HTMLElement,
  infoAction: HTMLButtonElement,
  gate: GateView,
  legacyGateVisible: boolean,
  gateScreen: Vec,
): void {
  // Re-checked every frame, so zooming under a still pointer updates it too,
  // and the box closes by itself when a hovered asteroid runs out.
  let hovered = ui.mapOpen ? null : hoveredBody(getState(), ui.camera, ui.viewport, ui.pointer, ui.currentSector);
  if (hovered?.kind === "claimSite") ui.stickySite = hovered.id;
  else if (ui.infoHovered && ui.stickySite !== null && !ui.mapOpen) hovered = { kind: "claimSite", id: ui.stickySite };
  else ui.stickySite = null;

  // A + cell sits above the canvas, so a ship beside it would never hear the
  // click. While the pointer is on a ship, the cells let clicks through.
  controls.classList.toggle("over-ship", hovered?.kind === "ship");
  const info = infoBox(getState(), hovered);
  box.hidden = info === null;
  if (info === null) ui.infoHovered = false;
  box.style.pointerEvents = info?.action ? "auto" : "none";
  infoAction.hidden = !info?.action;
  delete infoAction.dataset.site;
  delete infoAction.dataset.carrier;
  if (info?.action) {
    infoAction.textContent = info.action.label;
    infoAction.disabled = !!info.action.disabled;
    if (info.action.siteId !== undefined) infoAction.dataset.site = String(info.action.siteId);
    if (info.action.carrierId !== undefined) infoAction.dataset.carrier = String(info.action.carrierId);
  }
  const body = hovered && bodyOf(getState(), hovered);
  if (body && info) {
    const anchor = worldToScreen(ui.camera, ui.viewport, {
      x: body.position.x + body.size.width / 2,
      y: body.position.y - body.size.height / 2,
    });
    box.style.left = `${anchor.x + (info.action ? 0 : 8)}px`;
    box.style.top = `${anchor.y}px`;
    boxTitle.textContent = info.title;
    boxLine.textContent = info.line;
  }
  if (legacyGateVisible && ui.pointer && Math.hypot(ui.pointer.x - gateScreen.x, ui.pointer.y - gateScreen.y) < Math.max(14, gate.size.width * ui.camera.zoom / 2)) {
    const jumping = getState().ships.some((ship) => ship.sectorId === ui.currentSector && (ship.state === "jumpingOut" || ship.state === "jumpingHome"));
    box.hidden = false; boxTitle.textContent = "Gate"; boxLine.textContent = jumping ? "Jumping" : `Gate to ${getState().sectors[gate.to]!.name}`;
    box.style.left = `${gateScreen.x + 16}px`; box.style.top = `${gateScreen.y}px`;
  }
  if (ui.mapOpen) {
    // The map covers the sector, so only its circles have anything to show.
    const layout = mapLayout(getState(), ui.viewport);
    const id = ui.pointer ? mapHit(layout, ui.pointer) : null;
    const sectorInfo = id === null ? null : sectorBox(getState(), id);
    box.hidden = sectorInfo === null;
    if (sectorInfo && id !== null) {
      const circle = layout.circles[id]!;
      box.style.left = `${circle.center.x + circle.radius + 8}px`;
      box.style.top = `${circle.center.y - circle.radius}px`;
      boxTitle.textContent = sectorInfo.title;
      boxLine.textContent = sectorInfo.line;
    }
  }
}
