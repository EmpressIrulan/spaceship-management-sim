import { afterEach, describe, expect, it, vi } from "vitest";
import { STARTING_SHIP, type ShipDesign } from "sim";
import { createShipThumbnail } from "./ship-thumbnail";

vi.mock("./ships", () => ({ shipSprite: () => ({}) }));
afterEach(() => vi.unstubAllGlobals());

function thumbnail(design: ShipDesign) {
  const covered = new Set<string>();
  const surface = { width: 0, height: 0, style: {}, className: "", getContext: () => context };
  const context = {
    drawImage: vi.fn(), save() {}, restore() {}, beginPath() {}, fill() {},
    rect(x: number, y: number, w: number, h: number) {
      for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) covered.add(`${px},${py}`);
    },
  };
  vi.stubGlobal("document", { createElement: () => surface });
  createShipThumbnail(design);
  return { surface, covered };
}

describe("selection picture", () => {
  it("draws a countable four-by-four miner at a fixed panel size", () => {
    const { surface, covered } = thumbnail(STARTING_SHIP);
    expect(surface.width).toBe(96);
    expect(surface.height).toBe(96);
    expect(covered.size).toBeGreaterThan(0);
    expect(covered.size / (96 * 96)).toBeLessThan(0.5);
    expect(Array.from({ length: 96 }, (_, x) => x).filter(x => covered.has(`${x},2`))).toEqual([0, 24, 48, 72, 95]);
  });

  it("leaves the empty square in a picture transparent", () => {
    const { covered } = thumbnail({ width: 3, height: 3, slots: ["Hull", "Hull", "Hull", "Hull", null, "Hull", "Hull", "Hull", "Hull"] });
    for (let y = 24; y < 48; y++) for (let x = 24; x < 48; x++) expect(covered.has(`${x},${y}`)).toBe(false);
  });

  it("fits a large design in the panel without unreadable lines", () => {
    const { surface, covered } = thumbnail({ width: 100, height: 100, slots: Array(10000).fill("Hull") });
    expect(surface.width).toBeLessThanOrEqual(176);
    expect(surface.height).toBeLessThanOrEqual(120);
    expect(covered.size).toBe(0);
  });
});
