import { placeStation, setSupplyStation, stationById } from "sim";
import { screenToWorld } from "./camera";
import type { InputContext } from "./input-context";

// The click that "Build station" has been waiting for: the spot becomes a
// founding construction site, and it is the site ships supply until another
// one is selected.
export function placeStationSite(context: InputContext, event: MouseEvent): void {
  const { ui, getState, setState, mousePoint } = context;
  const priorState = getState();
  const placed = placeStation(priorState, ui.currentSector, screenToWorld(ui.camera, ui.viewport, mousePoint(event)));
  if (placed === priorState) return;
  setState(placed);
  ui.pendingStation = false;
  const id = placed.nextStationId - 1;
  if (stationById(placed, id)) setState(setSupplyStation(placed, id));
}
