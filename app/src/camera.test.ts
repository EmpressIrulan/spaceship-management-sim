import { describe, expect, it } from "vitest";
import { createInitialState, type Bug, type Drop, type Hive } from "sim";
import { miningStart } from "./test-mining";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  fitCamera,
  hoveredBody,
  panBy,
  screenToWorld,
  worldToScreen,
  wheelZoomFactor,
  zoomAt,
  type Camera,
} from "./camera";
import { orderTargetAt } from "./selection";

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
  it("shows the station and every asteroid on screen for any seed, even on a short window", () => {
    const short = { width: 900, height: 500 };
    for (let seed = 0; seed < 200; seed += 1) {
      const state = createInitialState(seed);
      const bodies = [state.stations[0]!.dock, state.stations[0]!.storage, ...state.asteroids];
      const camera = fitCamera(short, bodies);
      for (const body of bodies) {
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
    expect(
      fitCamera({ width: 4000, height: 3000 }, [
        state.stations[0]!.dock,
        state.stations[0]!.storage,
        ...state.asteroids,
      ]).zoom,
    ).toBe(1);
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

describe("hovering", () => {
  const state = miningStart(7);
  const asteroid = state.asteroids[2]!;

  it("points at the Dock wherever the camera has moved it", () => {
    const cameras: Camera[] = [
      home,
      { center: { x: 200, y: -150 }, zoom: 0.5 },
      { center: { x: -40, y: 30 }, zoom: 3 },
    ];
    for (const camera of cameras) {
      const dockSurface = { x: state.stations[0]!.dock.position.x + 7, y: state.stations[0]!.dock.position.y + 12 };
      const onScreen = worldToScreen(camera, viewport, dockSurface);
      expect(hoveredBody(state, camera, viewport, onScreen)).toEqual({ kind: "dock", stationId: 0 });
    }
  });

  it("points at an asteroid by its id", () => {
    const onScreen = worldToScreen(home, viewport, asteroid.position);
    expect(hoveredBody(state, home, viewport, onScreen)).toEqual({
      kind: "asteroid",
      id: asteroid.id,
    });
  });

  it("still catches a small asteroid when zoomed out", () => {
    const zoomedOut: Camera = { center: { x: 0, y: 0 }, zoom: 0.5 };
    const onScreen = worldToScreen(zoomedOut, viewport, asteroid.position);
    const nearby = { x: onScreen.x + 6, y: onScreen.y - 6 };
    expect(hoveredBody(state, zoomedOut, viewport, nearby)).toEqual({
      kind: "asteroid",
      id: asteroid.id,
    });
  });

  it("lets a zoomed-out asteroid win over the mining ship beside it", () => {
    const ship = state.ships[0]!;
    const target = state.asteroids.find((candidate) => candidate.id === ship.target!.asteroidId)!;
    const mining = {
      ...state,
      ships: [{ ...ship, state: "working" as const, position: { ...ship.target!.site } }],
    };
    const zoomedOut: Camera = { center: { x: 0, y: 0 }, zoom: MIN_ZOOM };
    // At minimum zoom the hit-area floors overlap between the nearby ship and
    // asteroid. This point is inside both, close to the ship.
    const overlap = {
      x: mining.ships[0]!.position.x + (target.position.x - mining.ships[0]!.position.x) * 0.1,
      y: mining.ships[0]!.position.y + (target.position.y - mining.ships[0]!.position.y) * 0.1,
    };
    const pointer = worldToScreen(zoomedOut, viewport, overlap);

    expect(hoveredBody(mining, zoomedOut, viewport, pointer)).toEqual({
      kind: "asteroid",
      id: target.id,
    });
  });

  it("points at nothing over empty space or once the pointer has left the canvas", () => {
    expect(hoveredBody(state, home, viewport, { x: 5, y: 5 })).toBeNull();
    expect(hoveredBody(state, home, viewport, null)).toBeNull();
  });

  it("does not hover home bodies when viewing sector 1", () => {
    const seeded = createInitialState(19);
    const homeRock = seeded.asteroids.find((rock) => rock.sectorId === 0)!;
    const emptyCentre = worldToScreen(home, viewport, { x: 0, y: 0 });
    const homeRockPoint = worldToScreen(home, viewport, homeRock.position);

    expect(hoveredBody(seeded, home, viewport, emptyCentre, 1)).toBeNull();
    const hovered = hoveredBody(seeded, home, viewport, homeRockPoint, 1);
    expect(hovered).toBeNull();
    expect(orderTargetAt(seeded, hovered, homeRock.position, 1)).toEqual({ kind: "move", point: homeRock.position, sectorId: 1 });
  });
});

describe("hovering the enemies", () => {
  // Bodies alone at chosen points, so the pointer never has to guess what it
  // is over: the home station's own bodies stay at Home, everything else is
  // cleared.
  const seeded = createInitialState(7);
  const hive: Hive = { ...seeded.hives![0]!, position: { x: 400, y: 0 } };
  const bug: Bug = { id: 9, hiveId: hive.id, sectorId: hive.sectorId, position: { x: 420, y: 0 }, hp: 6, maxHp: 6, state: "hovering", targetShipId: null, leg: null, timer: 1 };
  const drop: Drop = { id: 4, sectorId: hive.sectorId, kind: "bugJuice", position: { x: 460, y: 0 } };
  const state = { ...seeded, hives: [hive], bugs: [bug], drops: [drop] };
  const sector = hive.sectorId;

  it("points at the hive, a bug and a drop by id", () => {
    const onHive = worldToScreen(home, viewport, hive.position);
    const onBug = worldToScreen(home, viewport, bug.position);
    const onDrop = worldToScreen(home, viewport, drop.position);
    expect(hoveredBody(state, home, viewport, onHive, sector)).toEqual({ kind: "hive", id: hive.id });
    expect(hoveredBody(state, home, viewport, onBug, sector)).toEqual({ kind: "bug", id: bug.id });
    expect(hoveredBody(state, home, viewport, onDrop, sector)).toEqual({ kind: "drop", id: drop.id });
  });

  it("still catches them when zoomed out", () => {
    const zoomedOut: Camera = { center: { x: 0, y: 0 }, zoom: 0.5 };
    const onBug = worldToScreen(zoomedOut, viewport, { x: bug.position.x + 5, y: bug.position.y });
    expect(hoveredBody(state, zoomedOut, viewport, onBug, sector)).toEqual({ kind: "bug", id: bug.id });
  });

  it("closes once the hovered hive, bug or drop is gone", () => {
    const onHive = worldToScreen(home, viewport, hive.position);
    expect(hoveredBody({ ...state, hives: [] }, home, viewport, onHive, sector)).toBeNull();
    const onBug = worldToScreen(home, viewport, bug.position);
    expect(hoveredBody({ ...state, bugs: [] }, home, viewport, onBug, sector)).toBeNull();
    const onDrop = worldToScreen(home, viewport, drop.position);
    expect(hoveredBody({ ...state, drops: [] }, home, viewport, onDrop, sector)).toBeNull();
  });

  it("closes once the hovered hive is dead", () => {
    const onHive = worldToScreen(home, viewport, hive.position);
    const dead = { ...hive, hp: 0, alive: false };
    expect(hoveredBody({ ...state, hives: [dead] }, home, viewport, onHive, sector)).toBeNull();
  });

  it("does not hover hive bodies when viewing another sector", () => {
    const onHive = worldToScreen(home, viewport, hive.position);
    const onBug = worldToScreen(home, viewport, bug.position);
    const onDrop = worldToScreen(home, viewport, drop.position);
    expect(hoveredBody(state, home, viewport, onHive)).toBeNull();
    expect(hoveredBody(state, home, viewport, onBug)).toBeNull();
    expect(hoveredBody(state, home, viewport, onDrop)).toBeNull();
  });
});
