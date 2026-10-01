import {
  BUILDER_SIZE,
  CLAIM_MODULE_COST,
  CLAIM_SITE_SIZE,
  DOCK_SIZE,
  HOME_SECTOR,
  STORAGE_SIZE,
  claimSiteSlots,
  removeClaimSite,
  renameSector,
  startClaimSite,
  SHIP_MODULES,
  availableModuleBuildSites,
  createInitialState,
  deleteStock,
  BERTH_PAD_SIZE,
  dockBerths,
  laserBeam,
  giveOrder,
  configureHaul,
  setDefaultBehaviour,
  setMineMaterial,
  setMineOtherSectors,
  resumeDefault,
  setStorageLimit,
  shipSize,
  startModuleBuild,
  startShipBuild,
  startGateBuild,
  sectorInGateRange,
  tick,
  type Beam,
  type DefaultBehaviour,
  type HaulStationId,
  type Material,
  type ModuleType,
  type Ship,
  type ShipDesign,
  type Size,
  type StationModule,
  type Vec,
} from "sim";
import {
  bodyOf,
  fitCamera,
  hoveredBody,
  panBy,
  screenToWorld,
  wheelZoomFactor,
  worldToScreen,
  zoomAt,
  type Camera,
  type Viewport,
} from "./camera";
import { cargoGauge, infoBox, sectorBox, type Gauge } from "./labels";
import { asteroidColor } from "./asteroid";
import { dismissGatePlacement, gateTargetAllowed, mapHit, mapLayout, mapToggled, renameHit, renameLabel, sectorBackdrop, type PendingGate } from "./sectors";
import { LASER_COLOR, flickerPixels, laserPulse } from "./laser";
import {
  buildControlSize,
  buildControlsVisible,
  buildMenuItems,
  dismissBuildMenuForClick,
  dismissBuildMenuForKey,
  pointerInBuildArea,
} from "./building";
import { INITIAL_CLOCK, clockAfterButton, clockAfterKey, gameSeconds, type SpeedButtonId } from "./speed";
import { menuButton as button, renderBlueprints, renderSpeedControls } from "./menu-rendering";
import { createRenderer } from "./renderer";
import { installPanels } from "./panels";
import { installContextMenu } from "./context-menu";
import { installBuildMenu } from "./build-menu";
import { installShipMenu } from "./ship-menu";
import { shipSprite, slotColor } from "./ships";
import { renderShipPanel, type ShipPanelContext } from "./ship-panel";
import { contextOrderAllowed, isBoxDrag, keyPan, orderLineAlpha, orderTargetAt, selectionPanel, shipsInBox, toggleShip } from "./selection";
import {
  BRUSH_SIZES,
  applyTool,
  cellAt,
  designOf,
  designPartAt,
  draftPartAt,
  emptyDraft,
  emptyView,
  lineCells,
  placedDesign,
  shipMenuView,
  shouldDismissShipMenuOnMouseDown,
  withModule,
  withSize,
  withTool,
  zoomView,
  type ShipDraft,
} from "./shipyard";
import { moduleAppearance, stationConnectors } from "./station-appearance";
import { deleteButtonAction, storagePanelOpenAfterClick, type DeleteConfirmation } from "./storage";
import { openStoragePanel, renderStoragePanel } from "./storage-panel";
import {
  deleteBlueprint,
  draftFromDesign,
  loadBlueprints,
  resolveBlueprintStore,
  saveBlueprint,
  viewCentredOn,
  type Blueprint,
} from "./blueprints";

