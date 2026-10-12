import { describe, expect, it } from "vitest";
import { STARTING_SHIP, type ShipDesign } from "sim";
import { drawBlockOutline } from "./ship-rendering";

// Rasterize the integer-aligned rectangles and paths used by the outline.
// This measures covered pixels, including overlap, rather than draw-call counts.
function coverage(design: ShipDesign, size: number) {
  const pixels = new Set<string>();
  const paint = (x: number, y: number, w: number, h: number) => {
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      if (px + 0.5 >= x && px + 0.5 < x + w && py + 0.5 >= y && py + 0.5 < y + h) pixels.add(`${px},${py}`);
    }
  };
  const context = {
    save() {}, restore() {}, beginPath() {}, fill() {},
    rect: paint,
    strokeRect(x: number, y: number, w: number, h: number) {
      paint(x - 0.5, y - 0.5, w + 1, 1);
      paint(x - 0.5, y + h - 0.5, w + 1, 1);
      paint(x - 0.5, y - 0.5, 1, h + 1);
      paint(x + w - 0.5, y - 0.5, 1, h + 1);
    },
  } as unknown as CanvasRenderingContext2D;
  drawBlockOutline(context, design, 0, 0, size, size);
  return pixels;
}

describe("block outline pixel coverage", () => {
  it("leaves the starting miner untouched below four screen pixels per block", () => {
    for (const size of [2, 5, 9, 15]) expect(coverage(STARTING_SHIP, size).size).toBe(0);
  });

  it.each([18, 36, 72])("keeps most colour pixels clear and four countable cells at size %i", size => {
    const pixels = coverage(STARTING_SHIP, size);
    expect(pixels.size).toBeGreaterThan(0);
    expect(pixels.size / (size * size)).toBeLessThan(0.5);
    const boundaries = [0, 1, 2, 3, 4].map(i => Math.min(size - 1, Math.round(i * size / 4)));
    const middle = 2;
    const vertical = Array.from({ length: size }, (_, x) => x).filter(x => pixels.has(`${x},${middle}`));
    expect(vertical).toEqual(boundaries);
    const horizontal = Array.from({ length: size }, (_, y) => y).filter(y => pixels.has(`${middle},${y}`));
    expect(horizontal).toEqual(boundaries);
  });

  it("does not draw into an empty square", () => {
    const design: ShipDesign = { width: 3, height: 3, slots: Array(9).fill("Hull") };
    design.slots[4] = null;
    const pixels = coverage(design, 24);
    for (let y = 8; y < 16; y++) for (let x = 8; x < 16; x++) expect(pixels.has(`${x},${y}`)).toBe(false);
  });
});
