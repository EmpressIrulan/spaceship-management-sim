import type { Ship, SimState, Vec } from "sim";
import type { Hovered, Viewport } from "./camera";

export function mapToggled(open: boolean, key: string): boolean {
  if (key === "m" || key === "M") return !open;
  if (key === "Escape") return false;
  return open;
}

// Ships drawn in a sector. A ship inside a gate is in neither.
export function shipsIn(state: SimState, sectorId: number): { ship: Ship; index: number }[] {
  return state.ships
    .map((ship, index) => ({ ship, index }))
    .filter(({ ship }) => ship.sectorId === sectorId && ship.state !== "jumpingOut" && ship.state !== "jumpingHome");
}

export interface MapCircle {
  id: number;
  name: string;
  center: Vec;
  radius: number;
  // Counts a ship inside a gate in the sector it is leaving.
  ships: number;
}

export interface MapLayout {
  circles: MapCircle[];
  links: { from: Vec; to: Vec }[];
}

// Screen space. Sectors sit in a row across the middle of the screen until
// there are enough of them to need real map positions.
export function mapLayout(state: SimState, viewport: Viewport): MapLayout {
  const radius = Math.max(30, Math.min(70, viewport.width / (4 * state.sectors.length)));
  const circles = state.sectors.map((sector, index) => ({
    id: sector.id,
    name: sector.name,
    center: {
      x: Math.round(viewport.width * (index + 1) / (state.sectors.length + 1)),
      y: Math.round(viewport.height / 2),
    },
    radius,
    ships: state.ships.filter((ship) => ship.sectorId === sector.id).length,
  }));
  const links = state.sectors
    .filter((sector) => sector.id < sector.gate.to)
    .map((sector) => ({ from: circles[sector.id]!.center, to: circles[sector.gate.to]!.center }));
  return { circles, links };
}

export function mapHit(layout: MapLayout, point: Vec): number | null {
  const circle = layout.circles.find(
    (c) => Math.hypot(point.x - c.center.x, point.y - c.center.y) <= c.radius,
  );
  return circle ? circle.id : null;
}

// Left click: a ship becomes the selection, empty space clears it, and
// anything else leaves it alone.
export function clickSelection(selected: number[], hovered: Hovered | null): number[] {
  if (!hovered) return [];
  if (hovered.kind === "ship") return [hovered.index];
  return selected;
}
