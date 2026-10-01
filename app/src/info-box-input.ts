import { removeClaimSite } from "sim";
import type { UiState } from "./ui-state";

export function installInfoBoxInput(ui: UiState, getState: () => import("sim").SimState, setState: (state: import("sim").SimState) => void, box: HTMLElement, infoAction: HTMLButtonElement): void {
  infoAction.addEventListener("click", () => {
    const siteId = Number(infoAction.dataset.site);
    setState(removeClaimSite(getState(), siteId));
    ui.stickySite = null;
    ui.infoHovered = false;
  });
  box.addEventListener("pointerenter", () => { ui.infoHovered = true; });
  box.addEventListener("pointerleave", () => { ui.infoHovered = false; });
}
