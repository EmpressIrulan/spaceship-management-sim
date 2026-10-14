import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState, stationById } from "sim";
import { installContextMenu } from "./context-menu";
import { createUiState } from "./ui-state";

const hoveredBodyMock = vi.hoisted(() => vi.fn(() => null));
vi.mock("./camera", async (importOriginal) => ({
  ...await importOriginal<typeof import("./camera")>(),
  hoveredBody: () => hoveredBodyMock(),
  screenToWorld: () => ({ x: 125, y: 225 }),
}));

class Target {
  listeners = new Map<string, (event: any) => void>();
  hidden = true;
  style: Record<string, string> = {};
  addEventListener(name: string, listener: (event: any) => void): void { this.listeners.set(name, listener); }
  fire(name: string, event: any): void { this.listeners.get(name)?.(event); }
  contains(): boolean { return false; }
}

afterEach(() => vi.unstubAllGlobals());

describe("empty-space build menu", () => {
  it("opens in any sector and builds a supplied construction site at the right-click point", () => {
    vi.stubGlobal("document", new Target());
    vi.stubGlobal("window", new Target());
    const initial = createInitialState(8);
    const ui = { ...createUiState([]), currentSector: 2, viewport: { width: 500, height: 500 } };
    const canvas = new Target();
    const menu = new Target();
    let current = initial;
    installContextMenu(ui, () => current, (next) => { current = next; }, canvas as unknown as HTMLCanvasElement,
      menu as unknown as HTMLElement, new Target() as unknown as HTMLButtonElement, () => ({ x: 25, y: 35 }));

    canvas.fire("contextmenu", { preventDefault() {} });
    expect(menu.hidden).toBe(false);
    expect(ui.pendingGate).toEqual({ sectorId: 2, position: { x: 125, y: 225 } });
    menu.fire("click", { target: { closest: (selector: string) => selector === "[data-build-station]" ? {} : null } });

    const site = stationById(current, current.nextStationId - 1);
    expect(site?.sectorId).toBe(2);
    expect(site?.constructionSite.position).toEqual({ x: 125, y: 225 });
    expect(current.supplyStation).toBe(site?.id);
    expect(menu.hidden).toBe(true);
  });
});