const canvasEl = document.querySelector<HTMLCanvasElement>("#screen");
const boxEl = document.querySelector<HTMLElement>("#info");
const titleEl = document.querySelector<HTMLElement>("#info-title");
const lineEl = document.querySelector<HTMLElement>("#info-line");
const buildControlsEl = document.querySelector<HTMLElement>("#build-controls");
const buildMenuEl = document.querySelector<HTMLElement>("#build-menu");
const shipMenuEl = document.querySelector<HTMLElement>("#ship-menu");
const shipPanelEl = document.querySelector<HTMLElement>("#ship-panel");
const partTipEl = document.querySelector<HTMLElement>("#part-tip");
const sectorNameEl = document.querySelector<HTMLElement>("#sector-name");
const gateMenuEl = document.querySelector<HTMLElement>("#gate-menu");
const claimButtonEl = document.querySelector<HTMLButtonElement>("#claim-button");
const hintEl = document.querySelector<HTMLElement>("#hint");
const renameBoxEl = document.querySelector<HTMLInputElement>("#rename-box");
const infoActionEl = document.querySelector<HTMLButtonElement>("#info-action");
if (!claimButtonEl || !hintEl || !renameBoxEl || !infoActionEl) throw new Error("missing claim station controls");
const claimButton: HTMLButtonElement = claimButtonEl;
const hint: HTMLElement = hintEl;
const renameBox: HTMLInputElement = renameBoxEl;
const infoAction: HTMLButtonElement = infoActionEl;
const speedControlsEl = document.querySelector<HTMLElement>("#speed-controls");
const storagePanelEl = document.querySelector<HTMLElement>("#storage-panel");
if (!speedControlsEl || !canvasEl || !boxEl || !titleEl || !lineEl || !buildControlsEl || !buildMenuEl || !shipMenuEl || !shipPanelEl || !partTipEl || !gateMenuEl || !storagePanelEl) {
  throw new Error("missing #screen canvas or #info box");
}
const shipMenu: HTMLElement = shipMenuEl;
const shipPanelBox: HTMLElement = shipPanelEl;
const partTip: HTMLElement = partTipEl;
const canvas: HTMLCanvasElement = canvasEl;
const box: HTMLElement = boxEl;
const boxTitle: HTMLElement = titleEl;
const boxLine: HTMLElement = lineEl;
const buildControls: HTMLElement = buildControlsEl;
const buildMenu: HTMLElement = buildMenuEl;
const gateMenu: HTMLElement = gateMenuEl;
const speedControls: HTMLElement = speedControlsEl;
const storagePanel: HTMLElement = storagePanelEl;

const context = canvas.getContext("2d");
if (!context) {
  throw new Error("2d context unavailable");
}
const ctx: CanvasRenderingContext2D = context;

// ?seed=N replays a sector exactly; otherwise each load gets a fresh one.
const seedParam = new URLSearchParams(location.search).get("seed");
const seed = seedParam === null ? Date.now() % 2 ** 32 : Number(seedParam);

let state = createInitialState(seed);
const blueprintStore = resolveBlueprintStore(window);
const ui = {
  currentSector: 0,
  mapOpen: false,
  viewport: { width: 0, height: 0 } as Viewport,
  pointer: null as Vec | null,
  buildMenuOpen: false,
  renderedMenu: "",
  renderedSites: "",
  controlsHovered: false,
  selectedBuildSite: null as Vec | null,
  shipMenuBuilder: null as number | null,
  draft: emptyDraft() as ShipDraft,
  blueprints: loadBlueprints(blueprintStore) as Blueprint[],
  paintView: emptyView() as Camera,
  paintCanvas: null as HTMLCanvasElement | null,
  paintPointer: null as Vec | null,
  partHover: null as { at: Vec; source: "paint" | "thumb" } | null,
  stroking: null as Vec | null,
  paintPan: null as Vec | null,
  selectedShip: null as number | null,
  selectedShips: [] as number[],
  renderedPanel: "",
  heldKeys: new Set<string>(),
  pan: null as { last: Vec } | null,
  dragBox: null as { start: Vec; end: Vec; additive: boolean } | null,
  orderLines: null as { from: Vec[]; to: Vec; start: number } | null,
  pendingGate: null as PendingGate | null,
  pendingClaim: false,
  renamingSector: null as number | null,
  stickySite: null as number | null,
  infoHovered: false,
  clock: INITIAL_CLOCK,
  storagePanelOpen: false,
  deleteConfirmations: new Map<Material, DeleteConfirmation>(),
  camera: fitCamera({ width: 0, height: 0 }, []),
  lastTimeMs: performance.now()
};
export type UiState = typeof ui;
const closeStoragePanel = installPanels(ui, () => state, (next) => { state = next; }, storagePanel, shipPanelBox);
const closeBuildMenu = installBuildMenu(ui, () => state, (next) => { state = next; }, buildControls, buildMenu, mousePoint);
const closeGateMenu = installContextMenu(ui, () => state, (next) => { state = next; }, canvas, gateMenu, claimButton, mousePoint);
infoAction.addEventListener("click", () => {
  const siteId = Number(infoAction.dataset.site);
  state = removeClaimSite(state, siteId);
  ui.stickySite = null;
  ui.infoHovered = false;
});
box.addEventListener("pointerenter", () => { ui.infoHovered = true; });
box.addEventListener("pointerleave", () => { ui.infoHovered = false; });

