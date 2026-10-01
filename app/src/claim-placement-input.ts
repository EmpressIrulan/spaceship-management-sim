import { startClaimSite } from "sim";
import { screenToWorld } from "./camera";
import type { InputContext } from "./input-context";

export function placeClaimSite(context: InputContext, event: MouseEvent): void {
  const { ui, getState, setState, mousePoint } = context;
  const priorState = getState();
  const placed = startClaimSite(priorState, ui.currentSector, screenToWorld(ui.camera, ui.viewport, mousePoint(event)));
  if (placed !== priorState) { setState(placed); ui.pendingClaim = false; }
}
