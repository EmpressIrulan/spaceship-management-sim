import { describe, expect, it } from "vitest";
import { MODULE_SPACING, STORAGE_SIZE, type StationModule } from "sim";
import { moduleAppearance, stationConnectors } from "./station-appearance";

const module = (type: StationModule["type"], x: number, y: number): StationModule => ({
  type,
  position: { x, y },
  size: STORAGE_SIZE,
});

describe("station appearance", () => {
  it("joins neighbouring modules vertically and sideways without duplicating links", () => {
    const modules = [
      module("Dock", 0, 0),
      module("Storage", 0, MODULE_SPACING),
      module("Builder", MODULE_SPACING, MODULE_SPACING),
      module("Storage", 2 * MODULE_SPACING, MODULE_SPACING),
    ];

    expect(stationConnectors(modules)).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 0, y: MODULE_SPACING } },
      { from: { x: 0, y: MODULE_SPACING }, to: { x: MODULE_SPACING, y: MODULE_SPACING } },
      { from: { x: MODULE_SPACING, y: MODULE_SPACING }, to: { x: 2 * MODULE_SPACING, y: MODULE_SPACING } },
    ]);
  });

  it("gives every module type a distinct silhouette and colour accent", () => {
    const appearances = ["Dock", "Storage", "Builder", "Turret", "Claim"].map((type) =>
      moduleAppearance(type as StationModule["type"]),
    );

    expect(appearances.map(({ silhouette }) => silhouette)).toEqual(["open-bay", "tank-cluster", "crane", "turret", "beacon"]);
    expect(new Set(appearances.map(({ accent }) => accent)).size).toBe(5);
  });
});
