import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState, giveDockOrder, type SimState } from "sim";
import { installContextMenu } from "./context-menu";
import { installPanels } from "./panels";
import { createUiState } from "./ui-state";
import { dockAtHoveredCarrier } from "./hangar-input";

const hoveredBodyMock = vi.hoisted(() => vi.fn((..._args: unknown[]): { kind: "ship"; index: number } | null => ({ kind: "ship", index: 0 })));
vi.mock("./camera", async (importOriginal) => ({
  ...await importOriginal<typeof import("./camera")>(),
  hoveredBody: (...args: Parameters<typeof import("./camera").hoveredBody>) => hoveredBodyMock(...args),
  screenToWorld: () => ({ x: 50, y: 50 }),
}));

class FakeTarget {
  listeners = new Map<string, (event: any) => void>();
  addEventListener(name: string, listener: (event: any) => void): void { this.listeners.set(name, listener); }
  fire(name: string, event: any): void { this.listeners.get(name)?.(event); }
  contains(): boolean { return false; }
}

afterEach(() => vi.unstubAllGlobals());

describe("hangar actions", () => {
  it("right-clicking the hovered carrier issues a dock order through context-menu", () => {
    const documentTarget = new FakeTarget();
    const windowTarget = new FakeTarget();
    vi.stubGlobal("document", documentTarget);
    vi.stubGlobal("window", windowTarget);
    vi.stubGlobal("performance", { now: () => 10_000 });

    const initial = createInitialState(4);
    const carrierDesign = { width: 41, height: 1, slots: ["Engine", ...Array(40).fill("Hangar")] } as const;
    const state = { ...initial, ships: [
      { ...initial.ships[0]!, id: 1, design: carrierDesign },
      { ...initial.ships[0]!, id: 2, position: { x: 0, y: 0 } },
    ] } as SimState;
    const ui = { ...createUiState([]), selectedShips: [2], currentSector: 0, viewport: { width: 100, height: 100 } };
    const canvas = new FakeTarget();
    const menu = new FakeTarget() as unknown as HTMLElement;
    const stationButton = new FakeTarget();
    let current = state;
    installContextMenu(ui, () => current, (next) => { current = next; }, canvas as unknown as HTMLCanvasElement,
      menu, stationButton as unknown as HTMLButtonElement, () => ({ x: 50, y: 50 }));

    canvas.fire("contextmenu", { preventDefault() {} });

    expect(current.ships.find((ship) => ship.id === 2)?.order).toEqual({ kind: "dock", carrierId: 1 });
    expect(current.ships.find((ship) => ship.id === 2)?.state).toBe("docking");
  });

  it("refused docking leaves orders unchanged and shows the reason", () => {
    const documentTarget = new FakeTarget();
    const windowTarget = new FakeTarget();
    vi.stubGlobal("document", documentTarget);
    vi.stubGlobal("window", windowTarget);
    vi.stubGlobal("performance", { now: () => 10_000 });
    const initial = createInitialState(4);
    const carrierDesign = { width: 2, height: 1, slots: ["Engine", "Hangar"] } as const;
    const state = { ...initial, ships: [
      { ...initial.ships[0]!, id: 1, design: carrierDesign },
      { ...initial.ships[0]!, id: 2, order: { kind: "move" as const, target: { x: 80, y: 80 } } },
      { ...initial.ships[0]!, id: 3, state: "docked" as const, hangarId: 1 },
    ] } as SimState;
    const ui = { ...createUiState([]), selectedShips: [2], currentSector: 0, viewport: { width: 100, height: 100 } };
    const canvas = new FakeTarget();
    installContextMenu(ui, () => state, () => {}, canvas as unknown as HTMLCanvasElement,
      new FakeTarget() as unknown as HTMLElement, new FakeTarget() as unknown as HTMLButtonElement, () => ({ x: 50, y: 50 }));
    canvas.fire("contextmenu", { preventDefault() {} });
    expect(state.ships.find((ship) => ship.id === 2)?.order).toEqual({ kind: "move", target: { x: 80, y: 80 } });
    expect(ui.routeRefusalMessage).toContain("hangar is full");
  });

  it("cross-sector right-click on a carrier falls through to a move order", () => {
    const documentTarget = new FakeTarget();
    const windowTarget = new FakeTarget();
    vi.stubGlobal("document", documentTarget);
    vi.stubGlobal("window", windowTarget);
    vi.stubGlobal("performance", { now: () => 10_000 });
    hoveredBodyMock.mockReset()
      .mockReturnValueOnce({ kind: "ship", index: 0 })
      .mockReturnValueOnce(null);
    const initial = createInitialState(4);
    const carrierDesign = { width: 2, height: 1, slots: ["Engine", "Hangar"] } as const;
    const state = { ...initial, ships: [
      { ...initial.ships[0]!, id: 1, design: carrierDesign, sectorId: 0 },
      { ...initial.ships[0]!, id: 2, sectorId: 1, order: null },
    ] } as SimState;
    const ui = { ...createUiState([]), selectedShips: [2], currentSector: 0, viewport: { width: 100, height: 100 } };
    const canvas = new FakeTarget();
    let current = state;
    installContextMenu(ui, () => current, (next) => { current = next; }, canvas as unknown as HTMLCanvasElement,
      new FakeTarget() as unknown as HTMLElement, new FakeTarget() as unknown as HTMLButtonElement, () => ({ x: 50, y: 50 }));
    canvas.fire("contextmenu", { preventDefault() {} });
    expect(current.ships.find((ship) => ship.id === 2)?.order).toEqual({ kind: "move", point: { x: 50, y: 50 }, sectorId: 0 });
  });

  it("clears a prior dock refusal after a move order goes through", () => {
    const documentTarget = new FakeTarget();
    const windowTarget = new FakeTarget();
    vi.stubGlobal("document", documentTarget);
    vi.stubGlobal("window", windowTarget);
    hoveredBodyMock.mockReset().mockReturnValue(null);
    const initial = createInitialState(4);
    const state = { ...initial, ships: [{ ...initial.ships[0]!, id: 2, order: null }] } as SimState;
    const ui = { ...createUiState([]), selectedShips: [2], currentSector: 0, viewport: { width: 100, height: 100 }, routeRefusalMessage: "Skipped Ship 3: hangar is full." };
    const canvas = new FakeTarget();
    let current = state;
    installContextMenu(ui, () => current, (next) => { current = next; }, canvas as unknown as HTMLCanvasElement,
      new FakeTarget() as unknown as HTMLElement, new FakeTarget() as unknown as HTMLButtonElement, () => ({ x: 50, y: 50 }));
    canvas.fire("contextmenu", { preventDefault() {} });
    expect(current.ships.find((ship) => ship.id === 2)?.order).toEqual({ kind: "move", point: { x: 50, y: 50 }, sectorId: 0 });
    expect(ui.routeRefusalMessage).toBeNull();
  });

  it("shows on-screen hangar count from the updated reservation state", async () => {
    const { hangarPanelRows } = await import("./hangar-panel");
    const initial = createInitialState(4);
    const carrierDesign = { width: 2, height: 1, slots: ["Engine", "Hangar"] } as const;
    const carrier = { ...initial.ships[0]!, id: 1, design: carrierDesign };
    const incoming = { ...initial.ships[0]!, id: 2, state: "docking" as const, order: { kind: "dock" as const, carrierId: 1 } };
    const state = { ...initial, ships: [carrier, incoming] } as SimState;
    expect(hangarPanelRows(state, 1)[0]?.[1]).toContain("incoming");
    expect(hangarPanelRows({ ...state, ships: [carrier, { ...incoming, state: "holding", order: null }] } as SimState, 1)[0]?.[1]).toBe("0/1");
  });

  it("shows why a carrier with its own dock order refuses docking", () => {
    const initial = createInitialState(4);
    const carrierDesign = { width: 2, height: 1, slots: ["Engine", "Hangar"] } as const;
    const carrier = { ...initial.ships[0]!, id: 1, design: carrierDesign, order: { kind: "dock" as const, carrierId: 9 } };
    const ship = { ...initial.ships[0]!, id: 2, order: { kind: "move" as const, point: { x: 80, y: 80 }, sectorId: 0 } };
    const state = { ...initial, ships: [carrier, ship] } as SimState;
    const result = dockAtHoveredCarrier(state, [2], { kind: "ship", index: 0 });
    expect(result?.state).toBe(state);
    expect(result?.refused[0]).toContain("carrier is docking elsewhere");
    expect(ship.order).toEqual({ kind: "move", point: { x: 80, y: 80 }, sectorId: 0 });
  });

  it("clicking Launch all in the selected-ship panel releases the docked ships", () => {
    const initial = createInitialState(5);
    const carrierDesign = { width: 41, height: 1, slots: ["Engine", ...Array(40).fill("Hangar")] } as const;
    const state = { ...initial, ships: [
      { ...initial.ships[0]!, id: 1, design: carrierDesign },
      { ...initial.ships[0]!, id: 2, state: "docked" as const, hangarId: 1 },
    ] } as SimState;
    const panel = new FakeTarget();
    let current = state;
    installPanels(createUiState([]), () => current, (next) => { current = next; }, new FakeTarget() as unknown as HTMLElement,
      panel as unknown as HTMLElement);

    panel.fire("click", { target: { closest: (selector: string) => selector === "button[data-launch-all]"
      ? { dataset: { launchAll: "1" } } : null } });

    expect(current.ships.find((ship) => ship.id === 2)?.hangarId).toBeNull();
  });
});
