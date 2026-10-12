import type { ShipDesign } from "sim";
import { drawBlockOutline } from "./ship-rendering";
import { shipSprite } from "./ships";

// Camera-independent panel picture. Large designs still fit, but the shared
// outline helper skips their lines when a block would be less than four pixels.
export function createShipThumbnail(design: ShipDesign): HTMLCanvasElement {
  const thumb = document.createElement("canvas");
  const scale = Math.min(176 / design.width, 120 / design.height, 24);
  thumb.width = Math.max(1, Math.floor(design.width * scale));
  thumb.height = Math.max(1, Math.floor(design.height * scale));
  thumb.className = "ship-thumb";
  thumb.style.width = `${thumb.width}px`;
  thumb.style.height = `${thumb.height}px`;
  const ctx = thumb.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(shipSprite(design), 0, 0, thumb.width, thumb.height);
  drawBlockOutline(ctx, design, 0, 0, thumb.width, thumb.height);
  return thumb;
}
