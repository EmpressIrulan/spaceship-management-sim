import { describe, expect, it } from "vitest";
import {
  createInitialState,
  pixelCount,
  shipBuildSeconds,
  startShipBuild,
  tick,
  type ShipModule,
  type SimState,
  type StationModule,
} from "sim";
import {
  applyTool,
  cellAt,
  designOf,
  emptyDraft,
  emptyView,
  formatDuration,
  lineCells,
  placedDesign,
  shipMenuView,
  shouldDismissShipMenuOnMouseDown,
  withModule,
  withSize,
  withTool,
  zoomView,
  type ShipDraft,
} from "./shipyard";
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

function stroke(draft: ShipDraft, module: ShipModule, ...cells: [number, number][]): ShipDraft {
  const next = withModule(withTool(draft, "paint"), module);
  for (const [x, y] of cells) applyTool(next, { x, y });
  return next;
}

function rows(draft: ShipDraft): string {
  const design = designOf(draft);
  const letter = { Engine: "E", Laser: "L", Storage: "S", Hull: "H" } as const;
  const lines: string[] = [];
  for (let y = 0; y < design.height; y += 1) {
    lines.push(
      design.slots.slice(y * design.width, (y + 1) * design.width).map((slot) => (slot ? letter[slot] : ".")).join(""),
    );
  }
  return lines.join("/");
}

