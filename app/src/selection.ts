import { type DefaultBehaviour, type OrderTarget, type SimState, type Vec } from "sim";
import { screenToWorld, type Camera, type Hovered, type Viewport } from "./camera";

const DRAG_THRESHOLD = 4;
export const ORDER_LINE_SECONDS = 1;
export function isBoxDrag(a: Vec, b: Vec): boolean { return Math.hypot(b.x - a.x, b.y - a.y) > DRAG_THRESHOLD; }
export function shipsInBox(state: SimState, camera: Camera, viewport: Viewport, sectorId: number, a: Vec, b: Vec): number[] {
  const p = screenToWorld(camera, viewport, a); const q = screenToWorld(camera, viewport, b);
  return state.ships.filter((s) => s.sectorId === sectorId && s.position.x >= Math.min(p.x, q.x) && s.position.x <= Math.max(p.x, q.x)
    && s.position.y >= Math.min(p.y, q.y) && s.position.y <= Math.max(p.y, q.y)).map((s) => s.id);
}
export function toggleShip(selected: number[], id: number): number[] {
  return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id].sort((a, b) => a - b);
}
export function orderTargetAt(state: SimState, hovered: Hovered | null, world: Vec, currentSector = 0): OrderTarget {
  if (hovered?.kind === "gateProject") return { kind: "haulGate", gateId: hovered.id };
  if (hovered?.kind === "asteroid") return { kind: "mine", asteroidId: hovered.id };
  if (hovered?.kind === "dock" || (hovered?.kind === "module" && state.station.modules[hovered.index]?.type === "Dock")) return { kind: "home" };
  return { kind: "move", point: world, sectorId: currentSector };
}
export function contextOrderAllowed(mapOpen: boolean): boolean { return !mapOpen; }
export function keyPan(keys: ReadonlySet<string>, dt: number): Vec {
  const held = (...items: string[]) => items.some((item) => keys.has(item) || keys.has(item.toUpperCase()));
  const speed = 500 * dt;
  return { x: (held("a", "ArrowLeft") ? speed : 0) - (held("d", "ArrowRight") ? speed : 0),
    y: (held("w", "ArrowUp") ? speed : 0) - (held("s", "ArrowDown") ? speed : 0) };
}
export function orderLineAlpha(elapsed: number): number { return Math.max(0, 1 - elapsed / ORDER_LINE_SECONDS); }
export interface SelectionPanel { rows: { id: number; name: string; status: string }[]; defaultBehaviour: DefaultBehaviour | "mixed"; canResume: boolean }
export function selectionPanel(state: SimState, ids: number[]): SelectionPanel | null {
  const ships = ids.flatMap((id) => { const ship = state.ships.find((item) => item.id === id); return ship ? [ship] : []; });
  if (!ships.length) return null;
  const defaults = new Set(ships.map((ship) => ship.defaultBehaviour));
  return { rows: ships.map((ship) => ({ id: ship.id, name: `Ship ${ship.id + 1}`, status: ship.order
    ? `Order: ${ship.order.kind}${ship.state === "holding" ? " (holding)" : ""}` : ship.state })),
    defaultBehaviour: defaults.size === 1 ? ships[0]!.defaultBehaviour : "mixed", canResume: ships.some((ship) => ship.order !== null) };
}
