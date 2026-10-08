import { afterEach, describe, expect, it, vi } from "vitest";
import { installSpeedInput, isTextEntryTarget } from "./speed-input";
import { createUiState } from "./ui-state";

afterEach(() => vi.unstubAllGlobals());

describe("keyboard shortcut targets", () => {
  it("recognizes text boxes and editable content as text entry", () => {
    expect(isTextEntryTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
  });

  it("recognizes editable ancestors", () => {
    expect(isTextEntryTarget({ parentElement: { isContentEditable: true } } as unknown as EventTarget)).toBe(true);
  });

  it("does not run any shortcut from a text box, but still toggles the map outside it", () => {
    const listeners = new Map<string, (event: KeyboardEvent) => void>();
    vi.stubGlobal("window", {
      addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener as (event: KeyboardEvent) => void),
    });
    const ui = createUiState([]);
    installSpeedInput(ui, { addEventListener: () => undefined } as unknown as HTMLElement, {
      closeBuildMenu: () => undefined,
      closeGateMenu: () => undefined,
      closeShipMenu: () => undefined,
    });
    const keydown = listeners.get("keydown")!;
    const press = (key: string, target: EventTarget) => keydown({
      key, target, repeat: false, preventDefault: () => undefined,
    } as unknown as KeyboardEvent);

    const input = { tagName: "INPUT" } as unknown as EventTarget;
    for (const key of ["Escape", "m", "1", "2", "3", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      press(key, input);
    }
    expect(ui.mapOpen).toBe(false);
    expect(ui.clock).toEqual({ speed: 1, paused: false });
    expect(ui.heldKeys.size).toBe(0);

    press("m", { tagName: "BODY" } as unknown as EventTarget);
    expect(ui.mapOpen).toBe(true);
  });
});
