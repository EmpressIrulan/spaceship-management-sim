import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState, giveDockOrder, type SimState } from "sim";
import { installContextMenu } from "./context-menu";
import { installPanels } from "./panels";
import { createUiState } from "./ui-state";

vi.mock("./camera", async (importOriginal) => ({
  ...await importOriginal<typeof import("./camera")>(),
  hoveredBody: () => ({ kind: "ship", index: 0 }),
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
    const claimButton = new FakeTarget();
    let current = state;
    installContextMenu(ui, () => current, (next) => { current = next; }, canvas as unknown as HTMLCanvasElement,
      menu, claimButton as unknown as HTMLButtonElement, () => ({ x: 50, y: 50 }));

    canvas.fire("contextmenu", { preventDefault() {} });

    expect(current.ships.find((ship) => ship.id === 2)?.order).toEqual({ kind: "dock", carrierId: 1 });
    expect(current.ships.find((ship) => ship.id === 2)?.state).toBe("docking");
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
