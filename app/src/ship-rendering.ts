import { laserBeam, shipSize, type Beam, type Ship, type Size, type Vec } from "sim";
import { worldToScreen } from "./camera";
import { type Gauge } from "./labels";
import { LASER_COLOR, flickerPixels, laserPulse } from "./laser";
import { shipSprite } from "./ships";
import type { UiState } from "./ui-state";

const GAUGE = { width: 36, height: 12, gap: 4 };
export interface ShipDrawing { drawShip: (ship: Ship) => void; drawSelectionRing: (center: Vec, size: Size) => void; drawGauge: (position: Vec, gauge: Gauge, size: Size) => void; drawLaser: (beam: Beam, seconds: number) => void; }
export function createShipDrawing(ui: UiState, ctx: CanvasRenderingContext2D): ShipDrawing {
function drawShip(ship: Ship): void {
  const size = shipSize(ship.design);
  const a = worldToScreen(ui.camera, ui.viewport, { x: ship.position.x - size.width / 2, y: ship.position.y - size.height / 2 });
  const b = worldToScreen(ui.camera, ui.viewport, { x: ship.position.x + size.width / 2, y: ship.position.y + size.height / 2 });
  const x = Math.round(a.x);
  const y = Math.round(a.y);
  ctx.drawImage(shipSprite(ship.design), x, y, Math.max(1, Math.round(b.x) - x), Math.max(1, Math.round(b.y) - y));
}

function drawSelectionRing(center: Vec, size: Size): void {
  const screen = worldToScreen(ui.camera, ui.viewport, center);
  const radius = Math.hypot(size.width, size.height) / 2 * ui.camera.zoom + 5;
  ctx.save();
  ctx.strokeStyle = "#4ade80";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, radius, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawGauge(shipPosition: Vec, gauge: Gauge, size: Size): void {
  const top = worldToScreen(ui.camera, ui.viewport, {
    x: shipPosition.x,
    y: shipPosition.y - size.height / 2,
  });
  const x = Math.round(top.x - GAUGE.width / 2);
  const y = Math.round(top.y - GAUGE.gap - GAUGE.height);

  ctx.fillStyle = "#1f2937";
  ctx.fillRect(x, y, GAUGE.width, GAUGE.height);
  ctx.fillStyle = "#a16207";
  ctx.fillRect(x, y, GAUGE.width * gauge.fill, GAUGE.height);
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, GAUGE.width - 1, GAUGE.height - 1);

  ctx.fillStyle = "#f9fafb";
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(gauge.text, x + GAUGE.width / 2, y + GAUGE.height / 2 + 0.5);
}

// Screen-space, like the gauge, so the beam and flicker read at any zoom.
function drawLaser(beam: Beam, seconds: number): void {
  const from = worldToScreen(ui.camera, ui.viewport, beam.from);
  const to = worldToScreen(ui.camera, ui.viewport, beam.to);
  const pulse = laserPulse(seconds);

  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = LASER_COLOR;
  ctx.lineWidth = 1 + pulse;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();

  // 2 by 2 so a single spark is still visible on a low-density screen.
  ctx.fillStyle = "#fff1f2";
  for (const pixel of flickerPixels({ x: Math.round(to.x), y: Math.round(to.y) }, seconds)) {
    ctx.fillRect(pixel.x - 1, pixel.y - 1, 2, 2);
  }
}

  return { drawShip, drawSelectionRing, drawGauge, drawLaser };
}
