import { describe, expect, it } from "vitest";
import {
  BUILD_SECONDS,
  createInitialState,
  startModuleBuild,
  tick,
} from "sim";
import { buildMenuItems } from "./building";
import { buildControlsVisible } from "./building";
import { infoBox } from "./labels";

describe("station building controls", () => {
  it("presents all module choices with their shared cost and disabled state", () => {
    expect(buildMenuItems(createInitialState(7))).toEqual([
      { type: "Dock", cost: "25 Metal, 25 Ice", disabled: true },
      { type: "Storage", cost: "25 Metal, 25 Ice", disabled: true },
      { type: "Builder", cost: "25 Metal, 25 Ice", disabled: true },
    ]);
  });

  it("labels construction with its remaining time and a completed Builder as idle", () => {
    const initial = createInitialState(7);
    const funded = {
      ...initial,
      station: { ...initial.station, inventory: { Metal: 50, Ice: 50 } },
    };
    const building = tick(startModuleBuild(funded, "Builder", { x: 0, y: -40 }), 3);
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
});
