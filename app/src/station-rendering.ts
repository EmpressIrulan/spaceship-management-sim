import {
  BERTH_PAD_SIZE,
  dockBerths,
  type SimState,
  type Station,
  type StationModule,
  type Vec,
  type Size,
} from "sim";
import { worldToScreen } from "./camera";
import { moduleAppearance } from "./station-appearance";
import type { UiState } from "./ui-state";

export interface StationDrawing {
  drawStationConnector: (from: Vec, to: Vec) => void;
  drawStationModule: (module: StationModule) => void;
  drawConstructionSite: (site: Station["constructionSite"]) => void;
  drawQueuedModule: (module: StationModule, highlighted?: boolean) => void;
}
export function createStationDrawing(
  ui: UiState,
  getState: () => SimState,
  ctx: CanvasRenderingContext2D,
  fillWorldRect: (center: Vec, size: Size, color: string) => void,
  strokeWorldRect: (center: Vec, size: Size, color: string) => void,
): StationDrawing {
  function drawStationConnector(from: Vec, to: Vec): void {
    const start = worldToScreen(ui.camera, ui.viewport, from);
    const end = worldToScreen(ui.camera, ui.viewport, to);
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = Math.max(4, 7 * ui.camera.zoom);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = Math.max(1, 2 * ui.camera.zoom);
    ctx.stroke();
    ctx.restore();
  }

  // The Dock's pads, marked whether or not a ship is on them. Called with the
  // canvas already translated to the Dock's centre.
  function drawBerthPads(dock: Vec): void {
    const side = BERTH_PAD_SIZE * ui.camera.zoom;
    ctx.save();
    ctx.strokeStyle = moduleAppearance("Dock").accent;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = Math.max(1, ui.camera.zoom);
    ctx.setLineDash([
      Math.max(2, 3 * ui.camera.zoom),
      Math.max(2, 2 * ui.camera.zoom),
    ]);
    for (const pad of dockBerths(dock)) {
      ctx.strokeRect(
        (pad.x - dock.x) * ui.camera.zoom - side / 2,
        (pad.y - dock.y) * ui.camera.zoom - side / 2,
        side,
        side,
      );
    }
    ctx.restore();
  }

  function drawStationModule(module: StationModule): void {
    const center = worldToScreen(ui.camera, ui.viewport, module.position);
    const width = module.size.width * ui.camera.zoom;
    const height = module.size.height * ui.camera.zoom;
    const appearance = moduleAppearance(module.type);
    const detailWidth = Math.max(1.5, 2 * ui.camera.zoom);

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = appearance.accent;
    ctx.lineWidth = Math.max(1.5, 2 * ui.camera.zoom);
    ctx.beginPath();
    ctx.ellipse(0, 0, width * 0.47, height * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (appearance.silhouette === "open-bay") {
      ctx.fillStyle = "#020617";
      ctx.fillRect(-width * 0.23, -height * 0.17, width * 0.46, height * 0.42);
      ctx.strokeStyle = appearance.accent;
      ctx.lineWidth = detailWidth;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-width * 0.32, height * 0.28);
      ctx.lineTo(-width * 0.32, -height * 0.1);
      ctx.lineTo(-width * 0.18, -height * 0.3);
      ctx.moveTo(width * 0.32, height * 0.28);
      ctx.lineTo(width * 0.32, -height * 0.1);
      ctx.lineTo(width * 0.18, -height * 0.3);
      ctx.stroke();
    } else if (appearance.silhouette === "tank-cluster") {
      for (const x of [-0.22, 0, 0.22]) {
        ctx.fillStyle = x === 0 ? appearance.accent : "#475569";
        ctx.strokeStyle = appearance.accent;
        ctx.lineWidth = Math.max(1, ui.camera.zoom);
        ctx.beginPath();
        ctx.ellipse(
          width * x,
          0,
          width * 0.14,
          height * 0.29,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.stroke();
      }
    } else if (appearance.silhouette === "beacon") {
      ctx.strokeStyle = appearance.accent;
      ctx.lineWidth = detailWidth;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, height * 0.3);
      ctx.lineTo(0, -height * 0.3);
      ctx.stroke();
      ctx.fillStyle = appearance.accent;
      ctx.beginPath();
      ctx.moveTo(0, -height * 0.3);
      ctx.lineTo(width * 0.3, -height * 0.18);
      ctx.lineTo(0, -height * 0.06);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.strokeStyle = appearance.accent;
      ctx.lineWidth = detailWidth;
      ctx.lineCap = "square";
      ctx.beginPath();
      ctx.moveTo(-width * 0.28, height * 0.28);
      ctx.lineTo(-width * 0.28, -height * 0.28);
      ctx.lineTo(width * 0.24, -height * 0.28);
      ctx.lineTo(width * 0.24, -height * 0.14);
      ctx.moveTo(-width * 0.28, -height * 0.08);
      ctx.lineTo(width * 0.2, height * 0.28);
      ctx.moveTo(width * 0.24, -height * 0.14);
      ctx.lineTo(width * 0.34, -height * 0.02);
      ctx.stroke();
      ctx.fillStyle = appearance.accent;
      ctx.beginPath();
      ctx.arc(
        width * 0.34,
        height * 0.04,
        Math.max(1.5, width * 0.07),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    if (module.type === "Dock") drawBerthPads(module.position);
    ctx.restore();
  }

  // A ghost the Cancel under the pointer would take with it: drawn solid rather
  // than faint, and ringed, so it reads as going with the click.
  function drawQueuedModule(module: StationModule, highlighted = false): void {
    ctx.save();
    ctx.globalAlpha = highlighted ? 0.85 : 0.3;
    drawStationModule(module);
    ctx.restore();
    if (!highlighted) return;
    const center = worldToScreen(ui.camera, ui.viewport, module.position);
    const radius = (Math.hypot(module.size.width, module.size.height) / 2) * ui.camera.zoom + 5;
    ctx.save();
    ctx.strokeStyle = "#4ade80";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  // Ships carry ore here and the station builds from it. The caller only draws
  // it while the build queue needs supplies.
  function drawConstructionSite(site: Station["constructionSite"]): void {
    const { position, size } = site;
    const left = worldToScreen(ui.camera, ui.viewport, {
      x: position.x - size.width / 2,
      y: position.y - size.height / 2,
    });
    const right = worldToScreen(ui.camera, ui.viewport, {
      x: position.x + size.width / 2,
      y: position.y + size.height / 2,
    });
    fillWorldRect(position, size, "rgba(245,158,11,.25)");
    strokeWorldRect(position, size, "#f59e0b");
    ctx.save();
    ctx.strokeStyle = "rgba(245,158,11,.6)";
    ctx.lineWidth = Math.max(1, ui.camera.zoom);
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.moveTo(right.x, left.y);
    ctx.lineTo(left.x, right.y);
    ctx.stroke();
    ctx.restore();
  }

  return {
    drawStationConnector,
    drawStationModule,
    drawConstructionSite,
    drawQueuedModule,
  };
}
import { homeStation } from "sim";
