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
import { installBuildMenu } from "./build-menu";
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
function closeGateMenu(): void {
  gateMenu.hidden = true;
  ui.pendingGate = dismissGatePlacement(ui.pendingGate);
}

document.addEventListener("click", (event) => {
  if (!gateMenu.hidden && !gateMenu.contains(event.target as Node | null)) closeGateMenu();
});

window.addEventListener("mousedown", (event) => {
  if (shouldDismissShipMenuOnMouseDown(ui.shipMenuBuilder !== null, shipMenu.contains(event.target as Node | null))) {
    closeShipMenu();
  }
}, true);

window.addEventListener("mousedown", (event) => {
  if (!gateMenu.hidden && !gateMenu.contains(event.target as Node | null)) closeGateMenu();
}, true);

claimButton.addEventListener("click", () => {
  ui.pendingClaim = true;
  closeGateMenu();
});
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

// Keys typed into the name box are not map or ui.camera keys.
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

const TOOL_BUTTONS = [["erase", "Eraser"], ["fill", "Fill"]] as const;

// Built once when the menu opens. The buttons only change which one is
// pressed afterwards, so the paint canvas and its listeners stay put. The
// stats, cost and Build button are refreshed every frame in draw(), since
// Storage keeps changing underneath.
function renderShipMenu(): void {
  const title = document.createElement("h2");
  title.textContent = "Build ship";
  const modules = document.createElement("div");
  modules.className = "row";
  for (const module of SHIP_MODULES) {
    const pick = button(module, { module });
    pick.style.borderLeft = `6px solid ${slotColor(module)}`;
    modules.append(pick);
  }
  const tools = document.createElement("div");
  tools.className = "row";
  for (const size of BRUSH_SIZES) tools.append(button(`${size} px`, { size: String(size) }));
  for (const [tool, label] of TOOL_BUTTONS) tools.append(button(label, { tool }));
  ui.paintCanvas = document.createElement("canvas");
  ui.paintCanvas.className = "paint";
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "Drag to paint. Right-drag or middle-drag to ui.pan, scroll to zoom.";
  const stats = document.createElement("div");
  stats.className = "stats";
  const cost = document.createElement("div");
  cost.className = "cost";
  const save = document.createElement("div");
  save.className = "row blueprint-save";
  const blueprintName = document.createElement("input");
  blueprintName.className = "blueprint-name";
  blueprintName.placeholder = "Blueprint name";
  blueprintName.setAttribute("aria-label", "Blueprint name");
  const saveBlueprintButton = button("Save blueprint", { blueprintSave: "" });
  saveBlueprintButton.disabled = true;
  save.append(blueprintName, saveBlueprintButton);
  const blueprintList = document.createElement("div");
  blueprintList.className = "blueprints";
  const build = button("Build", { build: "" });
  build.className = "build";
  shipMenu.replaceChildren(title, modules, tools, ui.paintCanvas, hint, stats, cost, save, blueprintList, build);
  renderBlueprints(shipMenu, ui.blueprints);
  syncShipMenuButtons();
}

function syncShipMenuButtons(): void {
  for (const element of shipMenu.querySelectorAll<HTMLButtonElement>("button[data-module]")) {
    element.classList.toggle("pressed", ui.draft.tool === "paint" && ui.draft.module === element.dataset.module);
  }
  for (const element of shipMenu.querySelectorAll<HTMLButtonElement>("button[data-size]")) {
    element.classList.toggle("pressed", ui.draft.tool !== "fill" && ui.draft.size === Number(element.dataset.size));
  }
  for (const element of shipMenu.querySelectorAll<HTMLButtonElement>("button[data-tool]")) {
    element.classList.toggle("pressed", ui.draft.tool === element.dataset.tool);
  }
}

function openShipMenu(builder: number): void {
  ui.shipMenuBuilder = builder;
  ui.draft = emptyDraft();
  ui.paintView = emptyView();
  renderShipMenu();
  shipMenu.hidden = false;
}

function closeShipMenu(): void {
  ui.shipMenuBuilder = null;
  shipMenu.hidden = true;
  ui.stroking = null;
  ui.paintPan = null;
  ui.partHover = null;
}

shipMenu.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!target || target.disabled || ui.shipMenuBuilder === null) return;
  const data = target.dataset;
  if (data.module) ui.draft = withModule(withTool(ui.draft, "paint"), data.module as ShipDraft["module"]);
  else if (data.size) ui.draft = withSize(ui.draft.tool === "fill" ? withTool(ui.draft, "paint") : ui.draft, Number(data.size) as ShipDraft["size"]);
  else if (data.tool) ui.draft = withTool(ui.draft, data.tool as ShipDraft["tool"]);
  else if (data.blueprintSave !== undefined) {
    const input = shipMenu.querySelector<HTMLInputElement>(".blueprint-name")!;
    ui.blueprints = saveBlueprint(blueprintStore, input.value, designOf(ui.draft));
    input.value = "";
    target.disabled = true;
    renderBlueprints(shipMenu, ui.blueprints);
  }
  else if (data.blueprintLoad !== undefined) {
    const blueprint = ui.blueprints[Number(data.blueprintLoad)];
    if (!blueprint) return;
    ui.draft = draftFromDesign(ui.draft, blueprint.design);
    ui.paintView = viewCentredOn(ui.paintView, blueprint.design);
  }
  else if (data.blueprintDelete !== undefined) {
    const blueprint = ui.blueprints[Number(data.blueprintDelete)];
    if (!blueprint) return;
    ui.blueprints = deleteBlueprint(blueprintStore, blueprint.name);
    renderBlueprints(shipMenu, ui.blueprints);
  }
  else if (data.build !== undefined) {
    state = startShipBuild(state, ui.shipMenuBuilder, designOf(ui.draft));
    closeShipMenu();
    return;
  }
  syncShipMenuButtons();
});

