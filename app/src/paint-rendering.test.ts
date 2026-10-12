import { describe, expect, it, vi } from "vitest";
import { createUiState } from "./ui-state";
import { createPaintRendering } from "./paint-rendering";
import * as shipRendering from "./ship-rendering";

vi.mock("./ships", () => ({ shipSprite: () => ({}) }));

describe("Build ship design outlines", () => {
  it("draws the shared block outline over the design picture", () => {
    const ui = createUiState([]);
    ui.paintView.zoom = 1;
    ui.paintCanvas = {
      width: 100, height: 80, clientWidth: 100, clientHeight: 80,
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    ui.draft.cells.set("0,0", "Engine");
    const context = {
      imageSmoothingEnabled: true, fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn(),
      save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const outline = vi.spyOn(shipRendering, "drawBlockOutline");
    const rendering = createPaintRendering(ui, () => ({}) as never, {
      partTip: {} as HTMLElement, shipPanelBox: { querySelector: () => null } as unknown as HTMLElement,
      paintViewport: () => ({ width: 100, height: 80 }), paintPointAt: () => ({ x: 0, y: 0 }),
    });

    rendering.drawPaintCanvas();

    expect(outline).toHaveBeenCalledOnce();
    expect(outline.mock.calls[0]?.[1].slots).toContain("Engine");
  });
});
