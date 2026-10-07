import { cancelQueuedModuleBuild, launchAll } from "sim";
import type { UiState } from "./ui-state";

export function installInfoBoxInput(ui: UiState, getState: () => import("sim").SimState, setState: (state: import("sim").SimState) => void, box: HTMLElement, infoAction: HTMLButtonElement): void {
  infoAction.addEventListener("click", () => {
    if (infoAction.dataset.carrier !== undefined) setState(launchAll(getState(), Number(infoAction.dataset.carrier)));
    else if (infoAction.dataset.queuedBuild !== undefined) setState(cancelQueuedModuleBuild(getState(), Number(infoAction.dataset.queuedBuild), Number(infoAction.dataset.stationId ?? 0)));
    ui.stickyQueuedBuild = null;
    ui.cancelHoveredBuild = null;
    ui.infoHovered = false;
  });
  box.addEventListener("pointerenter", () => { ui.infoHovered = true; });
  box.addEventListener("pointerleave", () => { ui.infoHovered = false; });
}
