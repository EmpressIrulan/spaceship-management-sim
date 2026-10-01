import type { SimState } from "sim";
import type { UiState } from "./ui-state";

export interface InputActions {
  closeStoragePanel: () => void;
  closeBuildMenu: () => void;
  closeGateMenu: () => void;
  openShipMenu: (builder: number) => void;
  closeShipMenu: () => void;
}

export interface InputContext {
  ui: UiState;
  getState: () => SimState;
  setState: (state: SimState) => void;
  canvas: HTMLCanvasElement;
  storagePanel: HTMLElement;
  closeStoragePanel: () => void;
  openShipMenu: (builder: number) => void;
  startRename: (sectorId: number) => void;
  mousePoint: (event: MouseEvent) => { x: number; y: number };
}
