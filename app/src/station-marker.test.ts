import { describe, expect, it } from "vitest";
import { createInitialState } from "sim";
import { stationMarkerHit, stationMarkerVisible, STATION_MARKER_DETAIL_MIN_PX } from "./station-marker";
import { hoveredBody, stationMarkerCamera } from "./camera";

describe("station markers", () => {
  const station = createInitialState(7).stations[0]!;

  it("picks a visible marker at its screen-space center, not when station detail is visible", () => {
    expect(stationMarkerVisible(station, 0.01)).toBe(true);
    expect(stationMarkerHit(station, 0.01, { x: station.dock.position.x, y: station.dock.position.y - 11 / 0.01 })).toBe(true);
    expect(stationMarkerHit(station, 0.01, { x: station.dock.position.x + 700, y: station.dock.position.y })).toBe(false);
    expect(stationMarkerVisible(station, 1)).toBe(false);
  });

  it("makes the rendered marker selectable and computes a zoomed-in station view", () => {
    const state = createInitialState(7);
    const dock = state.stations[0]!.dock.position;
    const camera = { center: { x: 0, y: 0 }, zoom: 0.01 };
    const label = { x: dock.x, y: dock.y - 11 / camera.zoom };
    expect(hoveredBody(state, camera, { width: 800, height: 600 }, {
      x: (label.x - camera.center.x) * camera.zoom + 400,
      y: (label.y - camera.center.y) * camera.zoom + 300,
    })?.kind).toBe("dock");
    const target = stationMarkerCamera(camera, state.stations[0]!);
    expect(target.center).toEqual(dock);
    expect(target.zoom).toBeGreaterThan(camera.zoom);
    expect(target.zoom * Math.min(...state.stations[0]!.modules.map((module) => Math.min(module.size.width, module.size.height))))
      .toBeGreaterThanOrEqual(STATION_MARKER_DETAIL_MIN_PX);
  });
});