function startRename(sectorId: number): void {
  ui.renamingSector = sectorId;
  renameBox.value = state.sectors[sectorId]!.name;
  renameBox.hidden = false;
  renameBox.focus();
  renameBox.select();
}

// Keys typed into the name box are not map or camera keys.
renameBox.addEventListener("keydown", (event) => {
  event.stopPropagation();
  if (event.key === "Enter" && ui.renamingSector !== null) {
    state = renameSector(state, ui.renamingSector, renameBox.value);
    ui.renamingSector = null;
  } else if (event.key === "Escape") ui.renamingSector = null;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") ui.pendingClaim = false;
  if (event.key.toLowerCase() === "m" || event.key === "Escape") ui.mapOpen = mapToggled(ui.mapOpen, event.key);
  if (event.key === "Escape") closeGateMenu();
  if (ui.buildMenuOpen && dismissBuildMenuForKey(event.key)) closeBuildMenu();
  if (ui.shipMenuBuilder !== null && event.key === "Escape") shipMenuSystem.closeShipMenu();
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

const shipMenuSystem = installShipMenu(ui, () => state, (next) => { state = next; }, shipMenu, shipPanelBox, blueprintStore);

function resize(): void {
  const ratio = window.devicePixelRatio || 1;
  ui.viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
  canvas.width = Math.round(ui.viewport.width * ratio);
  canvas.height = Math.round(ui.viewport.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener("resize", resize);
resize();

// Fits the starting field only. Respawns can land off screen; the camera does
// not follow them.
ui.camera = fitCamera(ui.viewport, [state.station.dock, state.station.storage, ...state.asteroids.filter((rock) => rock.sectorId === 0), state.sectors[0]!.gate]);

function mousePoint(event: MouseEvent): Vec {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    ui.camera = zoomAt(ui.camera, ui.viewport, mousePoint(event), wheelZoomFactor(event.deltaY));
  },
  { passive: false },
);

canvas.addEventListener("mousedown", (event) => {
  const point = mousePoint(event);
  if (event.button === 1) { event.preventDefault(); ui.pan = { last: point }; }
  else if (event.button === 0) ui.dragBox = { start: point, end: point, additive: event.shiftKey };
});

canvas.addEventListener("mousemove", (event) => {
  ui.pointer = mousePoint(event);
});

canvas.addEventListener("mouseleave", () => {
  ui.pointer = null;
});

window.addEventListener("mousemove", (event) => {
  const point = mousePoint(event);
  if (ui.pan) { ui.camera = panBy(ui.camera, point.x - ui.pan.last.x, point.y - ui.pan.last.y); ui.pan.last = point; }
  if (ui.dragBox) ui.dragBox.end = point;
});

window.addEventListener("mouseup", (event) => {
  if (event.button === 1) ui.pan = null;
  if (event.button === 0 && ui.dragBox) {
    const { start, end, additive } = ui.dragBox; ui.dragBox = null;
    if (!isBoxDrag(start, end) && event.target === canvas && ui.pendingClaim && !ui.mapOpen) {
      const placed = startClaimSite(state, ui.currentSector, screenToWorld(ui.camera, ui.viewport, mousePoint(event)));
      if (placed !== state) { state = placed; ui.pendingClaim = false; }
    } else if (!isBoxDrag(start, end) && event.target === canvas && ui.pendingGate?.targetSector === ui.currentSector) {
      state = startGateBuild(state, ui.pendingGate.sectorId, ui.pendingGate.position, ui.currentSector, screenToWorld(ui.camera, ui.viewport, mousePoint(event)));
      ui.pendingGate = null;
    } else if (isBoxDrag(start, end)) {
      const picked = shipsInBox(state, ui.camera, ui.viewport, ui.currentSector, start, end);
      ui.selectedShips = additive ? [...new Set([...ui.selectedShips, ...picked])] : picked;
      ui.selectedShip = ui.selectedShips[0] ?? null;
    } else if (event.target === canvas && ui.mapOpen) {
      const layout = mapLayout(state, ui.viewport);
      const renameId = renameHit(layout, mousePoint(event));
      const id = renameId === null ? mapHit(layout, mousePoint(event)) : null;
      if (renameId !== null) startRename(renameId);
      else if (id !== null) {
        if (!gateTargetAllowed(ui.pendingGate, id)) return;
        ui.currentSector = id;
        const sectorRocks = state.asteroids.filter((rock) => rock.sectorId === id);
        const sectorSites = state.claimSites.filter((site) => site.sectorId === id).map((site) => ({ position: site.position, size: CLAIM_SITE_SIZE }));
        const bodies = [...sectorRocks, ...sectorSites, ...(id === 0 ? [state.station.dock, state.station.storage, ...state.station.modules] : []), state.sectors[id]!.gate];
        ui.camera = fitCamera(ui.viewport, bodies);
        ui.mapOpen = false;
        if (ui.pendingGate) ui.pendingGate.targetSector = id;
      }
    } else if (event.target === canvas) {
      const point = mousePoint(event); const hovered = hoveredBody(state, ui.camera, ui.viewport, point, ui.currentSector);
      const clickedStorage = hovered?.kind === "storage"
        || (hovered?.kind === "module" && state.station.modules[hovered.index]?.type === "Storage");
      const storageOpen = storagePanelOpenAfterClick(ui.storagePanelOpen, clickedStorage ? "storage" : hovered ? "other" : "empty");
      if (storageOpen && !ui.storagePanelOpen) openStoragePanel(storagePanel, state, () => { ui.storagePanelOpen = true; });
      else if (!storageOpen && ui.storagePanelOpen) closeStoragePanel();
      if (hovered?.kind === "ship") ui.selectedShips = additive ? toggleShip(ui.selectedShips, state.ships[hovered.index]!.id) : [state.ships[hovered.index]!.id];
      else if (!additive) ui.selectedShips = [];
      ui.selectedShip = ui.selectedShips[0] ?? null;
      if (hovered?.kind === "module" && state.station.modules[hovered.index]?.type === "Builder") shipMenuSystem.openShipMenu(hovered.index);
    }
  }
});

const draw = createRenderer(ui, () => state, { ctx, canvas, shipPanelBox, partTip, sectorNameEl, buildControls, box, boxTitle, boxLine, infoAction, buildMenu, claimButton, hint, renameBox, shipMenu, storagePanel, paintViewport: shipMenuSystem.paintViewport, paintPointAt: shipMenuSystem.paintPointAt });

function frame(nowMs: number): void {
  const dt = Math.max(0, (nowMs - ui.lastTimeMs) / 1000);
  ui.lastTimeMs = nowMs;
  const movement = keyPan(ui.heldKeys, dt);
  if (movement.x || movement.y) ui.camera = panBy(ui.camera, movement.x, movement.y);
  // Paused frames skip the tick, so selecting, ordering and the menus keep
  // working on a state that simply does not advance.
  const seconds = gameSeconds(ui.clock, dt);
  if (seconds > 0) state = tick(state, seconds);
  renderSpeedControls(speedControls, ui.clock);
  draw(nowMs / 1000);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
