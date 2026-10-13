import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "sim";
import { selectClick } from "./click-selection-input";
import { createUiState } from "./ui-state";
import { worldToScreen } from "./camera";

describe("station marker clicks", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("opens the clicked station panel and double-click flies the camera to station detail", () => {
    const state = createInitialState(7);
    const station = state.stations[0]!;
    const canvas = {} as HTMLCanvasElement;
    const ui = createUiState([]);
    ui.viewport = { width: 800, height: 600 };
    ui.camera = { center: { x: 0, y: 0 }, zoom: 0.01 };
    const markerLabelPoint = { x: station.dock.position.x, y: station.dock.position.y - 11 / ui.camera.zoom };
    const point = worldToScreen(ui.camera, ui.viewport, markerLabelPoint);
    const context = {
      ui,
      getState: () => state,
      setState: vi.fn(),
      canvas,
      storagePanel: {} as HTMLElement,
      closeStoragePanel: vi.fn(),
      openShipMenu: vi.fn(),
      startRename: vi.fn(),
      mousePoint: () => point,
    };
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.spyOn(performance, "now").mockReturnValue(100);
    const click = (detail: number) => ({ target: canvas, detail } as unknown as MouseEvent);

    selectClick(context, click(1), false);
    expect(ui.stationPanelId).toBe(station.id);
    expect(ui.camera).toMatchObject({ center: { x: 0, y: 0 }, zoom: 0.01 });

    selectClick(context, click(2), false);
    expect(frames).toHaveLength(1);
    frames[0]!(550);
    expect(ui.camera.center).toEqual(station.dock.position);
    expect(ui.camera.zoom).toBeGreaterThan(0.01);
  });
});
