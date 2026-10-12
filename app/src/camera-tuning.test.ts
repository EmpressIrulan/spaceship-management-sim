import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.doUnmock("sim"); vi.resetModules(); });

describe("camera follows both tuning numbers", () => {
  it("caps asteroid picking at the camera's own minimum instead of an old literal", async () => {
    const { MIN_ZOOM, hoveredBody } = await import("./camera");
    const { createInitialState } = await import("sim");
    const state = createInitialState(7), asteroid = state.asteroids[0]!;
    state.stations = []; state.ships = []; state.bugs = []; state.hives = []; state.asteroids = [asteroid];
    expect(hoveredBody(state, { center: asteroid.position, zoom: MIN_ZOOM }, { width: 800, height: 600 }, { x: 406, y: 300 }))
      .toEqual({ kind: "asteroid", id: asteroid.id });
  });
  it.each([[0.5, 2], [0.25, 8]])("preserves screen framing when size=%s and distance=%s", async (size, distance) => {
    vi.resetModules();
    vi.doMock("sim", async importOriginal => ({
      ...await importOriginal<typeof import("sim")>(), SIZE_MULTIPLIER: size, GATE_DISTANCE: 480 * distance,
    }));
    const { homeCamera, MIN_ZOOM, MAX_ZOOM, hoveredBody } = await import("./camera");
    const bodies = [{ position: { x: 40 * size, y: 0 }, size: { width: 30 * size, height: 40 * size } }];
    const opening = homeCamera(bodies);
    expect(opening.zoom * size).toBeCloseTo(1);
    expect(bodies[0]!.size.width * opening.zoom).toBeCloseTo(30);
    expect(MAX_ZOOM * size).toBeCloseTo(8);
    expect(2 * 480 * distance * MIN_ZOOM).toBeCloseTo(480);

    const { createInitialState } = await import("sim");
    const state = createInitialState(7), asteroid = state.asteroids[0]!;
    state.stations = []; state.ships = []; state.bugs = []; state.hives = []; state.asteroids = [asteroid];
    // Six screen pixels off a tiny rock's centre is inside its 16px pick floor
    // at the derived minimum; the former fixed 0.2 cap fails this relation.
    expect(hoveredBody(state, { center: asteroid.position, zoom: MIN_ZOOM }, { width: 800, height: 600 }, { x: 406, y: 300 }))
      .toEqual({ kind: "asteroid", id: asteroid.id });
  });
});
