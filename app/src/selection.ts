import { MATERIALS, claimSiteBuilt, haulStations, type DefaultBehaviour, type HaulRoute, type HaulStation, type Material, type OrderTarget, type SimState, type Vec } from "sim";
import { screenToWorld, type Camera, type Hovered, type Viewport } from "./camera";
import { shipStatus } from "./ships";

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
  if (hovered?.kind === "gateProject") {
    const project = state.gateProjects.find((candidate) => candidate.id === hovered.id);
    return project?.complete ? { kind: "move", point: world, sectorId: currentSector } : { kind: "haulGate", gateId: hovered.id };
  }
  if (hovered?.kind === "claimSite") {
    const site = state.claimSites.find((candidate) => candidate.id === hovered.id);
    return site && !claimSiteBuilt(site) ? { kind: "supplySite", siteId: site.id } : { kind: "move", point: world, sectorId: currentSector };
  }
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
// "mixed" is the half-ticked box, where the selected ships disagree.
export interface MaterialBox { material: Material; ticked: "on" | "off" | "mixed" }
export interface SelectionPanel {
  rows: { id: number; name: string; status: string }[];
  defaultBehaviour: DefaultBehaviour | "mixed";
  materials: MaterialBox[] | null;
  canResume: boolean;
  canHaul: boolean;
  haulDisabledReason: string | null;
  stations: HaulStation[];
  haulRoute: HaulRoute | null;
}
export function selectionPanel(state: SimState, ids: number[]): SelectionPanel | null {
  const ships = ids.flatMap((id) => { const ship = state.ships.find((item) => item.id === id); return ship ? [ship] : []; });
  if (!ships.length) return null;
  const defaults = new Set(ships.map((ship) => ship.defaultBehaviour));
  const stations = haulStations(state);
  const routes = new Set(ships.map((ship) => JSON.stringify(ship.haulRoute ?? null)));
  return { rows: ships.map((ship) => ({ id: ship.id, name: `Ship ${ship.id + 1}`, status: ship.order
    ? `Order: ${ship.order.kind}${ship.state === "holding" ? " (holding)" : ""}` : shipStatus(state, ship) })),
    defaultBehaviour: defaults.size === 1 ? ships[0]!.defaultBehaviour : "mixed",
    materials: defaults.size === 1 && ships[0]!.defaultBehaviour === "mine" ? MATERIALS.map((material) => {
      const count = ships.filter((ship) => ship.mineMaterials.includes(material)).length;
      return { material, ticked: count === ships.length ? "on" : count === 0 ? "off" : "mixed" } as MaterialBox;
    }) : null,
    canResume: ships.some((ship) => ship.order !== null),
    canHaul: stations.length >= 2, haulDisabledReason: stations.length >= 2 ? null : "Needs two stations", stations,
    haulRoute: routes.size === 1 ? ships[0]!.haulRoute ?? null : null };
}
