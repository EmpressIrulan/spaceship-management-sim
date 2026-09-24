import { describe, expect, it } from "vitest";
import { flickerPixels, laserPulse } from "./laser";

describe("laser pulse", () => {
  it("keeps the beam visible but swings its strength over time", () => {
    const samples = Array.from({ length: 200 }, (_, i) => laserPulse(i / 100));
    for (const value of samples) {
      expect(value).toBeGreaterThan(0.2);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.4);
  });
});

describe("impact flicker", () => {
  const impact = { x: 100, y: 50 };

  it("lights a few pixels right at the impact point", () => {
    for (let i = 0; i < 100; i += 1) {
      const pixels = flickerPixels(impact, i / 30);
      expect(pixels.length).toBeGreaterThanOrEqual(2);
      expect(pixels.length).toBeLessThanOrEqual(6);
      for (const p of pixels) {
        expect(Math.abs(p.x - impact.x)).toBeLessThanOrEqual(3);
        expect(Math.abs(p.y - impact.y)).toBeLessThanOrEqual(3);
        expect(Number.isInteger(p.x - impact.x)).toBe(true);
        expect(Number.isInteger(p.y - impact.y)).toBe(true);
      }
    }
  });

  it("changes from moment to moment", () => {
    const frames = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      frames.add(JSON.stringify(flickerPixels(impact, i / 10)));
    }
    expect(frames.size).toBeGreaterThan(5);
  });

  it("is the same for the same moment, so it needs no random source", () => {
    expect(flickerPixels(impact, 3.7)).toEqual(flickerPixels(impact, 3.7));
  });
});
