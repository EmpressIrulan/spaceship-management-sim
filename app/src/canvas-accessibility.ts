import { sectorInGateRange, type SimState } from "sim";
import { mapLayout } from "./sectors";
import type { UiState } from "./ui-state";

export function updateCanvasLabel(ui: UiState, getState: () => SimState, canvas: HTMLCanvasElement, sectorNameEl: HTMLElement | null, rockCount: number, legacyGateVisible: boolean, gateTo: number): void {
  if (sectorNameEl) sectorNameEl.textContent = getState().sectors[ui.currentSector]!.name;
  const builtDestination = getState().gateProjects.find((project) => project.complete && project.ends.some((end) => end.sectorId === ui.currentSector))
    ?.ends.find((end) => end.sectorId !== ui.currentSector)?.sectorId;
  const gateDestination = builtDestination ?? (legacyGateVisible ? gateTo : null);
  canvas.setAttribute("aria-label", ui.mapOpen
    ? mapLayout(getState(), ui.viewport).circles.map((circle) => `${circle.name}: ${circle.ships} ships${ui.pendingGate ? `, ${circle.id === ui.pendingGate.sectorId ? "current sector" : sectorInGateRange(ui.pendingGate.sectorId, circle.id) ? "in gate range" : "out of gate range"}` : ""}`).join("; ")
    : `Sector ${getState().sectors[ui.currentSector]!.name}: ${rockCount} asteroids, ${ui.currentSector === 0 ? "station present" : "no station"}${gateDestination === null ? "" : `, gate to ${getState().sectors[gateDestination]!.name}`}`);
}
