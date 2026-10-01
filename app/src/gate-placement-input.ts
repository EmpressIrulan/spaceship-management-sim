import { startGateBuild } from "sim";
import { screenToWorld } from "./camera";
import type { InputContext } from "./input-context";

export function placeGate(context: InputContext, event: MouseEvent): void {
  const { ui, getState, setState, mousePoint } = context;
  const pendingGate = ui.pendingGate!;
  setState(startGateBuild(getState(), pendingGate.sectorId, pendingGate.position, ui.currentSector,
    screenToWorld(ui.camera, ui.viewport, mousePoint(event))));
  ui.pendingGate = null;
}
