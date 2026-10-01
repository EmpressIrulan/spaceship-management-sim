import {
  CLAIM_SITE_SIZE, removeClaimSite, renameSector, startClaimSite, startGateBuild,
  type Material, type ModuleType, type SimState, type Vec,
} from "sim";
import { fitCamera, hoveredBody, panBy, screenToWorld, wheelZoomFactor, zoomAt, type Viewport } from "./camera";
import { gateTargetAllowed, mapHit, mapLayout, mapToggled, renameHit, type PendingGate } from "./sectors";
import { dismissBuildMenuForKey } from "./building";
import { clockAfterButton, clockAfterKey, type SpeedButtonId } from "./speed";
import { contextOrderAllowed, isBoxDrag, keyPan, shipsInBox, toggleShip } from "./selection";
import { storagePanelOpenAfterClick } from "./storage";
import { openStoragePanel } from "./storage-panel";
import type { UiState } from "./main";

export interface InputElements { canvas: HTMLCanvasElement; box: HTMLElement; infoAction: HTMLButtonElement; renameBox: HTMLInputElement; speedControls: HTMLElement; storagePanel: HTMLElement; ctx: CanvasRenderingContext2D; }
export interface InputActions { closeStoragePanel: () => void; closeBuildMenu: () => void; closeGateMenu: () => void; openShipMenu: (builder: number) => void; closeShipMenu: () => void; }
export function mousePoint(canvas: HTMLCanvasElement, event: MouseEvent): Vec {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}
export function installInput(ui: UiState, getState: () => SimState, setState: (state: SimState) => void,
  elements: InputElements, actions: InputActions): void {
  const { canvas, box, infoAction, renameBox, speedControls, storagePanel } = elements;
  const { closeStoragePanel, closeBuildMenu, closeGateMenu, openShipMenu, closeShipMenu } = actions;
  const resize = (): void => {
    const ratio = window.devicePixelRatio || 1;
    ui.viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
    canvas.width = Math.round(ui.viewport.width * ratio);
    canvas.height = Math.round(ui.viewport.height * ratio);
    elements.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    elements.ctx.imageSmoothingEnabled = false;
  };
  window.addEventListener("resize", resize);
  resize();
  ui.camera = fitCamera(ui.viewport, [getState().station.dock, getState().station.storage, ...getState().asteroids.filter((rock) => rock.sectorId === 0), getState().sectors[0]!.gate]);
infoAction.addEventListener("click", () => {
  const siteId = Number(infoAction.dataset.site);
  setState(removeClaimSite(getState(), siteId));
  ui.stickySite = null;
  ui.infoHovered = false;
});
box.addEventListener("pointerenter", () => { ui.infoHovered = true; });
box.addEventListener("pointerleave", () => { ui.infoHovered = false; });

function startRename(sectorId: number): void {
  ui.renamingSector = sectorId;
  renameBox.value = getState().sectors[sectorId]!.name;
  renameBox.hidden = false;
  renameBox.focus();
  renameBox.select();
}

// Keys typed into the name box are not map or camera keys.
renameBox.addEventListener("keydown", (event) => {
  event.stopPropagation();
  if (event.key === "Enter" && ui.renamingSector !== null) {
    setState(renameSector(getState(), ui.renamingSector, renameBox.value));
    ui.renamingSector = null;
  } else if (event.key === "Escape") ui.renamingSector = null;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") ui.pendingClaim = false;
  if (event.key.toLowerCase() === "m" || event.key === "Escape") ui.mapOpen = mapToggled(ui.mapOpen, event.key);
  if (event.key === "Escape") closeGateMenu();
  if (ui.buildMenuOpen && dismissBuildMenuForKey(event.key)) closeBuildMenu();
  if (ui.shipMenuBuilder !== null && event.key === "Escape") closeShipMenu();
  if (!(event.target instanceof HTMLSelectElement) && !(event.target instanceof HTMLInputElement)) {
    ui.heldKeys.add(event.key);
    const next = clockAfterKey(ui.clock, event.key, event.repeat);
    if (next !== ui.clock || event.key === " ") { ui.clock = next; event.preventDefault(); }
  }
  if (event.key.startsWith("Arrow")) event.preventDefault();
});
window.addEventListener("keyup", (event) => { ui.heldKeys.delete(event.key); ui.heldKeys.delete(event.key.toLowerCase()); });
window.addEventListener("blur", () => ui.heldKeys.clear());

speedControls.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-speed]");
  if (!target) return;
  ui.clock = clockAfterButton(ui.clock, target.dataset.speed as SpeedButtonId);
  // Focus would make a later Space press click this button as well.
  target.blur();
});

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    ui.camera = zoomAt(ui.camera, ui.viewport, mousePoint(canvas, event), wheelZoomFactor(event.deltaY));
  },
  { passive: false },
);