shipMenu.addEventListener("input", (event) => {
  const input = (event.target as HTMLElement).closest<HTMLInputElement>(".blueprint-name");
  if (!input) return;
  const save = shipMenu.querySelector<HTMLButtonElement>("button[data-blueprint-save]")!;
  save.disabled = input.value.trim() === "" || designOf(ui.draft).width === 0;
});

function paintPointAt(client: Vec): Vec {
  const bounds = ui.paintCanvas!.getBoundingClientRect();
  return {
    x: (client.x - bounds.left) * (ui.paintCanvas!.width / bounds.width),
    y: (client.y - bounds.top) * (ui.paintCanvas!.height / bounds.height),
  };
}

function paintPoint(event: MouseEvent): Vec {
  return paintPointAt({ x: event.clientX, y: event.clientY });
}

function paintViewport(): Viewport {
  return { width: ui.paintCanvas!.width, height: ui.paintCanvas!.height };
}

shipMenu.addEventListener("mousedown", (event) => {
  if (event.target !== ui.paintCanvas) return;
  event.preventDefault();
  const point = paintPoint(event);
  if (event.button === 0) {
    const cell = cellAt(ui.paintView, paintViewport(), point);
    applyTool(ui.draft, cell);
    ui.stroking = cell;
  } else if (event.button === 1 || event.button === 2) ui.paintPan = point;
});
shipMenu.addEventListener("contextmenu", (event) => {
  if (event.target === ui.paintCanvas) event.preventDefault();
});
shipMenu.addEventListener("wheel", (event) => {
  if (event.target !== ui.paintCanvas) return;
  event.preventDefault();
  ui.paintView = zoomView(ui.paintView, paintViewport(), paintPoint(event), wheelZoomFactor(event.deltaY));
}, { passive: false });
shipMenu.addEventListener("mousemove", (event) => {
  ui.paintPointer = event.target === ui.paintCanvas ? paintPoint(event) : null;
  ui.partHover = ui.paintPointer ? { at: { x: event.clientX, y: event.clientY }, source: "paint" } : null;
});
shipMenu.addEventListener("mouseleave", () => {
  ui.paintPointer = null;
  ui.partHover = null;
});
shipPanelBox.addEventListener("mousemove", (event) => {
  const onThumb = (event.target as HTMLElement).closest(".ship-thumb") !== null;
  ui.partHover = onThumb ? { at: { x: event.clientX, y: event.clientY }, source: "thumb" } : null;
});
shipPanelBox.addEventListener("mouseleave", () => {
  ui.partHover = null;
});
window.addEventListener("mousemove", (event) => {
  if (!ui.paintCanvas || ui.shipMenuBuilder === null) return;
  const point = paintPoint(event);
  if (ui.paintPan) {
    ui.paintView = panBy(ui.paintView, (point.x - ui.paintPan.x), (point.y - ui.paintPan.y));
    ui.paintPan = point;
  }
  // Fill is a single click, so dragging with it does nothing more.
  if (ui.stroking && ui.draft.tool !== "fill") {
    const cell = cellAt(ui.paintView, paintViewport(), point);
    for (const step of lineCells(ui.stroking, cell)) applyTool(ui.draft, step);
    ui.stroking = cell;
  }
});
window.addEventListener("mouseup", () => {
  ui.stroking = null;
  ui.paintPan = null;
});

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

// Fits the starting field only. Respawns can land off screen; the ui.camera does
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
      if (hovered?.kind === "module" && state.station.modules[hovered.index]?.type === "Builder") openShipMenu(hovered.index);
    }
  }
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (!contextOrderAllowed(ui.mapOpen)) return;
  const point = mousePoint(event); const hovered = hoveredBody(state, ui.camera, ui.viewport, point, ui.currentSector, { includeShips: false });
  if (!ui.selectedShips.length && !hovered && ui.currentSector === HOME_SECTOR) {
    ui.pendingGate = { sectorId: ui.currentSector, position: screenToWorld(ui.camera, ui.viewport, point) };
    gateMenu.style.left = `${point.x}px`; gateMenu.style.top = `${point.y}px`; gateMenu.hidden = false;
    return;
  }
  if (!ui.selectedShips.length) return;
  const world = screenToWorld(ui.camera, ui.viewport, point); const target = orderTargetAt(state, hovered, world, ui.currentSector);
  const to = target.kind === "move" ? target.point : target.kind === "home" ? state.station.dock.position
    : target.kind === "haulGate" ? world : target.kind === "supplyBuild" ? state.station.constructionSite.position : target.kind === "supplySite" ? state.claimSites.find((site) => site.id === target.siteId)?.position ?? world : state.asteroids.find((asteroid) => asteroid.id === target.asteroidId)?.position ?? world;
  ui.orderLines = { from: ui.selectedShips.flatMap((id) => { const ship = state.ships.find((item) => item.id === id); return ship ? [ship.position] : []; }), to, start: performance.now() / 1000 };
  state = giveOrder(state, ui.selectedShips, target);
});

gateMenu.addEventListener("click", () => {
  gateMenu.hidden = true;
  ui.mapOpen = ui.pendingGate !== null;
});

const draw = createRenderer(ui, () => state, { ctx, canvas, shipPanelBox, partTip, sectorNameEl, buildControls, box, boxTitle, boxLine, infoAction, buildMenu, claimButton, hint, renameBox, shipMenu, storagePanel, paintViewport, paintPointAt });

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
