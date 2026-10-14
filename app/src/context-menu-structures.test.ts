import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState, tick, type SimState } from "sim";
import { installContextMenu } from "./context-menu";
import { worldToScreen } from "./camera";
import { createUiState } from "./ui-state";

class Target {
  listeners = new Map<string, (event: any) => void>();
  hidden = true;
  style = {};
  addEventListener(name: string, listener: (event: any) => void): void { this.listeners.set(name, listener); }
  contains(): boolean { return false; }
}
afterEach(() => vi.unstubAllGlobals());

describe("structure orders underneath parked ships", () => {
  it.each(["dock", "site", "gate"] as const)("right-clicks the %s rather than its damaged parked ship", (kind) => {
    vi.stubGlobal("document", new Target()); vi.stubGlobal("window", new Target());
    const state = createInitialState(7);
    const station = state.stations[0]!;
    if (kind === "site") station.buildQueue = [{ type: "Builder", position: {x: 500,y: 500},size: {width: 10,height: 10} }];
    state.gateProjects = [{ id: 3, ends: [{sectorId: 0, position: {x: 300,y: 100}}, {sectorId: 1,position: {x: 300,y: 100}}], delivered: {Metal: 0,Ice: 0},complete: false }];
    const position = kind === "dock" ? station.dock.position : kind === "site" ? station.constructionSite.position : state.gateProjects[0]!.ends[0]!.position;
    const base = state.ships[0]!;
    state.ships = [{...base, id: 10, position: {x: -100,y: -100}, cargo: 5,cargoMaterial: "Metal",state: "holding",order: null,leg: null,berth: null},
      {...base,id: 11,position,state: "holding",hp: 10,maxHp: 40,order: null,leg: null,berth: null}];
    const ui = createUiState([]); ui.camera = {center: {x: 0,y: 0},zoom: 1}; ui.viewport = {width:800,height:600}; ui.selectedShips = [10];
    const canvas = new Target(); let current: SimState = state;
    installContextMenu(ui, () => current, next => {current = next;}, canvas as unknown as HTMLCanvasElement,
      new Target() as unknown as HTMLElement, () => worldToScreen(ui.camera,ui.viewport,position));
    canvas.listeners.get("contextmenu")!({preventDefault() {}});
    expect(current.ships[0]!.order?.kind).toBe(kind === "dock" ? "home" : kind === "site" ? "supplyBuild" : "haulGate");
    current = tick(current, 1 / 60);
    expect(current.ships[0]!.order?.kind).toBe(kind === "dock" ? "home" : kind === "site" ? "supplyBuild" : "haulGate");
  });

  it("still allows an open-space damaged ship to receive a repair order", () => {
    vi.stubGlobal("document", new Target()); vi.stubGlobal("window", new Target());
    const state = createInitialState(7); const base = state.ships[0]!;
    const position = {x: 300,y: 300};
    state.ships = [{...base,id: 10,design: {width: 2,height: 1,slots: ["Engine","Repair"]},position: {x: 250,y: 300},state: "holding",order: null,leg: null,berth: null},
      {...base,id: 11,position,state: "holding",hp: 10,maxHp: 40,order: null,leg: null,berth: null}];
    const ui = createUiState([]); ui.camera = {center: {x: 300,y: 300},zoom: 1}; ui.viewport = {width:800,height:600}; ui.selectedShips = [10];
    const canvas = new Target(); let current: SimState = state;
    installContextMenu(ui, () => current, next => {current = next;}, canvas as unknown as HTMLCanvasElement,
      new Target() as unknown as HTMLElement, () => worldToScreen(ui.camera,ui.viewport,position));
    canvas.listeners.get("contextmenu")!({preventDefault() {}});
    expect(current.ships[0]!.order).toEqual({kind: "repair",target: {kind: "ship",shipId: 11}});
    current = tick(current, 1 / 60);
    expect(current.ships[0]!.repairTarget).toEqual({kind: "ship",shipId: 11});
  });
});