canvas.addEventListener("mousedown", (event) => {
  const point = mousePoint(canvas, event);
  if (event.button === 1) { event.preventDefault(); ui.pan = { last: point }; }
  else if (event.button === 0) ui.dragBox = { start: point, end: point, additive: event.shiftKey };
});

canvas.addEventListener("mousemove", (event) => {
  ui.pointer = mousePoint(canvas, event);
});

canvas.addEventListener("mouseleave", () => {
  ui.pointer = null;
});

window.addEventListener("mousemove", (event) => {
  const point = mousePoint(canvas, event);
  if (ui.pan) { ui.camera = panBy(ui.camera, point.x - ui.pan.last.x, point.y - ui.pan.last.y); ui.pan.last = point; }
  if (ui.dragBox) ui.dragBox.end = point;
});

window.addEventListener("mouseup", (event) => {
  if (event.button === 1) ui.pan = null;
  if (event.button === 0 && ui.dragBox) {
    const { start, end, additive } = ui.dragBox; ui.dragBox = null;
    if (!isBoxDrag(start, end) && event.target === canvas && ui.pendingClaim && !ui.mapOpen) {
      const priorState = getState();
      const placed = startClaimSite(priorState, ui.currentSector, screenToWorld(ui.camera, ui.viewport, mousePoint(canvas, event)));
      if (placed !== priorState) { setState(placed); ui.pendingClaim = false; }
    } else if (!isBoxDrag(start, end) && event.target === canvas && ui.pendingGate?.targetSector === ui.currentSector) {
      setState(startGateBuild(getState(), ui.pendingGate.sectorId, ui.pendingGate.position, ui.currentSector, screenToWorld(ui.camera, ui.viewport, mousePoint(canvas, event))));
      ui.pendingGate = null;
    } else if (isBoxDrag(start, end)) {
      const picked = shipsInBox(getState(), ui.camera, ui.viewport, ui.currentSector, start, end);
      ui.selectedShips = additive ? [...new Set([...ui.selectedShips, ...picked])] : picked;
      ui.selectedShip = ui.selectedShips[0] ?? null;
    } else if (event.target === canvas && ui.mapOpen) {
      const layout = mapLayout(getState(), ui.viewport);
      const renameId = renameHit(layout, mousePoint(canvas, event));
      const id = renameId === null ? mapHit(layout, mousePoint(canvas, event)) : null;
      if (renameId !== null) startRename(renameId);
      else if (id !== null) {
        if (!gateTargetAllowed(ui.pendingGate, id)) return;
        ui.currentSector = id;
        const sectorRocks = getState().asteroids.filter((rock) => rock.sectorId === id);
        const sectorSites = getState().claimSites.filter((site) => site.sectorId === id).map((site) => ({ position: site.position, size: CLAIM_SITE_SIZE }));
        const bodies = [...sectorRocks, ...sectorSites, ...(id === 0 ? [getState().station.dock, getState().station.storage, ...getState().station.modules] : []), getState().sectors[id]!.gate];
        ui.camera = fitCamera(ui.viewport, bodies);
        ui.mapOpen = false;
        if (ui.pendingGate) ui.pendingGate.targetSector = id;
      }
    } else if (event.target === canvas) {
      const point = mousePoint(canvas, event); const hovered = hoveredBody(getState(), ui.camera, ui.viewport, point, ui.currentSector);
      const clickedStorage = hovered?.kind === "storage"
        || (hovered?.kind === "module" && getState().station.modules[hovered.index]?.type === "Storage");
      const storageOpen = storagePanelOpenAfterClick(ui.storagePanelOpen, clickedStorage ? "storage" : hovered ? "other" : "empty");
      if (storageOpen && !ui.storagePanelOpen) openStoragePanel(storagePanel, getState(), () => { ui.storagePanelOpen = true; });
      else if (!storageOpen && ui.storagePanelOpen) closeStoragePanel();
      if (hovered?.kind === "ship") ui.selectedShips = additive ? toggleShip(ui.selectedShips, getState().ships[hovered.index]!.id) : [getState().ships[hovered.index]!.id];
      else if (!additive) ui.selectedShips = [];
      ui.selectedShip = ui.selectedShips[0] ?? null;
      if (hovered?.kind === "module" && getState().station.modules[hovered.index]?.type === "Builder") openShipMenu(hovered.index);
    }
  }
});

}
