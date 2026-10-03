import { describe, expect, it } from "vitest";
import { createInitialState, type SimState, type Ship, type HaulRoute, type DefaultBehaviour, type Material, type HaulStationId } from "sim";
import { installPanels } from "./panels";
import { applyHaulRouteFieldChange } from "./haul-route";
import { selectionPanel } from "./selection";
import { renderShipPanel } from "./ship-panel";
import { createUiState } from "./ui-state";

function baseShip(initial: SimState, overrides: Partial<Ship> = {}): Ship {
  return { ...initial.ships[0]!, ...overrides };
}

function makeHaulRoute(from: HaulStationId, to: HaulStationId, material: Material): HaulRoute {
  return { from, to, material };
}

describe("applyHaulRouteFieldChange (Slice B)", () => {
  function haulState(): SimState {
    const initial = createInitialState(7);
    return {
      ...initial,
      sectors: initial.sectors.map((sector, index) => ({ ...sector, name: index === 0 ? "Home" : index === 1 ? "Kessel" : sector.name })),
      claimSites: [
        { id: 3, sectorId: 1, position: { x: 100, y: 50 }, stage: 2, delivered: { Metal: 0, Ice: 0 }, timer: null as number | null },
        { id: 4, sectorId: 2, position: { x: 200, y: 50 }, stage: 2, delivered: { Metal: 0, Ice: 0 }, timer: null as number | null },
      ],
      station: { ...initial.station, inventory: { Metal: 100, Ice: 100 } },
      ships: [
        baseShip(initial, { id: 0, defaultBehaviour: "haul" as DefaultBehaviour, haulRoute: makeHaulRoute("home", "claim:3", "Ice") }),
        baseShip(initial, { id: 1, defaultBehaviour: "haul" as DefaultBehaviour, haulRoute: makeHaulRoute("home", "claim:4", "Metal") }),
      ],
    };
  }

  it("changing From on mixed selection updates From for all ships, preserves their To and Material (criterion 4, 5)", () => {
    let state = haulState();
    state = applyHaulRouteFieldChange(state, [0, 1], { field: "from", value: "claim:4" });
    expect(state.ships[0]!.haulRoute).toEqual({ from: "claim:4", to: "claim:3", material: "Ice" });
    expect(state.ships[1]!.haulRoute).toEqual({ from: "home", to: "claim:4", material: "Metal" });
  });

  it("changing To on mixed selection updates To for all ships, preserves their From and Material (criterion 4, 5)", () => {
    let state = haulState();
    state = applyHaulRouteFieldChange(state, [0, 1], { field: "to", value: "claim:3" });
    expect(state.ships[0]!.haulRoute).toEqual({ from: "home", to: "claim:3", material: "Ice" });
    expect(state.ships[1]!.haulRoute).toEqual({ from: "home", to: "claim:3", material: "Metal" });
  });

  it("changing Material on mixed selection updates Material for all ships, preserves their From and To (criterion 4, 5)", () => {
    let state = haulState();
    state = applyHaulRouteFieldChange(state, [0, 1], { field: "material", value: "Metal" });
    expect(state.ships[0]!.haulRoute).toEqual({ from: "home", to: "claim:3", material: "Metal" });
    expect(state.ships[1]!.haulRoute).toEqual({ from: "home", to: "claim:4", material: "Metal" });
  });

  it("rejects change that would give a ship same From and To (criterion 7)", () => {
    let state = haulState();
    state = applyHaulRouteFieldChange(state, [0, 1], { field: "to", value: "home" });
    expect(state.ships[0]!.haulRoute).toEqual({ from: "home", to: "claim:3", material: "Ice" });
    expect(state.ships[1]!.haulRoute).toEqual({ from: "home", to: "claim:4", material: "Metal" });
  });

  it("after a valid mixed change, the dropdown no longer shows Mixed for that field", () => {
    let state = haulState();
    state = applyHaulRouteFieldChange(state, [0, 1], { field: "material", value: "Metal" });
    const panel = selectionPanel(state, [0, 1]);
    expect(panel?.haulRoute?.material).toBe("Metal");
    expect(panel?.haulRoute?.material).not.toBe("mixed");
    expect(panel?.haulRoute?.from).toBe("home");
    expect(panel?.haulRoute?.to).toBe("mixed");
  });

  it("handles single ship selection (non-mixed) correctly", () => {
    let state = haulState();
    state = applyHaulRouteFieldChange(state, [0], { field: "from", value: "claim:4" });
    expect(state.ships[0]!.haulRoute).toEqual({ from: "claim:4", to: "claim:3", material: "Ice" });
    expect(state.ships[1]!.haulRoute).toEqual({ from: "home", to: "claim:4", material: "Metal" });
  });

  it("does nothing when selected ship has no haul route", () => {
    const initial = createInitialState(7);
    const state: SimState = {
      ...initial,
      sectors: initial.sectors.map((sector, index) => ({ ...sector, name: index === 0 ? "Home" : index === 1 ? "Kessel" : sector.name })),
      claimSites: [
        { id: 3, sectorId: 1, position: { x: 100, y: 50 }, stage: 2, delivered: { Metal: 0, Ice: 0 }, timer: null as number | null },
      ],
      ships: [
        baseShip(initial, { id: 0, defaultBehaviour: "mine" as DefaultBehaviour, haulRoute: undefined }),
        baseShip(initial, { id: 1, defaultBehaviour: "haul" as DefaultBehaviour, haulRoute: makeHaulRoute("home", "claim:3", "Ice") }),
      ],
    };
    let nextState = applyHaulRouteFieldChange(state, [0, 1], { field: "from", value: "claim:3" });
    expect(nextState.ships[0]!.haulRoute).toBeUndefined();
    expect(nextState.ships[1]!.haulRoute).toEqual({ from: "home", to: "claim:3", material: "Ice" });
  });

  it("after mixed change, selecting each ship alone shows new value and its own old values (criterion 6)", () => {
    let state = haulState();
    // Ship 0: Home -> Claim:3, Ice
    // Ship 1: Home -> Claim:4, Metal
    // Change Material to Metal for both
    state = applyHaulRouteFieldChange(state, [0, 1], { field: "material", value: "Metal" });

    // Verify the multi-select panel shows the new shared Material and Mixed for differing fields
    let panel = selectionPanel(state, [0, 1]);
    expect(panel?.haulRoute?.material).toBe("Metal");
    expect(panel?.haulRoute?.from).toBe("home");
    expect(panel?.haulRoute?.to).toBe("mixed");

    // Select ship 0 alone - should show new Material (Metal) and its own old From/To (Home -> Claim:3)
    panel = selectionPanel(state, [0]);
    expect(panel?.haulRoute).toEqual({ from: "home", to: "claim:3", material: "Metal" });

    // Select ship 1 alone - should show new Material (Metal) and its own old From/To (Home -> Claim:4)
    panel = selectionPanel(state, [1]);
    expect(panel?.haulRoute).toEqual({ from: "home", to: "claim:4", material: "Metal" });
  });

  it("after mixed From change, selecting each ship alone shows new From and its own old To/Material (criterion 6)", () => {
    let state = haulState();
    // Ship 0: Home -> Claim:3, Ice
    // Ship 1: Claim:4 -> Claim:3, Metal  (different From, so change to Home is valid for both)
    state.ships[1] = { ...state.ships[1]!, haulRoute: { from: "claim:4", to: "claim:3", material: "Metal" } };
    // Change From to Home for both
    state = applyHaulRouteFieldChange(state, [0, 1], { field: "from", value: "home" });

    // Select ship 0 alone - should show new From (Home) and its own old To/Material (Claim:3, Ice)
    let panel = selectionPanel(state, [0]);
    expect(panel?.haulRoute).toEqual({ from: "home", to: "claim:3", material: "Ice" });

    // Select ship 1 alone - should show new From (Home) and its own old To/Material (Claim:3, Metal)
    panel = selectionPanel(state, [1]);
    expect(panel?.haulRoute).toEqual({ from: "home", to: "claim:3", material: "Metal" });
  });

  it("after mixed To change, selecting each ship alone shows new To and its own old From/Material (criterion 6)", () => {
    let state = haulState();
    // Ship 0: Home -> Claim:3, Ice
    // Ship 1: Home -> Claim:4, Metal
    // Change To to Claim:3 for both
    state = applyHaulRouteFieldChange(state, [0, 1], { field: "to", value: "claim:3" });

    // Select ship 0 alone - should show new To (Claim:3) and its own old From/Material (Home, Ice)
    let panel = selectionPanel(state, [0]);
    expect(panel?.haulRoute).toEqual({ from: "home", to: "claim:3", material: "Ice" });

    // Select ship 1 alone - should show new To (Claim:3) and its own old From/Material (Home, Metal)
    panel = selectionPanel(state, [1]);
    expect(panel?.haulRoute).toEqual({ from: "home", to: "claim:3", material: "Metal" });
  });
});

