import { describe, expect, it } from "vitest";
import {
  BUILD_SECONDS,
  MODULE_SPACING,
  availableModuleBuildSites,
  createInitialState,
  queueModuleBuild,
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
import { hoveredBody, worldToScreen, type Camera } from "./camera";

describe("station building controls", () => {
  it("shows front needs, full later cost, and Cancel on ghost modules", () => {
    const initial = createInitialState(7);
    let state = queueModuleBuild({ ...initial, station: { ...initial.station,
      constructionSite: { ...initial.station.constructionSite, inventory: { Metal: 15, Ice: 0 } } } }, "Storage", { x: 80, y: 0 });
    state = queueModuleBuild(state, "Builder", { x: 120, y: 0 });
    const camera: Camera = { center: { x: 0, y: 0 }, zoom: 2 };
    const viewport = { width: 800, height: 600 };

    const front = hoveredBody(state, camera, viewport, worldToScreen(camera, viewport, { x: 80, y: 0 }));
    const later = hoveredBody(state, camera, viewport, worldToScreen(camera, viewport, { x: 120, y: 0 }));
    expect(front).toEqual({ kind: "queuedBuild", index: 0 });
    expect(infoBox(state, front)).toEqual({
      title: "Storage, queued",
      line: "Needs 10 more Metal and 25 more Ice",
      action: { label: "Cancel", queuedBuild: 0 },
    });
    expect(infoBox(state, later)).toEqual({
      title: "Builder, queued",
      line: "Needs 25 Metal and 25 Ice",
      action: { label: "Cancel", queuedBuild: 1 },
    });
  });

  it("keeps every module choice enabled even when the site cannot pay", () => {
    expect(buildMenuItems(createInitialState(7)).every((item) => !item.disabled)).toBe(true);
  });

  it("presents all module choices with their shared cost and queue-ready state", () => {
    expect(buildMenuItems(createInitialState(7))).toEqual([
      { type: "Dock", cost: "25 Metal, 25 Ice", disabled: false, title: "Needs 25 more Metal and 25 more Ice" },
      { type: "Storage", cost: "25 Metal, 25 Ice", disabled: false, title: "Needs 25 more Metal and 25 more Ice" },
      { type: "Builder", cost: "25 Metal, 25 Ice", disabled: false, title: "Needs 25 more Metal and 25 more Ice" },
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

  it("keeps the pointer in the build area from a ghost to its + controls", () => {
    const state = queueModuleBuild(createInitialState(7), "Storage", { x: 80, y: 0 });
    expect(pointerInBuildArea(state, { x: 100, y: 0 })).toBe(true);
    expect(availableModuleBuildSites(state)).toContainEqual({ x: 120, y: 0 });
  });
});
