import type { Station, Vec } from "sim";

// Match the zoom threshold used to replace module silhouettes with markers.
export const STATION_MARKER_DETAIL_MIN_PX = 8;
const STATION_MARKER_LABEL_HEIGHT_PX = 12;
const STATION_MARKER_LABEL_GAP_PX = 5;
const STATION_MARKER_CHARACTER_WIDTH_PX = 7;

export function stationMarkerVisible(station: Station, zoom: number): boolean {
  return station.modules.length > 0 && station.modules.every((module) =>
    Math.min(module.size.width, module.size.height) * zoom < STATION_MARKER_DETAIL_MIN_PX,
  );
}

export function stationMarkerHit(station: Station, zoom: number, point: Vec): boolean {
  if (!stationMarkerVisible(station, zoom)) return false;
  const labelHalfWidth = station.name.length * STATION_MARKER_CHARACTER_WIDTH_PX / (2 * zoom);
  const labelTop = station.dock.position.y - (STATION_MARKER_LABEL_GAP_PX + STATION_MARKER_LABEL_HEIGHT_PX) / zoom;
  const labelBottom = station.dock.position.y - STATION_MARKER_LABEL_GAP_PX / zoom;
  return Math.abs(point.x - station.dock.position.x) <= labelHalfWidth
    && point.y >= labelTop && point.y <= labelBottom;
}