class FakeElement {
  hidden = false;
  name = "";
  value = "";
  textContent = "";
  selected = false;
  disabled = false;
  title = "";
  dataset: Record<string, string> = {};
  children: FakeElement[] = [];
  listeners = new Map<string, ((event: Event) => void)[]>();
  append(...children: (FakeElement | string)[]): void {
    const elements = children.filter((child): child is FakeElement => typeof child !== "string");
    this.children.push(...elements);
    const selected = elements.find((child) => child.selected);
    if (selected) this.value = selected.value;
  }
  prepend(...children: FakeElement[]): void {
    this.children.unshift(...children);
    const selected = children.find((child) => child.selected);
    if (selected) this.value = selected.value;
  }
  replaceChildren(...children: FakeElement[]): void { this.children = children; }
  addEventListener(name: string, listener: (event: Event) => void): void { this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]); }
}

function fakeDocument(): { createElement: (tag: string) => FakeElement } {
  return { createElement: () => new FakeElement() };
}

describe("haul route panel", () => {
  it("only reads and writes haulers in a mixed selection", () => {
    const initial = haulStateForPanel();
    initial.ships[1] = { ...initial.ships[1]!, defaultBehaviour: "mine", haulRoute: { from: "home", to: "claim:4", material: "Ice" } };
    const beforeMiner = initial.ships[1]!.haulRoute;
    const panel = selectionPanel(initial, [0, 1]);
    expect(panel?.haulRoute).toEqual({ from: "home", to: "claim:3", material: "Ice" });
    const next = applyHaulRouteFieldChange(initial, [0, 1], { field: "material", value: "Metal" });
    expect(next.ships[0]!.defaultBehaviour).toBe("haul");
    expect(next.ships[0]!.haulRoute?.material).toBe("Metal");
    expect(next.ships[1]!.defaultBehaviour).toBe("mine");
    expect(next.ships[1]!.haulRoute).toEqual(beforeMiner);
  });

  it("renders route selects and Mixed values for a mixed default selection", () => {
    const originalDocument = globalThis.document;
    globalThis.document = fakeDocument() as unknown as Document;
    try {
      const box = new FakeElement();
      const state = haulStateForPanel();
      state.ships[1] = { ...state.ships[1]!, defaultBehaviour: "mine" };
      renderShipPanel(state, box as unknown as HTMLElement, { selectedShips: [0, 1], selectedShip: null, renderedPanel: "" });
      const selects = box.children.flatMap((child) => child.children).filter((child) => child.name === "haul-from" || child.name === "haul-to" || child.name === "haul-material");
      expect(selects.map((select) => select.name)).toEqual(["haul-from", "haul-to", "haul-material"]);
      expect(selects.map((select) => select.value)).toEqual(["home", "claim:3", "Ice"]);
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it("renders Mixed options for divergent route fields", () => {
    const originalDocument = globalThis.document;
    globalThis.document = fakeDocument() as unknown as Document;
    try {
      const state = haulStateForPanel();
      state.ships[1] = { ...state.ships[1]!, haulRoute: { from: "home", to: "claim:4", material: "Metal" } };
      const box = new FakeElement();
      renderShipPanel(state, box as unknown as HTMLElement, { selectedShips: [0, 1], selectedShip: null, renderedPanel: "" });
      const selects = box.children.flatMap((child) => child.children).filter((child) => child.name.startsWith("haul-"));
      expect(selects.map((select) => select.value)).toEqual(["home", "mixed", "mixed"]);
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it.each([
    ["haul-from", "claim:4", { field: "from", value: "claim:4" }],
    ["haul-to", "claim:3", { field: "to", value: "claim:3" }],
    ["haul-material", "Metal", { field: "material", value: "Metal" }],
  ] as const)("handles %s and maps it to the route field", (name, value, change) => {
    const state = haulStateForPanel();
    const shipPanelBox = new FakeElement();
    const ui = { ...createUiState([]), selectedShips: [0, 1] };
    let current = state;
    installPanels(ui, () => current, (next) => { current = next; }, new FakeElement() as unknown as HTMLElement, shipPanelBox as unknown as HTMLElement);
    const listener = shipPanelBox.listeners.get("change")?.[0];
    expect(listener).toBeDefined();
    listener!({ target: { name, value } } as unknown as Event);
    expect(current.ships[0]!.haulRoute).toMatchObject({ [change.field]: value });
    expect(current.ships[1]!.haulRoute).toMatchObject({ [change.field]: value });
  });

  it("ignores the Mixed option in the change handler", () => {
    const state = haulStateForPanel();
    const shipPanelBox = new FakeElement();
    const ui = { ...createUiState([]), selectedShips: [0, 1] };
    let current = state;
    installPanels(ui, () => current, (next) => { current = next; }, new FakeElement() as unknown as HTMLElement, shipPanelBox as unknown as HTMLElement);
    const listener = shipPanelBox.listeners.get("change")?.[0];
    listener!({ target: { name: "haul-material", value: "mixed" } } as unknown as Event);
    expect(current).toBe(state);
  });
});

function haulStateForPanel(): SimState {
  const initial = createInitialState(7);
  return {
    ...initial,
    claimSites: [
      { id: 3, sectorId: 1, position: { x: 100, y: 50 }, stage: 2, delivered: { Metal: 0, Ice: 0 }, timer: null },
      { id: 4, sectorId: 2, position: { x: 200, y: 50 }, stage: 2, delivered: { Metal: 0, Ice: 0 }, timer: null },
    ],
    ships: [
      baseShip(initial, { id: 0, defaultBehaviour: "haul", haulRoute: makeHaulRoute("home", "claim:3", "Ice") }),
      baseShip(initial, { id: 1, defaultBehaviour: "haul", haulRoute: makeHaulRoute("home", "claim:3", "Metal") }),
    ],
  };
}
