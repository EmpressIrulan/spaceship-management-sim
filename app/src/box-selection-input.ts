import { isBoxDrag, shipsInBox } from "./selection";
import type { InputContext } from "./input-context";

export function selectBox(context: InputContext, start: { x: number; y: number }, end: { x: number; y: number }, additive: boolean): boolean {
  const { ui, getState } = context;
  if (!isBoxDrag(start, end)) return false;
  const picked = shipsInBox(getState(), ui.camera, ui.viewport, ui.currentSector, start, end);
  const priorSelection = ui.selectedShips.join(",");
  ui.selectedShips = additive ? [...new Set([...ui.selectedShips, ...picked])] : picked;
  if (ui.selectedShips.join(",") !== priorSelection) ui.routeRefusalMessage = null;
  ui.selectedShip = ui.selectedShips[0] ?? null;
  return true;
}
