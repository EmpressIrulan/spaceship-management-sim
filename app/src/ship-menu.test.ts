import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState, damageStationModule } from "sim";
import { installShipMenu } from "./ship-menu";
import { syncShipMenuStats } from "./ship-menu-rendering";
import { createUiState } from "./ui-state";
import { hoveredBody, worldToScreen } from "./camera";
import { infoBox } from "./labels";

class Element {
  hidden = false;
  disabled = false;
  textContent = "";
  value = "";
  className = "";
  dataset: Record<string, string> = {};
  style = {};
  classList = { toggle: () => {} };
  listeners = new Map<string, (event: Event) => void>();
  nodes = new Map<string, Element>();
  append(): void {}
  replaceChildren(): void {}
  setAttribute(): void {}
  addEventListener(name: string, listener: (event: Event) => void): void { this.listeners.set(name, listener); }
  querySelector(selector: string): Element {
    if (!this.nodes.has(selector)) this.nodes.set(selector, new Element());
    return this.nodes.get(selector)!;
  }
  querySelectorAll(): Element[] { return []; }
  closest(): Element { return this; }
}

afterEach(() => vi.unstubAllGlobals());

function opened() {
  vi.stubGlobal("window", { addEventListener: () => {} });
  vi.stubGlobal("document", { createElement: () => new Element(), createTextNode: () => new Element() });
  let state = createInitialState(7);
  state.ships = [];
  state.stations[0]!.modules.push(...[-40, 40].map(y => ({ type: "Builder" as const, position: { x: 0, y }, size: { width: 30, height: 40 }, hp: y === -40 ? 21 : 32 })));
  const ui = createUiState([]);
  ui.camera = { center: { x: 0, y: 0 }, zoom: 2 };
  ui.viewport = { width: 800, height: 600 };
  const menu = new Element();
  const system = installShipMenu(ui, () => state, next => { state = next; }, menu as unknown as HTMLElement, new Element() as unknown as HTMLElement, { getItem: () => null, setItem: () => {} });
  system.openShipMenu(2);
  ui.draft.cells.set("0,0", "Engine");
  return { ui, menu, getState: () => state,
    destroy: (position: { x: number; y: number }) => { state = { ...state, stations: [damageStationModule(state.stations[0]!, position, 40, 1).station] }; },
    click: (data: Record<string, string>) => {
      const target = new Element();
      target.dataset = data;
      menu.listeners.get("click")!({ target } as unknown as Event);
    },
  };
}

describe("Builder identity after module destruction", () => {
  it("remaps before a Build click, even before the next render", () => {
    const demo = opened();
    demo.destroy({ x: 40, y: 0 });
    demo.click({ build: "" });
    expect(demo.ui.shipMenuBuilder).toBe(1);
    expect(demo.getState().stations[0]!.shipBuilds.map(job => job.builder)).toEqual([1]);
  });

  it("remaps the open menu on render and keeps a still pointer on the same Builder", () => {
    const demo = opened();
    const pointer = worldToScreen(demo.ui.camera, demo.ui.viewport, { x: 0, y: -40 });
    expect(hoveredBody(demo.getState(), demo.ui.camera, demo.ui.viewport, pointer)).toMatchObject({ kind: "module", index: 2 });
    demo.destroy({ x: 40, y: 0 });
    syncShipMenuStats(demo.ui, demo.getState, demo.menu as unknown as HTMLElement);
    const hovered = hoveredBody(demo.getState(), demo.ui.camera, demo.ui.viewport, pointer);
    expect(hovered).toMatchObject({ kind: "module", index: 1 });
    expect(infoBox(demo.getState(), hovered)?.line).toContain("HP 21/40");
    expect(demo.ui.shipMenuBuilder).toBe(1);
  });

  it("closes a destroyed Builder instead of sending Build to the other Builder", () => {
    const demo = opened();
    demo.destroy({ x: 0, y: -40 });
    demo.click({ build: "" });
    expect(demo.ui.shipMenuBuilder).toBeNull();
    expect(demo.menu.hidden).toBe(true);
    expect(demo.getState().stations[0]!.shipBuilds).toEqual([]);
  });
});
