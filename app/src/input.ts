import type { SimState, Vec } from "sim";
import type { UiState } from "./ui-state";
import type { InputActions, InputContext } from "./input-context";
import { installCameraInput } from "./camera-input";
import { installInfoBoxInput } from "./info-box-input";
import { installCancelHoverInput } from "./cancel-hover-input";
import { installRenameInput } from "./rename-input";
import { installSpeedInput } from "./speed-input";
import { isBoxDrag } from "./selection";
import { placeStationSite } from "./station-site-input";
import { placeGate } from "./gate-placement-input";
import { selectBox } from "./box-selection-input";
import { navigateMap } from "./map-navigation-input";
import { selectClick } from "./click-selection-input";

export interface InputElements {
  canvas: HTMLCanvasElement;
  box: HTMLElement;
  infoAction: HTMLButtonElement;
  renameBox: HTMLInputElement;
  speedControls: HTMLElement;
  storagePanel: HTMLElement;
  buildControls: HTMLElement;
  ctx: CanvasRenderingContext2D;
}

export { type InputActions } from "./input-context";

export function mousePoint(canvas: HTMLCanvasElement, event: MouseEvent): Vec {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

export function installInput(
  ui: UiState,
  getState: () => SimState,
  setState: (state: SimState) => void,
  elements: InputElements,
  actions: InputActions,
): (sectorId: number) => void {
  const {
    canvas,
    box,
    infoAction,
    renameBox,
    speedControls,
    storagePanel,
    buildControls,
    ctx,
  } = elements;
  const pointFromEvent = (event: MouseEvent): Vec => mousePoint(canvas, event);
  const startRename = installRenameInput(ui, getState, setState, renameBox);
  const {
    closeStoragePanel,
    closeBuildMenu,
    closeGateMenu,
    openShipMenu,
    closeShipMenu,
  } = actions;
  const context: InputContext = {
    ui,
    getState,
    setState,
    canvas,
    storagePanel,
    closeStoragePanel,
    openShipMenu,
    startRename,
    mousePoint: pointFromEvent,
  };

  installCameraInput(ui, getState, canvas, ctx, pointFromEvent, buildControls);
  installInfoBoxInput(ui, getState, setState, box, infoAction);
  installCancelHoverInput(ui, getState, infoAction);
  installSpeedInput(ui, speedControls, {
    closeBuildMenu,
    closeGateMenu,
    closeShipMenu,
  });

  window.addEventListener("mouseup", (event) => {
    if (event.button === 1) ui.pan = null;
    if (event.button !== 0 || !ui.dragBox) return;

    const { start, end, additive } = ui.dragBox;
    ui.dragBox = null;
    const click = !isBoxDrag(start, end);
    if (click && event.target === canvas && ui.pendingStation && !ui.mapOpen) {
      placeStationSite(context, event);
    } else if (
      click &&
      event.target === canvas &&
      ui.pendingGate?.targetSector === ui.currentSector
    ) {
      placeGate(context, event);
    } else if (selectBox(context, start, end, additive)) {
      return;
    } else if (navigateMap(context, event)) {
      return;
    } else {
      selectClick(context, event, additive);
    }
  });
  return startRename;
}
