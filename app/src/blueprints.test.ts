import { describe, expect, it } from "vitest";
import type { ShipDesign } from "sim";
import {
  BLUEPRINTS_KEY,
  deleteBlueprint,
  draftFromDesign,
  loadBlueprints,
  saveBlueprint,
  viewCentredOn,
  type BlueprintStore,
} from "./blueprints";
import { applyTool, designOf, emptyDraft, emptyView, placedDesign, withModule } from "./shipyard";

function memoryStore(initial: Record<string, string> = {}): BlueprintStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const SCOUT: ShipDesign = { width: 2, height: 2, slots: ["Engine", "Hull", null, "Laser"] };
const HAULER: ShipDesign = { width: 3, height: 1, slots: ["Storage", "Storage", "Engine"] };

describe("blueprints", () => {
  it("starts with no blueprints", () => {
    expect(loadBlueprints(memoryStore())).toEqual([]);
  });

  it("keeps a saved design under its name, and a fresh page load still finds it", () => {
    const store = memoryStore();
    saveBlueprint(store, "Scout", SCOUT);
    saveBlueprint(store, "Hauler", HAULER);
    // A reload builds a new list from nothing but what the store holds.
    expect(loadBlueprints(store)).toEqual([
      { name: "Scout", design: SCOUT },
      { name: "Hauler", design: HAULER },
    ]);
  });

  it("returns the updated list from a save", () => {
    const store = memoryStore();
    expect(saveBlueprint(store, "Scout", SCOUT)).toEqual([{ name: "Scout", design: SCOUT }]);
  });

  it("replaces the blueprint when a name is saved again", () => {
    const store = memoryStore();
    saveBlueprint(store, "Scout", SCOUT);
    saveBlueprint(store, "Hauler", HAULER);
    saveBlueprint(store, "Scout", HAULER);
    expect(loadBlueprints(store)).toEqual([
      { name: "Scout", design: HAULER },
      { name: "Hauler", design: HAULER },
    ]);
  });

  it("trims the name, and refuses a blank one or an empty design", () => {
    const store = memoryStore();
    saveBlueprint(store, "  Scout  ", SCOUT);
    saveBlueprint(store, "   ", HAULER);
    saveBlueprint(store, "Nothing", { width: 0, height: 0, slots: [] });
    expect(loadBlueprints(store).map((blueprint) => blueprint.name)).toEqual(["Scout"]);
  });

  it("deletes one blueprint and leaves the rest", () => {
    const store = memoryStore();
    saveBlueprint(store, "Scout", SCOUT);
    saveBlueprint(store, "Hauler", HAULER);
    expect(deleteBlueprint(store, "Scout")).toEqual([{ name: "Hauler", design: HAULER }]);
    expect(loadBlueprints(store)).toEqual([{ name: "Hauler", design: HAULER }]);
  });

  it("does not bring a deleted blueprint back on reload", () => {
    const store = memoryStore();
    saveBlueprint(store, "Scout", SCOUT);
    deleteBlueprint(store, "Scout");
    expect(loadBlueprints(store)).toEqual([]);
  });

  it("ignores stored data that is not a list of blueprints", () => {
    expect(loadBlueprints(memoryStore({ [BLUEPRINTS_KEY]: "{not json" }))).toEqual([]);
    expect(loadBlueprints(memoryStore({ [BLUEPRINTS_KEY]: '{"a":1}' }))).toEqual([]);
  });

  it("drops stored entries whose design is malformed, keeping the good ones", () => {
    const good = { name: "Scout", design: SCOUT };
    const stored = JSON.stringify([
      good,
      { name: "Short", design: { width: 2, height: 2, slots: ["Engine"] } },
      { name: "Unknown", design: { width: 1, height: 1, slots: ["Warp"] } },
      { design: SCOUT },
    ]);
    expect(loadBlueprints(memoryStore({ [BLUEPRINTS_KEY]: stored }))).toEqual([good]);
  });

  it("carries on when storage is unavailable", () => {
    const broken: BlueprintStore = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadBlueprints(broken)).toEqual([]);
    expect(saveBlueprint(broken, "Scout", SCOUT)).toEqual([{ name: "Scout", design: SCOUT }]);
  });
});

describe("loading a blueprint onto the canvas", () => {
  it("paints the blueprint's design, so building it builds the same ship", () => {
    const draft = draftFromDesign(emptyDraft(), SCOUT);
    expect(designOf(draft)).toEqual(SCOUT);
  });

  it("keeps the brush the player had, and leaves the old draft untouched", () => {
    const before = withModule(emptyDraft(), "Laser");
    applyTool(before, { x: 5, y: 5 });
    const after = draftFromDesign(before, SCOUT);
    expect(after.module).toBe("Laser");
    expect(designOf(before)).toEqual({ width: 1, height: 1, slots: ["Laser"] });
    expect(after.cells).not.toBe(before.cells);
  });

  it("can be edited afterwards without changing the saved blueprint", () => {
    const draft = draftFromDesign(emptyDraft(), SCOUT);
    applyTool(withModule(draft, "Storage"), { x: 2, y: 0 });
    expect(designOf(draft).width).toBe(3);
    expect(SCOUT.width).toBe(2);
  });

  it("puts the design at the canvas origin, so the view can be centred on it", () => {
    expect(placedDesign(draftFromDesign(emptyDraft(), SCOUT)).origin).toEqual({ x: 0, y: 0 });
  });
});

describe("framing a loaded blueprint", () => {
  it("centres the view on the design, keeping the zoom", () => {
    const view = { ...emptyView(), zoom: 8 };
    expect(viewCentredOn(view, { width: 40, height: 10, slots: [] })).toEqual({ center: { x: 20, y: 5 }, zoom: 8 });
  });
});
