import type { SimState, Size, Vec } from "sim";
import { worldToScreen, type Viewport } from "./camera";
import { drawMapOverlay } from "./map-rendering";
import { createPaintRendering } from "./paint-rendering";
import { createWorldDrawing } from "./world-rendering";
import { refreshPanels } from "./panel-rendering";
import { updateCanvasLabel } from "./canvas-accessibility";
import { renderHoverInfo } from "./info-box-rendering";
import { syncBuildControls } from "./build-control-rendering";
import { syncShipMenuStats } from "./ship-menu-rendering";
import { syncBuildMenuItems } from "./build-items-rendering";
import type { UiState } from "./ui-state";

export interface RendererElements {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  shipPanelBox: HTMLElement;
  partTip: HTMLElement;
  sectorNameEl: HTMLElement | null;
  buildControls: HTMLElement;
  box: HTMLElement;
  boxTitle: HTMLElement;
  boxLine: HTMLElement;
  infoAction: HTMLButtonElement;
  buildMenu: HTMLElement;
  claimButton: HTMLButtonElement;
  hint: HTMLElement;
  renameBox: HTMLInputElement;
  shipMenu: HTMLElement;
  storagePanel: HTMLElement;
  paintViewport: () => Viewport;
  paintPointAt: (point: Vec) => Vec;
}

export function createRenderer(ui: UiState, getState: () => SimState, elements: RendererElements): (seconds: number) => void {
  const { ctx, canvas, shipPanelBox, partTip, sectorNameEl, buildControls, box, boxTitle, boxLine, infoAction,
    buildMenu, claimButton, hint, renameBox, shipMenu, storagePanel, paintViewport, paintPointAt } = elements;
  function fillWorldRect(center: Vec, size: Size, color: string): void {
  const topLeft = worldToScreen(ui.camera, ui.viewport, {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
  });
  ctx.fillStyle = color;
  ctx.fillRect(topLeft.x, topLeft.y, size.width * ui.camera.zoom, size.height * ui.camera.zoom);
}

  function strokeWorldRect(center: Vec, size: Size, color: string): void {
  const topLeft = worldToScreen(ui.camera, ui.viewport, {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
  });
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = color;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 2;
  ctx.strokeRect(topLeft.x, topLeft.y, size.width * ui.camera.zoom, size.height * ui.camera.zoom);
  ctx.restore();
}

const paintRendering = createPaintRendering(ui, getState, { partTip, shipPanelBox, paintViewport, paintPointAt });
const worldDrawing = createWorldDrawing(ui, getState, ctx, fillWorldRect, strokeWorldRect);

function draw(seconds: number): void {
  const { sectorRocks, legacyGateVisible, gate, gateScreen } = worldDrawing.draw(seconds);
  refreshPanels(ui, getState, shipPanelBox, storagePanel);
  paintRendering.renderPartTip();

  updateCanvasLabel(ui, getState, canvas, sectorNameEl, sectorRocks.length, legacyGateVisible, gate.to);
  renderHoverInfo(ui, getState, buildControls, box, boxTitle, boxLine, infoAction, gate, legacyGateVisible, gateScreen);

  syncBuildControls(ui, getState, buildControls, buildMenu);
  if (ui.shipMenuBuilder !== null) paintRendering.drawPaintCanvas();
  syncShipMenuStats(ui, getState, shipMenu);
  syncBuildMenuItems(ui, getState, buildMenu);

  claimButton.hidden = !ui.mapOpen;
  hint.hidden = !ui.pendingClaim;
  hint.textContent = ui.mapOpen ? "Pick the sector for the claim station" : "Click a spot for the construction site. Esc cancels.";
  renameBox.hidden = ui.renamingSector === null || !ui.mapOpen;
  if (renameBox.hidden) ui.renamingSector = null;

  if (ui.mapOpen) drawMapOverlay(ui, getState(), ctx, renameBox);
}



  return draw;
}
