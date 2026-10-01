import { sectorInGateRange, type SimState } from "sim";
import { mapLayout, renameLabel } from "./sectors";
import type { UiState } from "./main";

export function drawMapOverlay(ui: UiState, state: SimState, ctx: CanvasRenderingContext2D, renameBox: HTMLInputElement): void {
  const layout = mapLayout(state, ui.viewport);
  ctx.save(); ctx.fillStyle = "rgba(15,23,42,.94)"; ctx.fillRect(0, 0, ui.viewport.width, ui.viewport.height);
  ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 3;
  for (const link of layout.links) { ctx.beginPath(); ctx.moveTo(link.from.x, link.from.y); ctx.lineTo(link.to.x, link.to.y); ctx.stroke(); }
  for (const circle of layout.circles) {
    const available = !ui.pendingGate || circle.id === ui.pendingGate.sectorId || sectorInGateRange(ui.pendingGate.sectorId, circle.id);
    ctx.beginPath(); ctx.arc(circle.center.x, circle.center.y, circle.radius, 0, Math.PI * 2);
    ctx.fillStyle = available ? circle.tint : "#334155";
    ctx.globalAlpha = available ? 1 : 0.55;
    ctx.fill(); ctx.strokeStyle = available ? "#67e8f9" : "#64748b"; ctx.stroke();
    ctx.fillStyle = "#f8fafc"; ctx.textAlign = "center"; ctx.font = "14px monospace";
    ctx.fillText(circle.name, circle.center.x, circle.center.y - 4);
    ctx.fillText(`${circle.ships} ships`, circle.center.x, circle.center.y + 18);
    if (circle.claimed) {
      const label = renameLabel(circle);
      ctx.font = "11px monospace"; ctx.strokeStyle = "#94a3b8"; ctx.strokeRect(label.x, label.y, label.width, label.height);
      ctx.fillText("Rename", circle.center.x, label.y + 12);
      ctx.font = "14px monospace";
    }
    if (ui.renamingSector === circle.id) {
      renameBox.style.left = `${Math.round(circle.center.x - 60)}px`;
      renameBox.style.top = `${Math.round(circle.center.y - 22)}px`;
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
