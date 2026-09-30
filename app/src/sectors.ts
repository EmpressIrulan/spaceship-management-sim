import type { SimState, Vec } from "sim";
import type { Viewport } from "./camera";

export function mapToggled(open: boolean, key: string): boolean {
  if (key.toLowerCase() === "m") return !open;
  if (key === "Escape") return false;
  return open;
}

export function mapLayout(state: SimState, viewport: Viewport): { circles: { id: number; name: string; center: Vec; radius: number; ships: number }[]; links: { from: Vec; to: Vec }[] } {
  const radius = Math.max(36, Math.min(70, viewport.width / 6));
  const circles = state.sectors.map((sector, index) => ({
    id: sector.id, name: sector.name,
    center: { x: viewport.width * (index + 1) / (state.sectors.length + 1), y: viewport.height / 2 },
    radius,
    ships: state.ships.filter((ship) => ship.sectorId === sector.id).length,
  }));
  return { circles, links: [{ from: circles[0]!.center, to: circles[1]!.center }] };
}

export function mapHit(layout: ReturnType<typeof mapLayout>, point: Vec): number | null {
  return layout.circles.find((circle) => Math.hypot(point.x - circle.center.x, point.y - circle.center.y) <= circle.radius)?.id ?? null;
}