describe("Build ship canvas", () => {
  it("leaves a menu opened on mouseup open, then dismisses on a later outside mousedown", () => {
    // The mousedown preceding the Builder mouseup happens before the menu exists.
    expect(shouldDismissShipMenuOnMouseDown(false, false)).toBe(false);

    // The Builder mouseup opens the menu; its following click does not dismiss it.
    const opened = true;
    expect(shouldDismissShipMenuOnMouseDown(opened, true)).toBe(false);

    // A subsequent outside mousedown closes it.
    expect(shouldDismissShipMenuOnMouseDown(opened, false)).toBe(true);
  });

  it("opens empty, with nothing to build", () => {
    const draft = emptyDraft();
    expect(designOf(draft)).toEqual({ width: 0, height: 0, slots: [] });
    expect(shipMenuView(withBuilder(), BUILDER, draft)).toMatchObject({ pixels: "0", canBuild: false });
  });

  it("paints one pixel per click with the 1 pixel brush", () => {
    const draft = stroke(emptyDraft(), "Engine", [0, 0]);
    expect(rows(draft)).toBe("E");
  });

  it("paints a 3x3 or 5x5 square centred on the click with the bigger brushes", () => {
    const three = withSize(emptyDraft(), 3);
    applyTool(three, { x: 10, y: 10 });
    expect(designOf(three)).toMatchObject({ width: 3, height: 3 });
    expect(pixelCount(designOf(three))).toBe(9);

    const five = withSize(emptyDraft(), 5);
    applyTool(five, { x: -2, y: 4 });
    expect(pixelCount(designOf(five))).toBe(25);
    expect(five.cells.has("-4,2")).toBe(true);
    expect(five.cells.has("0,6")).toBe(true);
    expect(five.cells.has("1,6")).toBe(false);
  });

  it("paints Engine, Laser, Storage and Hull, and a later pixel replaces an earlier one", () => {
    let draft = stroke(emptyDraft(), "Engine", [0, 0]);
    draft = stroke(draft, "Laser", [1, 0]);
    draft = stroke(draft, "Storage", [2, 0]);
    draft = stroke(draft, "Hull", [3, 0]);
    expect(rows(draft)).toBe("ELSH");
    draft = stroke(draft, "Hull", [0, 0]);
    expect(rows(draft)).toBe("HLSH");
  });

  it("erases with the brush size, and erasing bare canvas does nothing", () => {
    const draft = withSize(withModule(emptyDraft(), "Hull"), 3);
    applyTool(draft, { x: 1, y: 1 });
    const eraser = withSize(withTool(draft, "erase"), 1);
    applyTool(eraser, { x: 1, y: 1 });
    applyTool(eraser, { x: 50, y: 50 });
    expect(rows(eraser)).toBe("HHH/H.H/HHH");
    applyTool(withSize(eraser, 5), { x: 1, y: 1 });
    expect(designOf(eraser).slots).toEqual([]);
  });

  it("has no size cap and keeps the shape of a design painted far from the origin", () => {
    let draft = stroke(emptyDraft(), "Engine", [-500, 900]);
    draft = stroke(draft, "Storage", [700, 899]);
    const design = designOf(draft);
    expect(design.width).toBe(1201);
    expect(design.height).toBe(2);
    expect(design.slots[0]).toBeNull();
    expect(design.slots[1200]).toBe("Storage");
    expect(design.slots[1201]).toBe("Engine");
    expect(pixelCount(design)).toBe(2);
  });

  it("fills an enclosed empty region and stops at the outline", () => {
    let draft = emptyDraft();
    for (let x = 0; x < 5; x += 1) draft = stroke(draft, "Hull", [x, 0], [x, 4]);
    for (let y = 1; y < 4; y += 1) draft = stroke(draft, "Hull", [0, y], [4, y]);
    const fill = withModule(withTool(draft, "fill"), "Storage");
    applyTool(fill, { x: 2, y: 2 });
    expect(rows(fill)).toBe("HHHHH/HSSSH/HSSSH/HSSSH/HHHHH");
  });

  it("does nothing when the empty region it is asked to fill is not enclosed", () => {
    const draft = stroke(emptyDraft(), "Hull", [0, 0], [1, 0], [2, 0]);
    const fill = withModule(withTool(draft, "fill"), "Storage");
    applyTool(fill, { x: 1, y: 1 });
    expect(rows(fill)).toBe("HHH");
  });

  it("fills a painted region with the picked module, leaving other modules alone", () => {
    let draft = stroke(emptyDraft(), "Hull", [0, 0], [1, 0], [2, 0]);
    draft = stroke(draft, "Engine", [3, 0]);
    draft = stroke(draft, "Hull", [4, 0]);
    const fill = withModule(withTool(draft, "fill"), "Laser");
    applyTool(fill, { x: 1, y: 0 });
    expect(rows(fill)).toBe("LLLEH");
    applyTool(fill, { x: 1, y: 0 });
    expect(rows(fill)).toBe("LLLEH");
  });

  it("does not fill diagonally", () => {
    let draft = stroke(emptyDraft(), "Hull", [0, 0], [1, 1]);
    draft = withModule(withTool(draft, "fill"), "Laser");
    applyTool(draft, { x: 0, y: 0 });
    expect(rows(draft)).toBe("L./.H");
  });

  it("shows the pixel count, build time and cost as pixels are painted", () => {
    const state = withBuilder();
    let draft = emptyDraft();
    expect(shipMenuView(state, BUILDER, draft)).toMatchObject({ pixels: "0", buildTime: "0 s", cost: "0 Metal 0 Ice" });

    draft = withSize(withModule(draft, "Hull"), 3);
    applyTool(draft, { x: 0, y: 0 });
    expect(shipMenuView(state, BUILDER, draft)).toMatchObject({
      pixels: "9",
      buildTime: "9 s",
      cost: "45 Metal 45 Ice",
    });

    draft = withSize(withModule(emptyDraft(), "Hull"), 5);
    for (let n = 0; n < 5; n += 1) applyTool(draft, { x: n * 5, y: 0 });
    expect(shipMenuView(state, BUILDER, draft)).toMatchObject({ pixels: "125", buildTime: "2 min 5 s" });
  });

  it("updates Speed, Hold and Mining time from what was painted", () => {
    const state = withBuilder();
    let draft = stroke(emptyDraft(), "Hull", [0, 0]);
    expect(shipMenuView(state, BUILDER, draft).stats).toEqual({ speed: "0", hold: "0", miningTime: "no laser" });

    draft = withSize(withModule(emptyDraft(), "Engine"), 3);
    applyTool(draft, { x: 1, y: 1 });
    applyTool(withModule(draft, "Laser"), { x: 4, y: 1 });
    applyTool(withModule(draft, "Storage"), { x: 7, y: 1 });
    expect(shipMenuView(state, BUILDER, draft).stats).toEqual({ speed: "33", hold: "22", miningTime: "12 s" });
  });

  it("greys out Build when Storage can't pay or the Builder is already building", () => {
    const draft = withSize(withModule(emptyDraft(), "Engine"), 5);
    applyTool(draft, { x: 0, y: 0 });
    applyTool(draft, { x: 5, y: 0 });
    expect(pixelCount(designOf(draft))).toBe(50);
    expect(shipMenuView(withBuilder(), BUILDER, draft).canBuild).toBe(true);
    expect(shipMenuView(withBuilder({ Metal: 249, Ice: 400 }), BUILDER, draft).canBuild).toBe(false);

    const busy = startShipBuild(withBuilder(), BUILDER, designOf(draft));
    expect(shipMenuView(busy, BUILDER, draft).canBuild).toBe(false);
  });

  it("builds the painted shape, and the ship comes out with it", () => {
    let draft = stroke(emptyDraft(), "Hull", [3, 3], [4, 3], [5, 3]);
    draft = stroke(draft, "Engine", [3, 4]);
    const design = designOf(draft);
    expect(design).toEqual({ width: 3, height: 2, slots: ["Hull", "Hull", "Hull", "Engine", null, null] });

    const started = startShipBuild(withBuilder(), BUILDER, design);
    const done = tick(started, shipBuildSeconds(design));
    expect(done.ships.at(-1)!.design).toEqual(design);
  });
});

