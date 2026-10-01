import { launchAll, removeClaimSite } from "sim";
import type { UiState } from "./ui-state";

export function installInfoBoxInput(ui: UiState, getState: () => import("sim").SimState, setState: (state: import("sim").SimState) => void, box: HTMLElement, infoAction: HTMLButtonElement): void {
  infoAction.addEventListener("click", () => {
    if (infoAction.dataset.carrier !== undefined) setState(launchAll(getState(), Number(infoAction.dataset.carrier)));
    else if (infoAction.dataset.site !== undefined) setState(removeClaimSite(getState(), Number(infoAction.dataset.site)));
    ui.stickySite = null;
    ui.infoHovered = false;
  });
  box.addEventListener("pointerenter", () => { ui.infoHovered = true; });
  box.addEventListener("pointerleave", () => { ui.infoHovered = false; });
}
