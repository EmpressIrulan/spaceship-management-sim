import { describe, expect, it, vi } from "vitest";
import { createInitialState, PIXEL_SIZE } from "sim";
import { createShipDrawing } from "./ship-rendering";
import { createUiState } from "./ui-state";

vi.mock("./ships", () => ({ shipSprite: () => ({}), slotColor: () => "#facc15" }));

describe("packed ships", () => {
  it("outlines each occupied ship rectangle, not fixed pads", () => {
    const ui = createUiState([]);
    ui.camera = { center: { x: 0, y: 0 }, zoom: 6 };
    ui.viewport = { width: 800, height: 600 };
    const ctx = { drawImage: vi.fn(), strokeRect: vi.fn(), save: vi.fn(), restore: vi.fn() };
    const drawing = createShipDrawing(ui, ctx as unknown as CanvasRenderingContext2D);
    const ship = { ...createInitialState(7).ships[0]!, position: { x: 0, y: 0 }, state: "unloading" as const, berth: 0 };
    drawing.drawShip(ship);
    const shipScreenSize = 4 * PIXEL_SIZE * ui.camera.zoom;
    expect(ctx.strokeRect).toHaveBeenCalledWith(400 - shipScreenSize / 2 + 0.5, 300 - shipScreenSize / 2 + 0.5, shipScreenSize - 1, shipScreenSize - 1);
    ctx.strokeRect.mockClear();
    drawing.drawShip({ ...ship, state: "waiting", berth: null });
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });
});

describe("zoomed-out ships", () => {
  it("draws a two-pixel dot in the ship's own colour below two screen pixels", () => {
    const ui = createUiState([]);
    ui.camera = { center: { x: 0, y: 0 }, zoom: 0.01 };
    ui.viewport = { width: 800, height: 600 };
    const ctx = { drawImage: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), save: vi.fn(), restore: vi.fn() };
    const drawing = createShipDrawing(ui, ctx as unknown as CanvasRenderingContext2D);
    drawing.drawShip(createInitialState(7).ships[0]!);
    expect((ctx as { fillStyle?: string }).fillStyle).toBe("#facc15");
    expect(ctx.fillRect).toHaveBeenCalledWith(399, 299, 2, 2);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});

describe("ship block outlines", () => {
  // Occupied-cell geometry and zoom coverage live in block-outline.test.ts.
  it("does not outline blocks unless requested", () => {
    const ui = createUiState([]);
    ui.camera = { center: { x: 0, y: 0 }, zoom: 1 };
    ui.viewport = { width: 800, height: 600 };
    const ctx = { drawImage: vi.fn(), strokeRect: vi.fn(), save: vi.fn(), restore: vi.fn() };
    const drawing = createShipDrawing(ui, ctx as unknown as CanvasRenderingContext2D);
    drawing.drawShip(createInitialState(7).ships[0]!);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });
});
