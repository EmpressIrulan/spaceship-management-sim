import { describe, expect, it } from "vitest";
import { createInitialState } from "sim";
import { installCancelHoverInput } from "./cancel-hover-input";
import { createUiState } from "./ui-state";

class FakeButton {
  dataset: Record<string, string> = {};
  listeners = new Map<string, () => void>();

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }

  fire(name: string): void {
    this.listeners.get(name)?.();
  }
}

describe("cancel hover input", () => {
  it("wires pointerenter and pointerleave to the queued build highlight", () => {
    const state = createInitialState(7);
    state.stations[0]!.buildQueue = [{ type: "Storage", position: { x: 80, y: 0 }, size: { width: 30, height: 40 } }];
    const ui = createUiState([]);
    const button = new FakeButton();
    button.dataset.queuedBuild = "0";

    installCancelHoverInput(ui, () => state, button as unknown as HTMLButtonElement);

    button.fire("pointerenter");
    expect(ui.cancelHoveredBuild).toEqual({ x: 80, y: 0 });

    button.fire("pointerleave");
    expect(ui.cancelHoveredBuild).toBeNull();
  });
});
