import { describe, expect, it } from "vitest";
import {
  BUILD_SECONDS,
  MODULE_SPACING,
  availableModuleBuildSites,
  createInitialState,
  startModuleBuild,
  tick,
} from "sim";
import {
  buildControlSize,
  buildControlsVisible,
  buildMenuItems,
  pointerInBuildArea,
  dismissBuildMenuForClick,
  dismissBuildMenuForKey,
} from "./building";
import { infoBox } from "./labels";

describe("station building controls", () => {
  it("presents all module choices with their shared cost and disabled state", () => {
    expect(buildMenuItems(createInitialState(7))).toEqual([
      { type: "Dock", cost: "25 Metal, 25 Ice", disabled: true, title: "Needs 25 more Metal and 25 more Ice" },
      { type: "Storage", cost: "25 Metal, 25 Ice", disabled: true, title: "Needs 25 more Metal and 25 more Ice" },
      { type: "Builder", cost: "25 Metal, 25 Ice", disabled: true, title: "Needs 25 more Metal and 25 more Ice" },
    ]);
  });

  it("labels construction with its remaining time and a completed Builder as idle", () => {
    const initial = createInitialState(7);
    const funded = {
      ...initial,
      station: { ...initial.station, constructionSite: { ...initial.station.constructionSite, inventory: { Metal: 50, Ice: 50 } } },
    };
    const building = tick(startModuleBuild(funded, "Builder", { x: -40, y: 0 }), 3);
    expect(infoBox(building, { kind: "construction" })).toEqual({
      title: "Building Builder",
      line: "12 s",
    });

    const built = tick(building, BUILD_SECONDS - 3);
    expect(infoBox(built, { kind: "module", index: 2 })).toEqual({
      title: "Builder",
      line: "Idle",
    });
  });

  it("shows build controls only while the station or a build control is hovered", () => {
    expect(buildControlsVisible(false, false)).toBe(false);
    expect(buildControlsVisible(true, false)).toBe(true);
    expect(buildControlsVisible(false, true)).toBe(true);
  });

  it("dismisses the Add module menu outside it or with Escape", () => {
    expect(dismissBuildMenuForClick(false, false)).toBe(true);
    expect(dismissBuildMenuForClick(true, false)).toBe(false);
    expect(dismissBuildMenuForClick(false, true)).toBe(false);
    expect(dismissBuildMenuForKey("Escape")).toBe(true);
    expect(dismissBuildMenuForKey("Enter")).toBe(false);
  });

  it("keeps the pointer inside the build area on the way from any module to any +", () => {
    const state = createInitialState(7);
    for (const site of availableModuleBuildSites(state)) {
      const from = state.station.modules
        .map((module) => module.position)
        .find((position) => Math.hypot(position.x - site.x, position.y - site.y) === MODULE_SPACING)!;
      for (let step = 0; step <= 40; step += 1) {
        const t = step / 40;
        const point = { x: from.x + (site.x - from.x) * t, y: from.y + (site.y - from.y) * t };
        expect(pointerInBuildArea(state, point), `${JSON.stringify(point)} toward ${JSON.stringify(site)}`)
          .toBe(true);
      }
    }
    expect(pointerInBuildArea(state, { x: 0, y: 150 })).toBe(false);
    expect(pointerInBuildArea(state, { x: -61, y: 0 })).toBe(false);
  });

  it("sizes each + to its slot so neighbours never overlap at any zoom", () => {
    expect(buildControlSize(1)).toEqual({ cell: 40, glyph: 26 });
    expect(buildControlSize(8)).toEqual({ cell: 320, glyph: 26 });
    for (const zoom of [0.2, 0.35, 0.5, 0.75]) {
      const { cell, glyph } = buildControlSize(zoom);
      expect(cell).toBeCloseTo(MODULE_SPACING * zoom);
      expect(glyph).toBeLessThan(cell);
    }
  });
});
