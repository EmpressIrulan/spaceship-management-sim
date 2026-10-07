import { describe, expect, it } from "vitest";
import { createInitialState, placeStation } from "sim";
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
    const state = placeStation(createInitialState(7), 0, { x: 900, y: 900 });
    const ui = createUiState([]);
    const button = new FakeButton();
    button.dataset.queuedBuild = "1";
    button.dataset.stationId = "1";

    installCancelHoverInput(ui, () => state, button as unknown as HTMLButtonElement);

    button.fire("pointerenter");
    expect(ui.cancelHoveredBuild).toEqual({ position: state.stations[1]!.buildQueue[1]!.position, stationId: 1 });

    button.fire("pointerleave");
    expect(ui.cancelHoveredBuild).toBeNull();
  });
});
