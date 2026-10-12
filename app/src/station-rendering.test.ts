import { describe, expect, it } from "vitest";
import { createInitialState } from "sim";
import { createUiState } from "./ui-state";
import { createStationDrawing } from "./station-rendering";

function fixture(zoom: number) {
  const state = createInitialState(7), ui = createUiState([]);
  ui.camera = { center: { x: 0, y: 0 }, zoom };
  ui.viewport = { width: 800, height: 700 };
  const widths: number[] = [];
  const ctx = new Proxy({ lineWidth: 1, stroke() { widths.push(this.lineWidth); } }, {
    get(target, key) { return Reflect.get(target, key) ?? (() => {}); },
  }) as unknown as CanvasRenderingContext2D;
  return { state, widths, drawing: createStationDrawing(ui, () => state, ctx, () => {}, () => {}) };
}

describe("scaled station strokes", () => {
  it("keeps Storage's details the same thickness as main at corresponding opening and maximum zoom", () => {
    for (const [zoom, oldZoom] of [[3, 1], [24, 8]] as const) {
      const f = fixture(zoom);
      f.drawing.drawStationModule(f.state.stations[0]!.modules[1]!);
      expect(f.widths).toEqual([2 * oldZoom, oldZoom, oldZoom, oldZoom]);
    }
  });
  it("keeps connectors the same thickness as main at corresponding zoom", () => {
    for (const [zoom, oldZoom] of [[3, 1], [24, 8]] as const) {
      const f = fixture(zoom);
      f.drawing.drawStationConnector({ x: 0, y: 0 }, f.state.stations[0]!.storage.position);
      expect(f.widths).toEqual([7 * oldZoom, 2 * oldZoom]);
    }
  });
});
