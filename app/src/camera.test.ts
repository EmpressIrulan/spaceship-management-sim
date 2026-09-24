import { describe, expect, it } from "vitest";
import { createInitialState } from "sim";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  fitCamera,
  hitsStation,
  hoveringStation,
  panBy,
  screenToWorld,
  worldToScreen,
  wheelZoomFactor,
  zoomAt,
  type Camera,
} from "./camera";

const viewport = { width: 800, height: 600 };
const home: Camera = { center: { x: 0, y: 0 }, zoom: 1 };

describe("camera", () => {
  it("draws the camera centre in the middle of the screen", () => {
    expect(worldToScreen(home, viewport, { x: 0, y: 0 })).toEqual({ x: 400, y: 300 });
  });

  it("scales distances on screen with zoom", () => {
    const zoomed = { ...home, zoom: 2 };
    expect(worldToScreen(zoomed, viewport, { x: 50, y: -25 })).toEqual({ x: 500, y: 250 });
  });

  it("round-trips between screen and world", () => {
    const camera: Camera = { center: { x: 130, y: -70 }, zoom: 1.7 };
    const world = screenToWorld(camera, viewport, { x: 123, y: 456 });
    const back = worldToScreen(camera, viewport, world);
    expect(back.x).toBeCloseTo(123);
    expect(back.y).toBeCloseTo(456);
  });

  it("keeps the point under the cursor fixed while zooming", () => {
    const cursor = { x: 620, y: 140 };
    const before = screenToWorld(home, viewport, cursor);
    const zoomedIn = zoomAt(home, viewport, cursor, 1.5);
    const after = screenToWorld(zoomedIn, viewport, cursor);

    expect(zoomedIn.zoom).toBeCloseTo(1.5);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("clamps zoom so the sector cannot vanish or blow up", () => {
    expect(zoomAt(home, viewport, { x: 0, y: 0 }, 1e6).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(home, viewport, { x: 0, y: 0 }, 1e-6).zoom).toBe(MIN_ZOOM);
  });

  it("moves the world with the mouse when dragging", () => {
    const zoomed: Camera = { center: { x: 10, y: 10 }, zoom: 2 };
    const worldPoint = { x: 40, y: -20 };
    const before = worldToScreen(zoomed, viewport, worldPoint);
    const after = worldToScreen(panBy(zoomed, 30, -12), viewport, worldPoint);

    expect(after.x).toBeCloseTo(before.x + 30);
    expect(after.y).toBeCloseTo(before.y - 12);
  });
});

describe("starting view", () => {
  it("shows the station and asteroid on screen for any seed, even on a short window", () => {
    const short = { width: 900, height: 500 };
    for (let seed = 0; seed < 200; seed += 1) {
      const state = createInitialState(seed);
      const camera = fitCamera(short, [state.station, state.asteroid]);
      for (const body of [state.station, state.asteroid]) {
        const topLeft = worldToScreen(camera, short, {
          x: body.position.x - body.size.width / 2,
          y: body.position.y - body.size.height / 2,
        });
        const bottomRight = worldToScreen(camera, short, {
          x: body.position.x + body.size.width / 2,
          y: body.position.y + body.size.height / 2,
        });
        expect(topLeft.x).toBeGreaterThanOrEqual(0);
        expect(topLeft.y).toBeGreaterThanOrEqual(0);
        expect(bottomRight.x).toBeLessThanOrEqual(short.width);
        expect(bottomRight.y).toBeLessThanOrEqual(short.height);
      }
    }
  });

  it("does not zoom in past 1:1 when everything already fits", () => {
    const state = createInitialState(7);
    expect(fitCamera({ width: 4000, height: 3000 }, [state.station, state.asteroid]).zoom).toBe(1);
  });
});

describe("scroll wheel", () => {
  it("zooms in on scroll up and out on scroll down", () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
  });

  it("leaves zoom alone for a purely sideways scroll", () => {
    expect(wheelZoomFactor(0)).toBe(1);
  });
});

describe("hovering the station", () => {
  const state = createInitialState(7);

  it("shows the menu while the pointer is over the station", () => {
    const onScreen = worldToScreen(home, viewport, state.station.position);
    expect(hoveringStation(state, home, viewport, onScreen)).toBe(true);
  });

  it("hides it when the pointer is elsewhere or has left the canvas", () => {
    expect(hoveringStation(state, home, viewport, { x: 5, y: 5 })).toBe(false);
    expect(hoveringStation(state, home, viewport, null)).toBe(false);
  });
});

describe("pointing at the station", () => {
  const state = createInitialState(7);

  it("hits the station wherever the camera has moved it", () => {
    const cameras: Camera[] = [
      home,
      { center: { x: 200, y: -150 }, zoom: 0.5 },
      { center: { x: -40, y: 30 }, zoom: 3 },
    ];
    for (const camera of cameras) {
      const onScreen = worldToScreen(camera, viewport, state.station.position);
      expect(hitsStation(state, camera, viewport, onScreen)).toBe(true);
    }
  });

  it("misses when clicking empty space or the asteroid", () => {
    expect(hitsStation(state, home, viewport, { x: 5, y: 5 })).toBe(false);
    const asteroid = worldToScreen(home, viewport, state.asteroid.position);
    expect(hitsStation(state, home, viewport, asteroid)).toBe(false);
  });
});
