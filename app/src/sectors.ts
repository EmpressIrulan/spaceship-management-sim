import { SECTOR_MAP_POINTS, sectorInGateRange, type SimState, type Vec } from "sim";
import type { Viewport } from "./camera";

export interface SectorBackdrop {
  background: string;
  tint: string;
  wash: string;
  starColor: string;
  starCount: number;
}

const SECTOR_BACKDROPS: readonly SectorBackdrop[] = [
  { background: "#07152f", tint: "#24538c", wash: "rgba(26,75,132,.42)", starColor: "#dbeafe", starCount: 38 },
  { background: "#321616", tint: "#914737", wash: "rgba(180,68,42,.38)", starColor: "#ffedd5", starCount: 72 },
  { background: "#07313a", tint: "#167d7d", wash: "rgba(19,143,138,.34)", starColor: "#ccfbf1", starCount: 148 },
  { background: "#211338", tint: "#664394", wash: "rgba(119,72,160,.38)", starColor: "#f3e8ff", starCount: 94 },
];

export function sectorBackdrop(sectorId: number): SectorBackdrop {
  return SECTOR_BACKDROPS[((sectorId % SECTOR_BACKDROPS.length) + SECTOR_BACKDROPS.length) % SECTOR_BACKDROPS.length]!;
}

export function mapToggled(open: boolean, key: string): boolean {
  if (key.toLowerCase() === "m") return !open;
  if (key === "Escape") return false;
  return open;
}

export function mapLayout(state: SimState, viewport: Viewport): { circles: { id: number; name: string; center: Vec; radius: number; ships: number; tint: string }[]; links: { from: Vec; to: Vec }[] } {
  const radius = Math.max(36, Math.min(70, viewport.width / 6));
  const circles = state.sectors.map((sector, index) => ({
    id: sector.id, name: sector.name,
    center: { x: viewport.width * (0.2 + (SECTOR_MAP_POINTS[index]?.x ?? 0) * 0.25), y: viewport.height * (0.25 + (SECTOR_MAP_POINTS[index]?.y ?? 0) * 0.25) },
    radius,
    ships: state.ships.filter((ship) => ship.sectorId === sector.id).length,
    tint: sectorBackdrop(sector.id).tint,
  }));
  const links = state.sectors.flatMap((sector) => sector.id < sector.gate.to
    ? [{ from: circles[sector.id]!.center, to: circles[sector.gate.to]!.center }]
    : []);
  for (const project of state.gateProjects.filter((candidate) => candidate.complete)) {
    links.push({ from: circles[project.ends[0].sectorId]!.center, to: circles[project.ends[1].sectorId]!.center });
  }
  return { circles, links };
}

export interface PendingGate { sectorId: number; position: Vec; targetSector?: number }
export function dismissGatePlacement(_pending: PendingGate | null): null { return null; }
export function gateTargetAllowed(pending: PendingGate | null, sectorId: number): boolean {
  return !pending || (sectorId !== pending.sectorId && sectorInGateRange(pending.sectorId, sectorId));
}

export function mapHit(layout: ReturnType<typeof mapLayout>, point: Vec): number | null {
  return layout.circles.find((circle) => Math.hypot(point.x - circle.center.x, point.y - circle.center.y) <= circle.radius)?.id ?? null;
}