describe("dragging a brush", () => {
  it("fills the gap between two pointer positions", () => {
    expect(lineCells({ x: 0, y: 0 }, { x: 4, y: 0 })).toEqual([0, 1, 2, 3, 4].map((x) => ({ x, y: 0 })));
    expect(lineCells({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }]);
    expect(lineCells({ x: 0, y: 0 }, { x: -3, y: 3 })).toHaveLength(4);
  });

  it("remembers where the design sits on the canvas", () => {
    const draft = stroke(emptyDraft(), "Hull", [-7, 12], [-5, 13]);
    expect(placedDesign(draft).origin).toEqual({ x: -7, y: 12 });
    expect(placedDesign(draft)).toBe(placedDesign(draft));
    stroke(draft, "Hull", [-9, 12]);
    expect(placedDesign(draft).origin).toEqual({ x: -9, y: 12 });
  });
});

describe("panning and zooming the canvas", () => {
  const viewport = { width: 600, height: 400 };

  it("finds the pixel under the pointer", () => {
    const view = { center: { x: 0, y: 0 }, zoom: 10 };
    expect(cellAt(view, viewport, { x: 300, y: 200 })).toEqual({ x: 0, y: 0 });
    expect(cellAt(view, viewport, { x: 299, y: 199 })).toEqual({ x: -1, y: -1 });
    expect(cellAt(view, viewport, { x: 345, y: 231 })).toEqual({ x: 4, y: 3 });
  });

  it("zooms far in and far out, and keeps the pixel under the cursor put", () => {
    let view = emptyView();
    const cursor = { x: 450, y: 100 };
    const before = cellAt(view, viewport, cursor);
    for (let n = 0; n < 6; n += 1) view = zoomView(view, viewport, cursor, 1.5);
    expect(view.zoom).toBeGreaterThan(50);
    expect(cellAt(view, viewport, cursor)).toEqual(before);
    for (let n = 0; n < 60; n += 1) view = zoomView(view, viewport, cursor, 1 / 1.5);
    expect(view.zoom).toBeLessThan(0.5);
  });
});

describe("Builder hover", () => {
  it("counts down the ship being built", () => {
    const draft = withSize(withModule(emptyDraft(), "Hull"), 5);
    applyTool(draft, { x: 0, y: 0 });
    const building = tick(startShipBuild(withBuilder(), BUILDER, designOf(draft)), 7);
    expect(infoBox(building, { kind: "module", index: BUILDER })).toEqual({
      title: "Builder",
      line: "Building 5x5: 18 s",
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
