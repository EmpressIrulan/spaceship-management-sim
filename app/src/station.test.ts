import { describe, expect, it } from "vitest";
import { UNLOADING_SECONDS, createInitialState, tick, type SimState } from "sim";
import { MIN_ZOOM, hoveredBody, worldToScreen, type Camera } from "./camera";
import { infoBox } from "./labels";

const viewport = { width: 800, height: 600 };
const camera: Camera = { center: { x: 0, y: 0 }, zoom: 1 };

describe("station module hover", () => {
  it.each([1, 0.5, MIN_ZOOM])(
    "shows the ship at the Dock centre while it unloads there at zoom %s",
    (zoom) => {
      const initial = createInitialState(7);
      const unloading: SimState = {
        ...initial,
        ships: [
          {
            ...initial.ships[0]!,
            state: "unloading",
            position: { ...initial.station.dock.position },
            timer: UNLOADING_SECONDS,
          },
        ],
      };
      const zoomed = { ...camera, zoom };
      const pointer = worldToScreen(zoomed, viewport, unloading.station.dock.position);
      const hovered = hoveredBody(unloading, zoomed, viewport, pointer);

      expect({ hovered, info: infoBox(unloading, hovered) }).toEqual({
        hovered: { kind: "ship", index: 0 },
        info: { title: "Ship", line: "Unloading" },
      });
    },
  );

  it("can hover the ship at the Dock and Storage as separate sprites", () => {
    const state = createInitialState(7);

    expect(
      hoveredBody(
        state,
        camera,
        viewport,
        worldToScreen(camera, viewport, state.station.dock.position),
      ),
    ).toEqual({ kind: "ship", index: 0 });
    expect(
      hoveredBody(
        state,
        camera,
        viewport,
        worldToScreen(camera, viewport, state.station.storage.position),
      ),
    ).toEqual({ kind: "storage" });
  });

  it("still selects the Dock beside a ship unloading there", () => {
    const initial = createInitialState(7);
    const unloading: SimState = {
      ...initial,
      ships: [{
        ...initial.ships[0]!,
        state: "unloading",
        position: { ...initial.station.dock.position },
      }],
    };
    const dockEdge = {
      x: unloading.station.dock.position.x + 12,
      y: unloading.station.dock.position.y,
    };

    expect(hoveredBody(unloading, camera, viewport, worldToScreen(camera, viewport, dockEdge))).toEqual({ kind: "dock" });
  });

  it("shows Dock berth use increasing from zero to one out of six", () => {
    const empty = createInitialState(7);
    expect(infoBox(empty, { kind: "dock" })).toEqual({
      title: "Dock",
      line: "Unloading 0 / 6",
    });

    const unloading: SimState = {
      ...empty,
      ships: [
        {
          ...empty.ships[0]!,
          state: "unloading",
          timer: UNLOADING_SECONDS,
        },
      ],
    };
    expect(infoBox(unloading, { kind: "dock" })).toEqual({
      title: "Dock",
      line: "Unloading 1 / 6",
    });
  });

  it("shows combined Storage use above each material total", () => {
    const initial = createInitialState(7);

    expect(infoBox(initial, { kind: "storage" })).toEqual({
      title: "Storage",
      line: "Stored 40 / 100\nMetal: 20\nIce: 20\nIncome: Metal +0/min, Ice +0/min",
    });
  });

  it("explains that a cargo-carrying ship is waiting because Storage is full", () => {
    const initial = createInitialState(7);
    const waiting: SimState = {
      ...initial,
      station: {
        ...initial.station,
        inventory: { Metal: 80, Ice: 20 },
      },
      ships: [
        {
          ...initial.ships[0]!,
          state: "waiting",
          cargo: 10,
          cargoMaterial: "Metal",
        },
      ],
    };

    expect(infoBox(waiting, { kind: "ship", index: 0 })?.line).toBe(
      "Waiting: storage full",
    );
  });

  it("shows that a ship which reached an asteroid is mining it", () => {
    const initial = createInitialState(7);
    const working: SimState = {
      ...initial,
      ships: [{ ...initial.ships[0]!, state: "working", cargoMaterial: "Ice" }],
    };

    expect(infoBox(working, { kind: "ship", index: 0 })).toEqual({
      title: "Ship",
      line: "Mining Ice",
    });
  });

  it("shows storage-full waiting as soon as a loaded ship reaches the Dock", () => {
    const initial = createInitialState(7);
    const returning: SimState = {
      ...initial,
      station: {
        ...initial.station,
        inventory: { Metal: 80, Ice: 20 },
      },
      ships: [
        {
          ...initial.ships[0]!,
          state: "homebound",
          timer: 1,
          cargo: 10,
          cargoMaterial: "Metal",
        },
      ],
    };

    const arrived = tick(returning, 1);
    expect({
      state: arrived.ships[0]!.state,
      cargo: arrived.ships[0]!.cargo,
      hover: infoBox(arrived, { kind: "ship", index: 0 })?.line,
    }).toEqual({
      state: "waiting",
      cargo: 10,
      hover: "Waiting: storage full",
    });
  });
});
