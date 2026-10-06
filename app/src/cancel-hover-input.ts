import type { SimState, Vec } from "sim";
import type { UiState } from "./ui-state";

// Hovering a ghost's Cancel control shows which ghosts the click would take with
// it, so the promise is on screen before the click. The button is shared by every
// info box, so the hovered ghost comes from the dataset the box already writes
// each frame rather than from which button it is.
//
// The position is kept rather than the queue index: builds finish under a
// pointer that has not moved, and the queue shifts as they do. A ghost that has
// left the queue by then simply highlights nothing.
export function installCancelHoverInput(
  ui: UiState,
  getState: () => SimState,
  infoAction: HTMLButtonElement,
): void {
  function hoveredBuild(): Vec | null {
    const index = infoAction.dataset.queuedBuild;
    if (index === undefined) return null;
    const queued = homeStation(getState()).buildQueue[Number(index)];
    return queued ? { ...queued.position } : null;
  }

  infoAction.addEventListener("pointerenter", () => { ui.cancelHoveredBuild = hoveredBuild(); });
  infoAction.addEventListener("pointerleave", () => { ui.cancelHoveredBuild = null; });
}
import { homeStation } from "sim";
