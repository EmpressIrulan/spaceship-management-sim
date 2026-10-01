import type { SimState, Vec } from "sim";
import { screenToWorld, worldToScreen, type Viewport } from "./camera";
import { cellAt, designPartAt, draftPartAt, placedDesign } from "./shipyard";
import { shipSprite } from "./ships";
import type { UiState } from "./ui-state";

export interface PaintRenderingElements {
  partTip: HTMLElement;
  shipPanelBox: HTMLElement;
  paintViewport: () => Viewport;
  paintPointAt: (point: Vec) => Vec;
}

export interface PaintRendering {
  drawPaintCanvas: () => void;
  renderPartTip: () => void;
}

export function createPaintRendering(
  ui: UiState,
  getState: () => SimState,
  elements: PaintRenderingElements,
): PaintRendering {
  const { partTip, shipPanelBox, paintViewport, paintPointAt } = elements;
  const GRID_ZOOM = 6;

  function drawPaintCanvas(): void {
    const surface = ui.paintCanvas!;
    if (surface.width !== surface.clientWidth || surface.height !== surface.clientHeight) {
      surface.width = surface.clientWidth;
      surface.height = surface.clientHeight;
    }
    const g = surface.getContext("2d")!;
    const vp = paintViewport();
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#0f172a";
    g.fillRect(0, 0, vp.width, vp.height);
    const { design, origin } = placedDesign(ui.draft);
    if (design.width > 0) {
      const at = worldToScreen(ui.paintView, vp, origin);
      g.drawImage(shipSprite(design), at.x, at.y, design.width * ui.paintView.zoom, design.height * ui.paintView.zoom);
    }
    if (ui.paintView.zoom >= GRID_ZOOM) {
      // Screen pixels per canvas pixel above which the pixel grid is drawn.
      const first = screenToWorld(ui.paintView, vp, { x: 0, y: 0 });
      const last = screenToWorld(ui.paintView, vp, { x: vp.width, y: vp.height });
      g.strokeStyle = "rgba(148,163,184,.25)";
      g.lineWidth = 1;
      g.beginPath();
      for (let x = Math.ceil(first.x); x <= last.x; x += 1) {
        const sx = Math.round(worldToScreen(ui.paintView, vp, { x, y: 0 }).x) + 0.5;
        g.moveTo(sx, 0);
        g.lineTo(sx, vp.height);
      }
      for (let y = Math.ceil(first.y); y <= last.y; y += 1) {
        const sy = Math.round(worldToScreen(ui.paintView, vp, { x: 0, y }).y) + 0.5;
        g.moveTo(0, sy);
        g.lineTo(vp.width, sy);
      }
      g.stroke();
    }
    if (ui.paintPointer) {
      const cell = cellAt(ui.paintView, vp, ui.paintPointer);
      const reach = ui.draft.tool === "fill" ? 0 : Math.floor(ui.draft.size / 2);
      const corner = worldToScreen(ui.paintView, vp, { x: cell.x - reach, y: cell.y - reach });
      const span = (2 * reach + 1) * ui.paintView.zoom;
      g.strokeStyle = ui.draft.tool === "erase" ? "#f87171" : "#facc15";
      g.lineWidth = 2;
      g.strokeRect(corner.x, corner.y, span, span);
    }
  }

  // The name of the part under the mouse, or null when it is not over a design.
  function hoveredPart(hover: NonNullable<typeof ui.partHover>): string | null {
    if (hover.source === "paint") {
      if (!ui.paintCanvas || ui.shipMenuBuilder === null) return null;
      return draftPartAt(ui.draft, cellAt(ui.paintView, paintViewport(), paintPointAt(hover.at)));
    }
    const thumb = shipPanelBox.querySelector<HTMLElement>(".ship-thumb");
    const ship = getState().ships.find((candidate) => candidate.id === ui.selectedShip);
    if (!thumb || !ship || shipPanelBox.hidden) return null;
    const bounds = thumb.getBoundingClientRect();
    return designPartAt(ship.design, {
      x: (hover.at.x - bounds.left) / bounds.width,
      y: (hover.at.y - bounds.top) / bounds.height,
    });
  }

  function renderPartTip(): void {
    const name = ui.partHover && hoveredPart(ui.partHover);
    partTip.hidden = !ui.partHover || name === null;
    if (!ui.partHover || name === null) return;
    partTip.textContent = name;
    partTip.style.left = `${ui.partHover.at.x + 14}px`;
    partTip.style.top = `${ui.partHover.at.y + 14}px`;
  }

  return { drawPaintCanvas, renderPartTip };
}
