import { MATERIALS, haulDestinations, haulStations, type DefaultBehaviour, type HaulRoute, type HaulStation, type HaulDestination, type HaulStationId, type HaulDestinationId, type Material, type OrderTarget, type SimState, type Vec } from "sim";
import { screenToWorld, type Camera, type Hovered, type Viewport } from "./camera";
import { intoSite, orderLabel, shipStatus } from "./ships";

const DRAG_THRESHOLD = 4;
export const ORDER_LINE_SECONDS = 1;
export function isBoxDrag(a: Vec, b: Vec): boolean { return Math.hypot(b.x - a.x, b.y - a.y) > DRAG_THRESHOLD; }
export function shipsInBox(state: SimState, camera: Camera, viewport: Viewport, sectorId: number, a: Vec, b: Vec): number[] {
  const p = screenToWorld(camera, viewport, a); const q = screenToWorld(camera, viewport, b);
  return state.ships.filter((s) => s.state !== "docked" && s.sectorId === sectorId && s.position.x >= Math.min(p.x, q.x) && s.position.x <= Math.max(p.x, q.x)
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
  // A construction site is a supply order for the station that owns it: Home
  // for id 0, the founding site's station otherwise.
  if (hovered?.kind === "constructionSite") return { kind: "supplyBuild", stationId: hovered.id };
  if (hovered?.kind === "asteroid") return { kind: "mine", asteroidId: hovered.id };
  if (hovered?.kind === "dock" || (hovered?.kind === "module" && homeStation(state).modules[hovered.index]?.type === "Dock")) return { kind: "home" };
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
// Display version of HaulRoute that allows "mixed" sentinels for divergent fields.
export interface DisplayHaulRoute {
  from: HaulStationId | "mixed";
  to: HaulDestinationId | "mixed";
  material: Material | "mixed";
}
export interface SelectionPanel {
  rows: { id: number; name: string; status: string }[];
  defaultBehaviour: DefaultBehaviour | "mixed";
  materials: MaterialBox[] | null;
  mineOtherSectors: "on" | "off" | "mixed" | null;
  canResume: boolean;
  canHaul: boolean;
  haulDisabledReason: string | null;
  stations: HaulStation[];
  destinations: HaulDestination[];
  haulRoute: DisplayHaulRoute | null;
  homeStation: number | null | "mixed";
}
export function selectionPanel(state: SimState, ids: number[]): SelectionPanel | null {
  const ships = ids.flatMap((id) => { const ship = state.ships.find((item) => item.id === id); return ship ? [ship] : []; });
  if (!ships.length) return null;
  const defaults = new Set(ships.map((ship) => ship.defaultBehaviour));
  const homes = new Set(ships.map((ship) => ship.homeStationId === undefined ? 0 : ship.homeStationId));
  const haulers = ships.filter((ship) => ship.defaultBehaviour === "haul");
  const stations = haulStations(state);
  const routes = new Set(haulers.map((ship) => JSON.stringify(ship.haulRoute ?? null)));
  const otherSectorSettings = new Set(ships.map((ship) => !!ship.mineOtherSectors));
  // Compute mixed haul route when selected ships have different routes.
  let haulRoute: DisplayHaulRoute | null = null;
  if (routes.size === 1) {
    const route = haulers[0]?.haulRoute ?? null;
    haulRoute = route ? { from: route.from, to: route.to, material: route.material } : null;
  } else if (routes.size > 1) {
    // Multiple different routes: compute per-field agreement.
    const fromValues = new Set(haulers.map((ship) => ship.haulRoute?.from ?? null));
    const toValues = new Set(haulers.map((ship) => ship.haulRoute?.to ?? null));
    const materialValues = new Set(haulers.map((ship) => ship.haulRoute?.material ?? null));
    haulRoute = {
      from: fromValues.size === 1 ? haulers.find((ship) => ship.haulRoute?.from)?.haulRoute?.from ?? "mixed" : "mixed",
      to: toValues.size === 1 ? haulers.find((ship) => ship.haulRoute?.to)?.haulRoute?.to ?? "mixed" : "mixed",
      material: materialValues.size === 1 ? haulers.find((ship) => ship.haulRoute?.material)?.haulRoute?.material ?? "mixed" : "mixed",
    };
  }
  return { rows: ships.map((ship) => ({ id: ship.id, name: `Ship ${ship.id + 1}`, status: ship.order && !intoSite(ship)
    ? `${orderLabel(ship.order)}${ship.state === "holding" ? " (holding)" : ""}` : shipStatus(state, ship) })),
    defaultBehaviour: defaults.size === 1 ? ships[0]!.defaultBehaviour : "mixed",
    materials: defaults.size === 1 && (ships[0]!.defaultBehaviour === "mine" || ships[0]!.defaultBehaviour === "supply") ? MATERIALS.map((material) => {
      const count = ships.filter((ship) => ship.mineMaterials.includes(material)).length;
      return { material, ticked: count === ships.length ? "on" : count === 0 ? "off" : "mixed" } as MaterialBox;
    }) : null,
    mineOtherSectors: defaults.size === 1 && ships[0]!.defaultBehaviour === "mine"
      ? otherSectorSettings.size === 1 ? ships[0]!.mineOtherSectors ? "on" : "off" : "mixed"
      : null,
    canResume: ships.some((ship) => ship.order !== null),
    canHaul: stations.length >= 1, haulDisabledReason: stations.length >= 1 ? null : "Needs a station", stations, destinations: haulDestinations(state),
      haulRoute, homeStation: homes.size === 1 ? (ships[0]!.homeStationId === undefined ? 0 : ships[0]!.homeStationId) : "mixed" };
}
import { homeStation } from "sim";
