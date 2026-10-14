import { placeStation, setSupplyStation, stationById, type SimState, type Vec } from "sim";
import type { UiState } from "./ui-state";

// Place and select a founding construction site at the supplied world point.
export function placeStationSite(
  ui: UiState,
  getState: () => SimState,
  setState: (state: SimState) => void,
  position: Vec,
): void {
  const priorState = getState();
  const placed = placeStation(priorState, ui.currentSector, position);
  if (placed === priorState) return;
  setState(placed);
  const id = placed.nextStationId - 1;
  if (stationById(placed, id)) setState(setSupplyStation(placed, id));
}
