import type { SimState, Size, Vec } from "sim";

// Placeholder limits. Revisit when sectors get bigger than one station and
// one asteroid and the client wants to see more of them at once.
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

export function zoomAt(camera: Camera, viewport: Viewport, cursor: Vec, factor: number): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor));
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

function insideRect(point: Vec, center: Vec, size: Size): boolean {
  return (
    Math.abs(point.x - center.x) <= size.width / 2 &&
    Math.abs(point.y - center.y) <= size.height / 2
  );
}

export function hitsStation(
  state: SimState,
  camera: Camera,
  viewport: Viewport,
  screenPoint: Vec,
): boolean {
  const world = screenToWorld(camera, viewport, screenPoint);
  return insideRect(world, state.station.position, state.station.size);
}

// `pointer` is null once the mouse has left the canvas.
export function hoveringStation(
  state: SimState,
  camera: Camera,
  viewport: Viewport,
  pointer: Vec | null,
): boolean {
  return pointer !== null && hitsStation(state, camera, viewport, pointer);
}
