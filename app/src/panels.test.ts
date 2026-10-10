import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { foundedStation } from "./test-stations";
import { miningStart } from "./test-mining";
import { createInitialState, tick, type SimState, type Ship, type HaulRoute, type DefaultBehaviour, type Material, type HaulStationId, type HaulDestinationId } from "sim";
import { installPanels } from "./panels";
import { applyHaulRouteFieldChange } from "./haul-route";
import { selectionPanel } from "./selection";
import { renderShipPanel } from "./ship-panel";
import { shipPanel } from "./ships";
import { createUiState } from "./ui-state";

function baseShip(initial: SimState, overrides: Partial<Ship> = {}): Ship {
  return { ...initial.ships[0]!, ...overrides };
}

function makeHaulRoute(from: HaulStationId, to: HaulDestinationId, material: Material): HaulRoute {
  return { from, to, material };
}

describe("applyHaulRouteFieldChange (Slice B)", () => {
  function haulState(): SimState {
    const initial = createInitialState(7);
    return {
      ...initial,
      sectors: initial.sectors.map((sector, index) => ({ ...sector, name: index === 0 ? "Home" : index === 1 ? "Kessel" : sector.name })),
      stations: [
        { ...initial.stations[0]!, inventory: { Metal: 100, Ice: 100 } },
        foundedStation(3, 1, 100, 50),
        foundedStation(4, 2, 200, 50),
      ],
      ships: [
        baseShip(initial, { id: 0, defaultBehaviour: "haul" as DefaultBehaviour, haulRoute: makeHaulRoute("home", "station:3", "Ice") }),
        baseShip(initial, { id: 1, defaultBehaviour: "haul" as DefaultBehaviour, haulRoute: makeHaulRoute("home", "station:4", "Metal") }),
      ],
    };
  }

  it("changing From on mixed selection updates From for all ships, preserves their To and Material (criterion 4, 5)", () => {
    let state = haulState();
    state = applyHaulRouteFieldChange(state, [0, 1], { field: "from", value: "station:4" });
    expect(state.ships[0]!.haulRoute).toEqual({ from: "station:4", to: "station:3", material: "Ice" });
    expect(state.ships[1]!.haulRoute).toEqual({ from: "home", to: "station:4", material: "Metal" });
  });

  it("changing To on mixed selection updates To for all ships, preserves their From and Material (criterion 4, 5)", () => {
    let state = haulState();
    state = applyHaulRouteFieldChange(state, [0, 1], { field: "to", value: "station:3" });
    expect(state.ships[0]!.haulRoute).toEqual({ from: "home", to: "station:3", material: "Ice" });
    expect(state.ships[1]!.haulRoute).toEqual({ from: "home", to: "station:3", material: "Metal" });
  });

  it("changing Material on mixed selection updates Material for all ships, preserves their From and To (criterion 4, 5)", () => {
    let state = haulState();
    state = applyHaulRouteFieldChange(state, [0, 1], { field: "material", value: "Metal" });
    expect(state.ships[0]!.haulRoute).toEqual({ from: "home", to: "station:3", material: "Metal" });
    expect(state.ships[1]!.haulRoute).toEqual({ from: "home", to: "station:4", material: "Metal" });
  });

  it("rejects change that would give a ship same From and To (criterion 7)", () => {
    let state = haulState();
    state = applyHaulRouteFieldChange(state, [0, 1], { field: "to", value: "home" });
    expect(state.ships[0]!.haulRoute).toEqual({ from: "home", to: "station:3", material: "Ice" });
    expect(state.ships[1]!.haulRoute).toEqual({ from: "home", to: "station:4", material: "Metal" });
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
    state = applyHaulRouteFieldChange(state, [0], { field: "from", value: "station:4" });
    expect(state.ships[0]!.haulRoute).toEqual({ from: "station:4", to: "station:3", material: "Ice" });
    expect(state.ships[1]!.haulRoute).toEqual({ from: "home", to: "station:4", material: "Metal" });
  });

  it("does nothing when selected ship has no haul route", () => {
    const initial = createInitialState(7);
    const state: SimState = {
      ...initial,
      sectors: initial.sectors.map((sector, index) => ({ ...sector, name: index === 0 ? "Home" : index === 1 ? "Kessel" : sector.name })),
      stations: [{ ...initial.stations[0]!, inventory: { Metal: 100, Ice: 100 } }, foundedStation(3, 1, 100, 50)],
      ships: [
        baseShip(initial, { id: 0, defaultBehaviour: "mine" as DefaultBehaviour, haulRoute: undefined }),
        baseShip(initial, { id: 1, defaultBehaviour: "haul" as DefaultBehaviour, haulRoute: makeHaulRoute("home", "station:3", "Ice") }),
      ],
    };
    let nextState = applyHaulRouteFieldChange(state, [0, 1], { field: "from", value: "station:3" });
    expect(nextState.ships[0]!.haulRoute).toBeUndefined();
    expect(nextState.ships[1]!.haulRoute).toEqual({ from: "home", to: "station:3", material: "Ice" });
  });

  it("after mixed change, selecting each ship alone shows new value and its own old values (criterion 6)", () => {
    let state = haulState();
    // Ship 0: Home -> Station 3, Ice
    // Ship 1: Home -> Station 4, Metal
    // Change Material to Metal for both
    state = applyHaulRouteFieldChange(state, [0, 1], { field: "material", value: "Metal" });

    // Verify the multi-select panel shows the new shared Material and Mixed for differing fields
    let panel = selectionPanel(state, [0, 1]);
    expect(panel?.haulRoute?.material).toBe("Metal");
    expect(panel?.haulRoute?.from).toBe("home");
    expect(panel?.haulRoute?.to).toBe("mixed");

    // Select ship 0 alone - should show new Material (Metal) and its own old From/To (Home -> Station 3)
    panel = selectionPanel(state, [0]);
    expect(panel?.haulRoute).toEqual({ from: "home", to: "station:3", material: "Metal" });

    // Select ship 1 alone - should show new Material (Metal) and its own old From/To (Home -> Station 4)
    panel = selectionPanel(state, [1]);
    expect(panel?.haulRoute).toEqual({ from: "home", to: "station:4", material: "Metal" });
  });

  it("after mixed From change, selecting each ship alone shows new From and its own old To/Material (criterion 6)", () => {
    let state = haulState();
    // Ship 0: Home -> Station 3, Ice
    // Ship 1: Station 4 -> Station 3, Metal  (different From, so change to Home is valid for both)
    state.ships[1] = { ...state.ships[1]!, haulRoute: { from: "station:4", to: "station:3", material: "Metal" } };
    // Change From to Home for both
    state = applyHaulRouteFieldChange(state, [0, 1], { field: "from", value: "home" });

    // Select ship 0 alone - should show new From (Home) and its own old To/Material (Station 3, Ice)
    let panel = selectionPanel(state, [0]);
    expect(panel?.haulRoute).toEqual({ from: "home", to: "station:3", material: "Ice" });

    // Select ship 1 alone - should show new From (Home) and its own old To/Material (Station 3, Metal)
    panel = selectionPanel(state, [1]);
    expect(panel?.haulRoute).toEqual({ from: "home", to: "station:3", material: "Metal" });
  });

  it("after mixed To change, selecting each ship alone shows new To and its own old From/Material (criterion 6)", () => {
    let state = haulState();
    // Ship 0: Home -> Station 3, Ice
    // Ship 1: Home -> Station 4, Metal
    // Change To to Station 3 for both
    state = applyHaulRouteFieldChange(state, [0, 1], { field: "to", value: "station:3" });

    // Select ship 0 alone - should show new To (Station 3) and its own old From/Material (Home, Ice)
    let panel = selectionPanel(state, [0]);
    expect(panel?.haulRoute).toEqual({ from: "home", to: "station:3", material: "Ice" });

    // Select ship 1 alone - should show new To (Station 3) and its own old From/Material (Home, Metal)
    panel = selectionPanel(state, [1]);
    expect(panel?.haulRoute).toEqual({ from: "home", to: "station:3", material: "Metal" });
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
  style: Record<string, string> = {};
  width = 0;
  height = 0;
  // A ship's thumbnail draws onto a canvas, so the fake needs one to draw on.
  getContext(): { drawImage: () => void; putImageData: () => void } { return { drawImage: () => {}, putImageData: () => {} }; }
}

function fakeDocument(): { createElement: (tag: string) => FakeElement; activeElement: unknown } {
  return { createElement: () => new FakeElement(), activeElement: null };
}

describe("haul route panel", () => {
  it("applies a material dropdown choice to every selected supply ship", () => {
    const state = createInitialState(7);
    const first = state.ships[0]!;
    state.ships = [0, 1].map((id) => ({ ...first, id, defaultBehaviour: "supply", mineMaterials: ["Metal", "Ice"] }));
    const shipPanelBox = new FakeElement();
    const ui = { ...createUiState([]), selectedShips: [0, 1] };
    let current = state;
    installPanels(ui, () => current, (next) => { current = next; }, new FakeElement() as unknown as HTMLElement, shipPanelBox as unknown as HTMLElement);
    shipPanelBox.listeners.get("change")![0]!({ target: { name: "mine-material", value: "Metal" } } as unknown as Event);
    expect(current.ships.map((ship) => ship.mineMaterials)).toEqual([["Metal"], ["Metal"]]);
  });

  it("only reads and writes haulers in a mixed selection", () => {
    const initial = haulStateForPanel();
    initial.ships[1] = { ...initial.ships[1]!, defaultBehaviour: "mine", haulRoute: { from: "home", to: "station:4", material: "Ice" } };
    const beforeMiner = initial.ships[1]!.haulRoute;
    const panel = selectionPanel(initial, [0, 1]);
    expect(panel?.haulRoute).toEqual({ from: "home", to: "station:3", material: "Ice" });
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
      expect(selects.map((select) => select.value)).toEqual(["home", "station:3", "Ice"]);
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it("renders one material dropdown with the three material choices", () => {
    const originalDocument = globalThis.document;
    globalThis.document = fakeDocument() as unknown as Document;
    try {
      const box = new FakeElement();
      const state = haulStateForPanel();
      state.ships = state.ships.map((ship) => ({ ...ship, defaultBehaviour: "mine", mineMaterials: ["Metal", "Ice"] }));
      renderShipPanel(state, box as unknown as HTMLElement, { selectedShips: [0, 1], selectedShip: null, renderedPanel: "" });
      const select = box.children.find((child) => child.name === "mine-material")!;
      expect(select.children.map((option) => [option.value, option.textContent])).toEqual([
        ["both", "Metal and Ice"], ["Metal", "Metal"], ["Ice", "Ice"],
      ]);
      expect(select.value).toBe("both");
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it("renders Mixed options for divergent route fields", () => {
    const originalDocument = globalThis.document;
    globalThis.document = fakeDocument() as unknown as Document;
    try {
      const state = haulStateForPanel();
      state.ships[1] = { ...state.ships[1]!, haulRoute: { from: "home", to: "station:4", material: "Metal" } };
      const box = new FakeElement();
      renderShipPanel(state, box as unknown as HTMLElement, { selectedShips: [0, 1], selectedShip: null, renderedPanel: "" });
      const selects = box.children.flatMap((child) => child.children).filter((child) => child.name.startsWith("haul-"));
      expect(selects.map((select) => select.value)).toEqual(["home", "mixed", "mixed"]);
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it.each([
    ["haul-from", "station:4", { field: "from", value: "station:4" }],
    ["haul-to", "station:3", { field: "to", value: "station:3" }],
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

  it("renders site destinations in To and only storages in From", () => {
    const originalDocument = globalThis.document;
    globalThis.document = fakeDocument() as unknown as Document;
    try {
      const state = haulStateForPanel();
      state.ships = [
        { ...state.ships[0]!, defaultBehaviour: "haul", haulRoute: { from: "home", to: "station:3", material: "Ice" } },
        { ...state.ships[1]!, defaultBehaviour: "haul", haulRoute: { from: "home", to: "station:3", material: "Ice" } },
      ];
      const box = new FakeElement();
      renderShipPanel(state, box as unknown as HTMLElement, { selectedShips: [0, 1], selectedShip: null, renderedPanel: "" });
      const selects = box.children.flatMap((child) => child.children).filter((child) => child.name === "haul-from" || child.name === "haul-to");
      expect(selects.map((list) => list.children.map((option) => option.value))).toEqual([
        ["home", "station:3", "station:4"],
        ["home", "site:0", "station:3", "site:3", "station:4", "site:4"],
      ]);
      const sites = selects[1]!.children.filter((option) => option.value.startsWith("site:"));
      expect(sites.map((option) => option.textContent)).toEqual([
        "Home construction site", "Station 3 construction site", "Station 4 construction site",
      ]);
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it("applies a To pick of a construction site on the From station", () => {
    const state = haulStateForPanel();
    const next = applyHaulRouteFieldChange(state, [0], { field: "to", value: "site:0" });
    expect(next.ships[0]!.haulRoute).toEqual({ from: "home", to: "site:0", material: "Ice" });
  });

  it("reports skipped haulers by name and reason while applying the route to eligible ships", () => {
    const state = haulStateForPanel();
    state.ships[1] = { ...state.ships[1]!, haulRoute: { from: "station:3", to: "station:4", material: "Metal" } };
    const shipPanelBox = new FakeElement();
    const ui = { ...createUiState([]), selectedShips: [0, 1] };
    let current = state;
    installPanels(ui, () => current, (next) => { current = next; }, new FakeElement() as unknown as HTMLElement, shipPanelBox as unknown as HTMLElement);
    shipPanelBox.listeners.get("change")![0]!({ target: { name: "haul-to", value: "home" } } as unknown as Event);
    expect(current.ships[0]!.haulRoute?.to).toBe("station:3");
    expect(current.ships[1]!.haulRoute?.to).toBe("home");
    expect(ui.routeRefusalMessage).toBe("Skipped Ship 1: From and To must be different.");
    expect(ui.renderedPanel).toBe("");
  });

  it("clears refusal feedback on the next route pick and leaves all-valid picks quiet", () => {
    const state = haulStateForPanel();
    const shipPanelBox = new FakeElement();
    const ui = { ...createUiState([]), selectedShips: [0, 1], routeRefusalMessage: "old message" };
    let current = state;
    installPanels(ui, () => current, (next) => { current = next; }, new FakeElement() as unknown as HTMLElement, shipPanelBox as unknown as HTMLElement);
    shipPanelBox.listeners.get("change")![0]!({ target: { name: "haul-to", value: "station:4" } } as unknown as Event);
    expect(current.ships.map((ship) => ship.haulRoute?.to)).toEqual(["station:4", "station:4"]);
    expect(ui.routeRefusalMessage).toBeNull();
  });
});

describe("hauler status strings on a site route (#87 criteria 4, 5)", () => {
  function siteRouteState(): SimState {
    const initial = createInitialState(7);
    return {
      ...initial,
      stations: [
        { ...initial.stations[0]!, inventory: { Metal: 100, Ice: 100 } },
        foundedStation(3, 1, 100, 50),
      ],
      ships: [
        baseShip(initial, { id: 0, defaultBehaviour: "haul", haulRoute: makeHaulRoute("home", "site:0", "Ice") }),
      ],
    };
  }

  it("reads a hauler waiting at an empty source as Waiting at Home: no Ice (criterion 4)", () => {
    const state = siteRouteState();
    state.ships = [{ ...state.ships[0]!, state: "haulWaitingSource", cargo: 0, cargoMaterial: null }];
    const panel = selectionPanel(state, [0]);
    expect(panel?.rows.map((row) => row.status)).toEqual(["Waiting at Home: no Ice"]);
  });

  it("reads a hauler flying to the site as Hauling Ice to Home construction site (criterion 5)", () => {
    const state = siteRouteState();
    state.ships = [{ ...state.ships[0]!, state: "haulOutbound", cargo: 12, cargoMaterial: "Ice" }];
    const panel = selectionPanel(state, [0]);
    expect(panel?.rows.map((row) => row.status)).toEqual(["Hauling Ice to Home construction site"]);
  });

  it("keeps a hauler to a plain Storage reading its station name", () => {
    const state = siteRouteState();
    state.ships = [{ ...state.ships[0]!, haulRoute: makeHaulRoute("home", "station:3", "Ice"), state: "haulOutbound", cargo: 12, cargoMaterial: "Ice" }];
    const panel = selectionPanel(state, [0]);
    expect(panel?.rows.map((row) => row.status)).toEqual(["Hauling Ice to Station 3"]);
  });
});

function haulStateForPanel(): SimState {
  const initial = createInitialState(7);
  return {
    ...initial,
    stations: [
      { ...initial.stations[0]!, inventory: { Metal: 100, Ice: 100 } },
      foundedStation(3, 1, 100, 50),
      foundedStation(4, 2, 200, 50),
    ],
    ships: [
      baseShip(initial, { id: 0, defaultBehaviour: "haul", haulRoute: makeHaulRoute("home", "station:3", "Ice") }),
      baseShip(initial, { id: 1, defaultBehaviour: "haul", haulRoute: makeHaulRoute("home", "station:3", "Metal") }),
    ],
  };
}

describe("ship panel while the ship changes", () => {
  // Enough ticks for a mining ship to fly out, mine, fly home and unload.
  const CYCLE_TICKS = 1200;
  const DT = 0.5;

  beforeEach(() => {
    // The thumbnail's sprite is painted with ImageData, which Node does not have.
    vi.stubGlobal("ImageData", class { constructor(readonly data: unknown, readonly width: number, readonly height: number) {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  function valueCell(box: FakeElement, label: string): FakeElement {
    return box.children[1]!.children.find((child) => child.dataset.row === label)!;
  }

  function stateLabel(state: SimState): string {
    return shipPanel(state, 0)!.rows.find(([label]) => label === "State")![1];
  }

  it("keeps every control on the same element, in the same order, through a mining cycle", () => {
    const originalDocument = globalThis.document;
    globalThis.document = fakeDocument() as unknown as Document;
    try {
      let state = miningStart(7);
      const box = new FakeElement();
      let context = renderShipPanel(state, box as unknown as HTMLElement, { selectedShips: [0], selectedShip: null, renderedPanel: "" });
      const controls = [...box.children];
      const states = new Set<string>();
      for (let step = 0; step < CYCLE_TICKS; step++) {
        state = tick(state, DT);
        context = renderShipPanel(state, box as unknown as HTMLElement, context);
        states.add(stateLabel(state));
        expect(box.children).toHaveLength(controls.length);
        controls.forEach((control, index) => expect(box.children[index]).toBe(control));
      }
      expect(states.size).toBeGreaterThan(2);
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it("shows each ship figure and the state text as they change", () => {
    const originalDocument = globalThis.document;
    globalThis.document = fakeDocument() as unknown as Document;
    try {
      let state = miningStart(7);
      const box = new FakeElement();
      let context = renderShipPanel(state, box as unknown as HTMLElement, { selectedShips: [0], selectedShip: null, renderedPanel: "" });
      for (let step = 0; step < CYCLE_TICKS; step++) {
        state = tick(state, DT);
        context = renderShipPanel(state, box as unknown as HTMLElement, context);
        for (const [label, value] of shipPanel(state, 0)!.rows) expect(valueCell(box, label).textContent).toBe(value);
      }
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it("leaves a dropdown the player has open alone, then applies the choice they make", () => {
    const originalDocument = globalThis.document;
    const doc = fakeDocument();
    globalThis.document = doc as unknown as Document;
    try {
      let current = miningStart(7);
      const box = new FakeElement();
      let context = renderShipPanel(current, box as unknown as HTMLElement, { selectedShips: [0], selectedShip: null, renderedPanel: "" });
      const select = box.children.find((child) => child.name === "default")!;
      doc.activeElement = select;
      select.value = "none";
      const ui = { ...createUiState([]), selectedShips: [0] };
      installPanels(ui, () => current, (next) => { current = next; }, new FakeElement() as unknown as HTMLElement, box as unknown as HTMLElement);
      for (let step = 0; step < CYCLE_TICKS; step++) {
        current = tick(current, DT);
        context = renderShipPanel(current, box as unknown as HTMLElement, context);
      }
      expect(box.children.find((child) => child.name === "default")).toBe(select);
      expect(select.value).toBe("none");
      box.listeners.get("change")![0]!({ target: select } as unknown as Event);
      expect(current.ships[0]!.defaultBehaviour).toBe("none");
    } finally {
      globalThis.document = originalDocument;
    }
  });
});
