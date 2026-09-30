import type { SimState, Vec } from "sim";
import type { Viewport } from "./camera";

export function mapToggled(open: boolean, key: string): boolean {
  if (key.toLowerCase() === "m") return !open;
  if (key === "Escape") return false;
  return open;
}

export function mapLayout(state: SimState, viewport: Viewport): { circles: { id: number; name: string; center: Vec; radius: number; ships: number }[]; links: { from: Vec; to: Vec }[] } {
  const radius = Math.max(36, Math.min(70, viewport.width / 6));
  const points = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }];
  const circles = state.sectors.map((sector, index) => ({
    id: sector.id, name: sector.name,
    center: { x: viewport.width * (0.2 + (points[index]?.x ?? 0) * 0.25), y: viewport.height * (0.25 + (points[index]?.y ?? 0) * 0.25) },
    radius,
    ships: state.ships.filter((ship) => ship.sectorId === sector.id).length,
  }));
  const links = state.sectors.flatMap((sector) => sector.id < sector.gate.to
    ? [{ from: circles[sector.id]!.center, to: circles[sector.gate.to]!.center }]
    : []);
  for (const project of state.gateProjects.filter((candidate) => candidate.complete)) {
    links.push({ from: circles[project.ends[0].sectorId]!.center, to: circles[project.ends[1].sectorId]!.center });
  }
  return { circles, links };
}

// Fixed map-space layout distance; nearby sectors are buildable, distant ones are not.
export function sectorInGateRange(a: number, b: number): boolean {
  const points = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }];
  const left = points[a]; const right = points[b];
  return !!left && !!right && Math.hypot(left.x - right.x, left.y - right.y) <= 1.5;
}

export function mapHit(layout: ReturnType<typeof mapLayout>, point: Vec): number | null {
  return layout.circles.find((circle) => Math.hypot(point.x - circle.center.x, point.y - circle.center.y) <= circle.radius)?.id ?? null;
}
