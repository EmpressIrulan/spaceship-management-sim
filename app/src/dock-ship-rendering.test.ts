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

describe("ship block outlines", () => {
  it("outlines occupied cells only, in screen space at the current zoom", () => {
    const ui = createUiState([]);
    ui.camera = { center: { x: 0, y: 0 }, zoom: 2 };
    ui.viewport = { width: 800, height: 600 };
    const ctx = {
      drawImage: vi.fn(), strokeRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const drawing = createShipDrawing(ui, ctx);
    const ship = {
      ...createInitialState(7).ships[0]!,
      position: { x: 0, y: 0 },
      design: { width: 3, height: 2, slots: ["Engine", null, "Hull", null, "Laser", null] as ("Engine" | "Hull" | "Laser" | null)[] },
    };

    drawing.drawShip(ship, true);

    expect(ctx.strokeRect).toHaveBeenCalledTimes(3);
    expect(ctx.strokeRect).toHaveBeenNthCalledWith(1, 393 + 0.5, 296 + 0.5, 4, 4);
    expect(ctx.strokeRect).toHaveBeenNthCalledWith(2, 402 + 0.5, 296 + 0.5, 4, 4);
    expect(ctx.strokeRect).toHaveBeenNthCalledWith(3, 398 + 0.5, 301 + 0.5, 3, 3);
  });

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
