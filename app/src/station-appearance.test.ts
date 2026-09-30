import { describe, expect, it } from "vitest";
import type { StationModule } from "sim";
import { moduleAppearance, stationConnectors } from "./station-appearance";

const module = (type: StationModule["type"], x: number, y: number): StationModule => ({
  type,
  position: { x, y },
  size: { width: 30, height: 40 },
});

describe("station appearance", () => {
  it("joins neighbouring modules vertically and sideways without duplicating links", () => {
    const modules = [
      module("Dock", 0, 0),
      module("Storage", 0, 40),
      module("Builder", 40, 40),
      module("Storage", 80, 40),
    ];

    expect(stationConnectors(modules)).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 0, y: 40 } },
      { from: { x: 0, y: 40 }, to: { x: 40, y: 40 } },
      { from: { x: 40, y: 40 }, to: { x: 80, y: 40 } },
    ]);
  });

  it("gives Dock, Storage and Builder distinct silhouettes and colour accents", () => {
    const appearances = ["Dock", "Storage", "Builder"].map((type) =>
      moduleAppearance(type as StationModule["type"]),
    );

    expect(appearances.map(({ silhouette }) => silhouette)).toEqual(["open-bay", "tank-cluster", "crane"]);
    expect(new Set(appearances.map(({ accent }) => accent)).size).toBe(3);
  });
});
