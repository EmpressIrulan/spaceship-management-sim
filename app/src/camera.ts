import { CLAIM_SITE_SIZE, shipSize, type SimState, type Size, type Vec } from "sim";

// Placeholder limits. Revisit when sectors get bigger than one station and
// a handful of asteroids and the client wants to see more of them at once.
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 8;
const WHEEL_ZOOM_STEP = 1.1;
// Screen pixels kept clear around the sector in the starting view.
const FIT_MARGIN_PX = 40;

export interface Camera {
  // World point drawn at the middle of the screen.
  center: Vec;
  // Screen pixels per world unit.
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export function worldToScreen(camera: Camera, viewport: Viewport, point: Vec): Vec {
  return {
    x: (point.x - camera.center.x) * camera.zoom + viewport.width / 2,
    y: (point.y - camera.center.y) * camera.zoom + viewport.height / 2,
  };
}

export function screenToWorld(camera: Camera, viewport: Viewport, point: Vec): Vec {
  return {
    x: (point.x - viewport.width / 2) / camera.zoom + camera.center.x,
    y: (point.y - viewport.height / 2) / camera.zoom + camera.center.y,
  };
}

export interface ZoomLimits {
  min: number;
  max: number;
}

export function zoomAt(
  camera: Camera,
  viewport: Viewport,
  cursor: Vec,
  factor: number,
  limits: ZoomLimits = { min: MIN_ZOOM, max: MAX_ZOOM },
): Camera {
  const zoom = Math.min(limits.max, Math.max(limits.min, camera.zoom * factor));
  const anchor = screenToWorld(camera, viewport, cursor);
  return {
    zoom,
    center: {
      x: anchor.x - (cursor.x - viewport.width / 2) / zoom,
      y: anchor.y - (cursor.y - viewport.height / 2) / zoom,
    },
  };
}

// A purely sideways scroll (trackpad swipe, shift+wheel) leaves zoom alone.
export function wheelZoomFactor(deltaY: number): number {
  if (deltaY === 0) return 1;
  return deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
}

// Starting view: centred on everything given, zoomed out only as far as it
// takes to fit them all on screen.
export function fitCamera(
  viewport: Viewport,
  bodies: { position: Vec; size: Size }[],
): Camera {
  const left = Math.min(...bodies.map((b) => b.position.x - b.size.width / 2));
  const right = Math.max(...bodies.map((b) => b.position.x + b.size.width / 2));
  const top = Math.min(...bodies.map((b) => b.position.y - b.size.height / 2));
  const bottom = Math.max(...bodies.map((b) => b.position.y + b.size.height / 2));

  const fit = Math.min(
    (viewport.width - 2 * FIT_MARGIN_PX) / (right - left),
    (viewport.height - 2 * FIT_MARGIN_PX) / (bottom - top),
  );
  return {
    center: { x: (left + right) / 2, y: (top + bottom) / 2 },
    zoom: Math.max(MIN_ZOOM, Math.min(1, fit)),
  };
}

export function panBy(camera: Camera, dxScreen: number, dyScreen: number): Camera {
  return {
    ...camera,
    center: {
      x: camera.center.x - dxScreen / camera.zoom,
      y: camera.center.y - dyScreen / camera.zoom,
    },
  };
}

// Asteroids are only a few pixels across when zoomed out, so their hover
// area never shrinks below this many screen pixels.
const MIN_HOVER_PX = 16;
const MIN_SHIP_HOVER_PX = 8;

export type Hovered =
  | { kind: "dock" }
  | { kind: "storage" }
  | { kind: "module"; index: number }
  | { kind: "construction" }
  | { kind: "ship"; index: number }
  | { kind: "gateProject"; id: number; end?: number }
  | { kind: "claimSite"; id: number }
  | { kind: "asteroid"; id: number };

function insideRect(point: Vec, center: Vec, size: Size): boolean {
  return (
    Math.abs(point.x - center.x) <= size.width / 2 &&
    Math.abs(point.y - center.y) <= size.height / 2
  );
}

// What the pointer is over. `pointer` is null once the mouse has left the canvas.
export function hoveredBody(
  state: SimState,
  camera: Camera,
  viewport: Viewport,
  pointer: Vec | null,
  currentSector = 0,
  { includeShips = true }: { includeShips?: boolean } = {},
): Hovered | null {
  if (pointer === null) return null;
  const world = screenToWorld(camera, viewport, pointer);
  const floor = MIN_HOVER_PX / camera.zoom;
  const shipFloor = MIN_SHIP_HOVER_PX / camera.zoom;
  const overShip = (index: number): boolean => {
    const ship = state.ships[index]!;
    const size = shipSize(ship.design);
    return insideRect(world, ship.position, {
      width: Math.max(size.width, shipFloor),
      height: Math.max(size.height, shipFloor),
    });
  };
  // Ships parked at the Dock have their own useful status, so they win over
  // the Dock beneath them.
  const parked = (index: number) => ["waiting", "idle", "berthing", "unloading"].includes(state.ships[index]!.state);
  // Zoomed out, the hover boxes of neighbouring ships overlap, so the pointer
  // goes to the ship whose centre is closest.
  const closest = (candidates: { index: number }[]): { kind: "ship"; index: number } | null => {
    let best: number | null = null;
    let bestDistance = Infinity;
    for (const { index } of candidates) {
      const position = state.ships[index]!.position;
      const d = Math.hypot(position.x - world.x, position.y - world.y);
      if (d < bestDistance) { best = index; bestDistance = d; }
    }
    return best === null ? null : { kind: "ship", index: best };
  };
  const ships = state.ships.map((ship, index) => ({ ship, index })).filter(({ ship }) => ship.sectorId === currentSector);
  const stationVisible = state.station.sectorId === currentSector;
  const atStationOrGate = (index: number): boolean => {
    const position = state.ships[index]!.position;
    if (stationVisible && [state.station.dock, state.station.storage, ...state.station.modules,
      ...(state.station.construction ? [state.station.construction] : [])]
      .some((body) => insideRect(position, body.position, body.size))) return true;
    if (state.claimSites.some((site) => site.sectorId === currentSector && insideRect(position, site.position, CLAIM_SITE_SIZE))) return true;
    return state.gateProjects.some((project) => project.ends.some((end) =>
      end.sectorId === currentSector && insideRect(position, end.position, { width: 24, height: 24 }),
    ));
  };
  // A ship physically at a station or gate remains individually selectable,
  // including during its transition into or out of the structure.
  if (includeShips) {
    const atStation = closest(ships.filter(({ index }) => atStationOrGate(index) && overShip(index)));
    if (atStation) return atStation;
    const atRest = closest(ships.filter(({ index }) => parked(index) && overShip(index)));
    if (atRest) return atRest;
  }
  for (const project of state.gateProjects) {
    const end = project.ends.findIndex((candidate) => candidate.sectorId === currentSector);
    if (end >= 0 && insideRect(world, project.ends[end]!.position, { width: 24, height: 24 })) return { kind: "gateProject", id: project.id, end };
  }
  for (const site of state.claimSites) {
    if (site.sectorId === currentSector && insideRect(world, site.position, CLAIM_SITE_SIZE)) return { kind: "claimSite", id: site.id };
  }
  if (stationVisible && insideRect(world, state.station.dock.position, state.station.dock.size)) return { kind: "dock" };
  if (stationVisible && insideRect(world, state.station.storage.position, state.station.storage.size)) {
    return { kind: "storage" };
  }
  if (stationVisible && state.station.construction && insideRect(
    world,
    state.station.construction.position,
    state.station.construction.size,
  )) return { kind: "construction" };
  for (let index = 2; stationVisible && index < state.station.modules.length; index += 1) {
    const module = state.station.modules[index]!;
    if (insideRect(world, module.position, module.size)) return { kind: "module", index };
  }
  for (const asteroid of state.asteroids) {
    if (asteroid.sectorId !== currentSector) continue;
    const area = {
      width: Math.max(asteroid.size.width, floor),
      height: Math.max(asteroid.size.height, floor),
    };
    if (insideRect(world, asteroid.position, area)) {
      return { kind: "asteroid", id: asteroid.id };
    }
  }
  // Moving and working ships must not hide the body they are using when
  // zoomed out, so they come last.
  if (includeShips) {
    for (const { index } of ships) {
      if (!parked(index) && overShip(index)) return { kind: "ship", index };
    }
  }
  return null;
}

// The body a hover refers to, or null if it has gone.
export function bodyOf(
  state: SimState,
  hovered: Hovered,
): { position: Vec; size: Size } | null {
  if (hovered.kind === "dock") return state.station.dock;
  if (hovered.kind === "storage") return state.station.storage;
  if (hovered.kind === "construction") return state.station.construction;
  if (hovered.kind === "module") return state.station.modules[hovered.index] ?? null;
  if (hovered.kind === "ship") {
    const ship = state.ships[hovered.index];
    return ship ? { position: ship.position, size: shipSize(ship.design) } : null;
  }
  if (hovered.kind === "gateProject") {
    const project = state.gateProjects.find((candidate) => candidate.id === hovered.id);
    const end = project?.ends[hovered.end ?? 0];
    return end ? { position: end.position, size: { width: 24, height: 24 } } : null;
  }
  if (hovered.kind === "claimSite") {
    const site = state.claimSites.find((candidate) => candidate.id === hovered.id);
    return site ? { position: site.position, size: CLAIM_SITE_SIZE } : null;
  }
  return state.asteroids.find((a) => a.id === hovered.id) ?? null;
}
