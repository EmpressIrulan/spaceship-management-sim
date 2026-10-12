import { describe, expect, it } from "vitest";
import { createInitialState } from "sim";
import { hoveredBody, MIN_ZOOM } from "./camera";

describe("screen-pixel ship hover floor", () => {
  it.each([MIN_ZOOM, 0.75, 1.5])("keeps an eight-pixel pick box for a small ship at zoom %s", zoom => {
    const state = createInitialState(7);
    state.stations = []; state.asteroids = []; state.bugs = []; state.hives = [];
    state.ships[0] = { ...state.ships[0]!, position: { x: 0, y: 0 } };
    const camera = { center: { x: 0, y: 0 }, zoom }, viewport = { width: 800, height: 600 };
    expect(hoveredBody(state, camera, viewport, { x: 403.9, y: 300 })).toEqual({ kind: "ship", index: 0 });
    expect(hoveredBody(state, camera, viewport, { x: 404.1, y: 300 })).toBeNull();
  });
});
