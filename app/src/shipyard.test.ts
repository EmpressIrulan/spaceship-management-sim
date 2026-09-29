import { describe, expect, it } from "vitest";
import { createInitialState, startShipBuild, tick, type SimState, type StationModule } from "sim";
import { emptyDraft, formatDuration, paintSlot, resizeDraft, shipMenuView, withBrush } from "./shipyard";
import { infoBox } from "./labels";

const BUILDER = 2;

function withBuilder(inventory = { Metal: 400, Ice: 400 }): SimState {
  const state = createInitialState(7);
  const builder: StationModule = { type: "Builder", position: { x: 0, y: -40 }, size: { width: 30, height: 40 } };
  return {
    ...state,
    station: {
      ...state.station,
      storage: { ...state.station.storage, capacity: 1000 },
      inventory,
      modules: [...state.station.modules, builder],
    },
  };
}

function paint(draft: ReturnType<typeof emptyDraft>, module: "Engine" | "Laser" | "Storage" | null, ...slots: number[]) {
  let next = withBrush(draft, module);
  for (const slot of slots) next = paintSlot(next, slot);
  return next;
}

describe("Build ship menu", () => {
  it("opens on an empty grid with sizes from 1 to 3", () => {
    const draft = emptyDraft();
    expect(draft.slots.every((slot) => slot === null)).toBe(true);
    expect(draft.slots).toHaveLength(draft.width * draft.height);
    expect(resizeDraft(draft, 3, 1)).toMatchObject({ width: 3, height: 1, slots: [null, null, null] });
    expect(resizeDraft(draft, 4, 0)).toMatchObject({ width: 3, height: 1 });
  });

  it("paints the picked module into clicked slots, and clear empties them", () => {
    let draft = resizeDraft(emptyDraft(), 2, 2);
    draft = paint(draft, "Engine", 0);
    draft = paint(draft, "Laser", 1);
    draft = paint(draft, "Storage", 2, 3);
    expect(draft.slots).toEqual(["Engine", "Laser", "Storage", "Storage"]);
    expect(paint(draft, null, 3).slots).toEqual(["Engine", "Laser", "Storage", null]);
  });

  it("updates Speed, Hold and Mining time as slots are painted", () => {
    const state = withBuilder();
    let draft = resizeDraft(emptyDraft(), 2, 2);
    expect(shipMenuView(state, BUILDER, draft).stats).toEqual({
      speed: "0",
      hold: "0",
      miningTime: "no laser",
    });

    draft = paint(draft, "Engine", 0);
    draft = paint(draft, "Laser", 1);
    draft = paint(draft, "Storage", 2, 3);
    expect(shipMenuView(state, BUILDER, draft).stats).toEqual({
      speed: "25",
      hold: "20",
      miningTime: "24 s",
    });
  });

  it("shows the cost and build time", () => {
    const state = withBuilder();
    expect(shipMenuView(state, BUILDER, resizeDraft(emptyDraft(), 2, 2)).cost).toBe("80 Metal 80 Ice, 31 s");
    expect(shipMenuView(state, BUILDER, resizeDraft(emptyDraft(), 3, 3)).cost).toBe("180 Metal 180 Ice, 2 min");
    expect(shipMenuView(state, BUILDER, resizeDraft(emptyDraft(), 1, 1)).cost).toBe("20 Metal 20 Ice, 3 s");
  });

  it("greys out Build when Storage can't pay or the Builder is already building", () => {
    const draft = resizeDraft(emptyDraft(), 2, 2);
    expect(shipMenuView(withBuilder(), BUILDER, draft).canBuild).toBe(true);
    expect(shipMenuView(withBuilder({ Metal: 79, Ice: 400 }), BUILDER, draft).canBuild).toBe(false);

    const busy = startShipBuild(withBuilder(), BUILDER, draft);
    expect(shipMenuView(busy, BUILDER, draft).canBuild).toBe(false);
  });
});

describe("Builder hover", () => {
  it("counts down the ship being built", () => {
    const draft = resizeDraft(emptyDraft(), 2, 2);
    const building = tick(startShipBuild(withBuilder(), BUILDER, draft), 7);
    expect(infoBox(building, { kind: "module", index: BUILDER })).toEqual({
      title: "Builder",
      line: "Building 2x2: 24 s",
    });
    expect(infoBox(withBuilder(), { kind: "module", index: BUILDER })).toEqual({
      title: "Builder",
      line: "Idle",
    });
  });

  it("writes minutes past a minute", () => {
    expect(formatDuration(120.4)).toBe("2 min");
    expect(formatDuration(98.8)).toBe("1 min 39 s");
    expect(formatDuration(30.8)).toBe("31 s");
  });
});
