import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "sim";
import { createShipDrawing } from "./ship-rendering";
import { createUiState } from "./ui-state";

vi.mock("./ships", () => ({ shipSprite: () => ({}) }));

describe("packed ships", () => {
  it("outlines each occupied ship rectangle, not fixed pads", () => {
    const ui = createUiState([]);
    ui.camera = { center: { x: 0, y: 0 }, zoom: 6 };
    ui.viewport = { width: 800, height: 600 };
    const ctx = { drawImage: vi.fn(), strokeRect: vi.fn(), save: vi.fn(), restore: vi.fn() };
    const drawing = createShipDrawing(ui, ctx as unknown as CanvasRenderingContext2D);
    const ship = { ...createInitialState(7).ships[0]!, position: { x: 0, y: 0 }, state: "unloading" as const, berth: 0 };
    drawing.drawShip(ship);
    expect(ctx.strokeRect).toHaveBeenCalledWith(400 - 27 + 0.5, 300 - 27 + 0.5, 53, 53);
    ctx.strokeRect.mockClear();
    drawing.drawShip({ ...ship, state: "waiting", berth: null });
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });
});
