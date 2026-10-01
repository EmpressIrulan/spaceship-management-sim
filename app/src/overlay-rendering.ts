import { orderLineAlpha } from "./selection";
import { sectorBackdrop } from "./sectors";
import { worldToScreen } from "./camera";
import type { UiState } from "./ui-state";

export interface OverlayDrawing { drawOrderFeedback: (seconds: number) => void; drawBackdrop: (sectorId: number) => void; }
export function createOverlayDrawing(ui: UiState, ctx: CanvasRenderingContext2D): OverlayDrawing {
  function drawOrderFeedback(seconds: number): void {
    if (ui.orderLines) {
      const alpha = orderLineAlpha(seconds - ui.orderLines.start);
      if (alpha <= 0) ui.orderLines = null;
      else {
        const to = worldToScreen(ui.camera, ui.viewport, ui.orderLines.to);
        ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = "#86efac"; ctx.setLineDash([5, 4]);
        for (const from of ui.orderLines.from) {
          const start = worldToScreen(ui.camera, ui.viewport, from);
          ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(to.x, to.y); ctx.stroke();
        }
        ctx.restore();
      }
    }
    if (ui.dragBox) {
      ctx.save(); ctx.strokeStyle = "#4ade80"; ctx.fillStyle = "rgba(74,222,128,.12)";
      const x = Math.min(ui.dragBox.start.x, ui.dragBox.end.x); const y = Math.min(ui.dragBox.start.y, ui.dragBox.end.y);
      const w = Math.abs(ui.dragBox.start.x - ui.dragBox.end.x); const h = Math.abs(ui.dragBox.start.y - ui.dragBox.end.y);
      ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); ctx.restore();
    }
  }

  function backdropNumber(sectorId: number, index: number, salt: number): number {
    let value = (sectorId + 1) * 0x9e3779b1 ^ (index + 1) * 0x85ebca6b ^ salt;
    value = Math.imul(value ^ value >>> 16, 0x7feb352d);
    value = Math.imul(value ^ value >>> 15, 0x846ca68b);
    return ((value ^ value >>> 16) >>> 0) / 2 ** 32;
  }

  function drawBackdrop(sectorId: number): void {
    const backdrop = sectorBackdrop(sectorId);
    ctx.fillStyle = backdrop.background;
    ctx.fillRect(0, 0, ui.viewport.width, ui.viewport.height);
    const glowX = ui.viewport.width * (0.2 + backdropNumber(sectorId, 0, 17) * 0.6);
    const glowY = ui.viewport.height * (0.2 + backdropNumber(sectorId, 0, 31) * 0.6);
    const glowRadius = Math.max(ui.viewport.width, ui.viewport.height) * 0.7;
    const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowRadius);
    glow.addColorStop(0, backdrop.wash);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, ui.viewport.width, ui.viewport.height);
    ctx.fillStyle = backdrop.starColor;
    for (let index = 0; index < backdrop.starCount; index += 1) {
      const x = Math.floor(backdropNumber(sectorId, index, 101) * ui.viewport.width);
      const y = Math.floor(backdropNumber(sectorId, index, 211) * ui.viewport.height);
      const size = backdropNumber(sectorId, index, 307) > 0.88 ? 2 : 1;
      ctx.globalAlpha = 0.35 + backdropNumber(sectorId, index, 401) * 0.65;
      ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1;
  }

  return { drawOrderFeedback, drawBackdrop };
}
