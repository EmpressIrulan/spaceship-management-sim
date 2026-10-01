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
import { INITIAL_CLOCK, clockAfterButton, clockAfterKey, gameSeconds, speedButtons, type SpeedButtonId } from "./speed";
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
function closeStoragePanel(): void {
  ui.storagePanelOpen = false;
  storagePanel.hidden = true;
  ui.deleteConfirmations.clear();
}


storagePanel.addEventListener("change", (event) => {
  const input = (event.target as HTMLElement).closest<HTMLInputElement>("input[data-limit]");
  if (!input) return;
  const value = input.value.trim() === "" ? null : Number(input.value);
  if (value !== null && (!Number.isFinite(value) || value < 0)) return;
  state = setStorageLimit(state, input.dataset.limit as Material, value);
});

storagePanel.addEventListener("click", (event) => {
  const remove = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-delete]");
  if (!remove) return;
  const material = remove.dataset.delete as Material;
  const quantity = storagePanel.querySelector<HTMLInputElement>(`input[data-delete-amount="${material}"]`)!;
  const action = deleteButtonAction(ui.deleteConfirmations.get(material) ?? null, material, quantity.value, performance.now());
  if (action.deleteAmount !== null) {
    state = deleteStock(state, material, action.deleteAmount);
    quantity.value = "";
  }
  if (action.confirmation) ui.deleteConfirmations.set(material, action.confirmation);
  else ui.deleteConfirmations.delete(material);
  renderStoragePanel(storagePanel, state, ui.storagePanelOpen, performance.now(), ui.deleteConfirmations);
});

function closeGateMenu(): void {
  gateMenu.hidden = true;
  ui.pendingGate = dismissGatePlacement(ui.pendingGate);
}

function closeBuildMenu(): void {
  ui.buildMenuOpen = false;
  buildMenu.hidden = true;
  ui.selectedBuildSite = null;
}

buildControls.addEventListener("pointerover", () => {
  ui.controlsHovered = true;
});
// The + cells sit above the canvas, so the canvas stops hearing the ui.pointer
// while it is over one.
buildControls.addEventListener("pointermove", (event) => {
  ui.pointer = mousePoint(event);
});
buildControls.addEventListener("pointerout", (event) => {
  if (!buildControls.contains(event.relatedTarget as Node | null)) ui.controlsHovered = false;
});
buildControls.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-x]");
  if (!button) return;
  ui.selectedBuildSite = { x: Number(button.dataset.x), y: Number(button.dataset.y) };
  ui.buildMenuOpen = true;
  buildMenu.hidden = false;
});

buildMenu.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-module]");
  if (!button || button.disabled) return;
  if (!ui.selectedBuildSite) return;
  state = startModuleBuild(state, button.dataset.module as ModuleType, ui.selectedBuildSite);
  closeBuildMenu();
});

document.addEventListener("click", (event) => {
  if (!ui.buildMenuOpen) return;
  const target = event.target as Node | null;
  if (dismissBuildMenuForClick(buildMenu.contains(target), buildControls.contains(target))) {
    closeBuildMenu();
  }
});

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

function renderSpeedControls(): void {
  const buttons = speedButtons(ui.clock);
  if (speedControls.children.length !== buttons.length) {
    speedControls.replaceChildren(...buttons.map((item) => {
      const element = document.createElement("button");
      element.dataset.speed = item.id;
      element.textContent = item.label;
      return element;
    }));
  }
  buttons.forEach((item, index) => {
    const element = speedControls.children[index] as HTMLButtonElement;
    element.classList.toggle("active", item.active);
    element.setAttribute("aria-pressed", String(item.active));
  });
}

function button(text: string, data: Record<string, string>, pressed = false): HTMLButtonElement {
  const element = document.createElement("button");
  element.textContent = text;
  Object.assign(element.dataset, data);
  if (pressed) element.classList.add("pressed");
  return element;
}

const TOOL_BUTTONS = [["erase", "Eraser"], ["fill", "Fill"]] as const;

function renderBlueprints(): void {
  const list = shipMenu.querySelector<HTMLElement>(".blueprints")!;
  if (ui.blueprints.length === 0) {
    const empty = document.createElement("span");
    empty.className = "hint";
    empty.textContent = "No saved blueprints";
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...ui.blueprints.map((blueprint, index) => {
    const row = document.createElement("div");
    row.className = "blueprint";
    const name = document.createElement("span");
    name.textContent = blueprint.name;
    const actions = document.createElement("span");
    actions.className = "row";
    actions.append(
      button("Load", { blueprintLoad: String(index) }),
      button("Delete", { blueprintDelete: String(index) }),
    );
    row.append(name, actions);
    return row;
  }));
}

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
  renderBlueprints();
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
    renderBlueprints();
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
    renderBlueprints();
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

shipPanelBox.addEventListener("change", (event) => {
  const select = event.target as HTMLSelectElement;
  if (select.name === "default") state = setDefaultBehaviour(state, ui.selectedShips, select.value as DefaultBehaviour);
  if (["haul-from", "haul-to", "haul-material"].includes(select.name)) {
    const panel = selectionPanel(state, ui.selectedShips);
    const route = panel?.haulRoute;
    if (!route) return;
    state = configureHaul(state, ui.selectedShips, {
      from: select.name === "haul-from" ? select.value as HaulStationId : route.from,
      to: select.name === "haul-to" ? select.value as HaulStationId : route.to,
      material: select.name === "haul-material" ? select.value as Material : route.material,
    });
  }
});
shipPanelBox.addEventListener("change", (event) => {
  const box = event.target as HTMLInputElement;
  if (box.name === "mine-material") state = setMineMaterial(state, ui.selectedShips, box.value as Material, box.checked);
  if (box.name === "mine-other-sectors") state = setMineOtherSectors(state, ui.selectedShips, box.checked);
});
shipPanelBox.addEventListener("click", (event) => {
  if ((event.target as HTMLElement).closest("button[data-resume]")) state = resumeDefault(state, ui.selectedShips);
});

function fillWorldRect(center: Vec, size: Size, color: string): void {
  const topLeft = worldToScreen(ui.camera, ui.viewport, {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
  });
  ctx.fillStyle = color;
  ctx.fillRect(topLeft.x, topLeft.y, size.width * ui.camera.zoom, size.height * ui.camera.zoom);
}

function strokeWorldRect(center: Vec, size: Size, color: string): void {
  const topLeft = worldToScreen(ui.camera, ui.viewport, {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
  });
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = color;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 2;
  ctx.strokeRect(topLeft.x, topLeft.y, size.width * ui.camera.zoom, size.height * ui.camera.zoom);
  ctx.restore();
}

function drawStationConnector(from: Vec, to: Vec): void {
  const start = worldToScreen(ui.camera, ui.viewport, from);
  const end = worldToScreen(ui.camera, ui.viewport, to);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = Math.max(4, 7 * ui.camera.zoom);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = Math.max(1, 2 * ui.camera.zoom);
  ctx.stroke();
  ctx.restore();
}

// The Dock's pads, marked whether or not a ship is on them. Called with the
// canvas already translated to the Dock's centre.
function drawBerthPads(dock: Vec): void {
  const side = BERTH_PAD_SIZE * ui.camera.zoom;
  ctx.save();
  ctx.strokeStyle = moduleAppearance("Dock").accent;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(1, ui.camera.zoom);
  ctx.setLineDash([Math.max(2, 3 * ui.camera.zoom), Math.max(2, 2 * ui.camera.zoom)]);
  for (const pad of dockBerths(dock)) {
    ctx.strokeRect((pad.x - dock.x) * ui.camera.zoom - side / 2, (pad.y - dock.y) * ui.camera.zoom - side / 2, side, side);
  }
  ctx.restore();
}

function drawStationModule(module: StationModule): void {
  const center = worldToScreen(ui.camera, ui.viewport, module.position);
  const width = module.size.width * ui.camera.zoom;
  const height = module.size.height * ui.camera.zoom;
  const appearance = moduleAppearance(module.type);
  const detailWidth = Math.max(1.5, 2 * ui.camera.zoom);

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.fillStyle = "#1e293b";
  ctx.strokeStyle = appearance.accent;
  ctx.lineWidth = Math.max(1.5, 2 * ui.camera.zoom);
  ctx.beginPath();
  ctx.ellipse(0, 0, width * 0.47, height * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (appearance.silhouette === "open-bay") {
    ctx.fillStyle = "#020617";
    ctx.fillRect(-width * 0.23, -height * 0.17, width * 0.46, height * 0.42);
    ctx.strokeStyle = appearance.accent;
    ctx.lineWidth = detailWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-width * 0.32, height * 0.28);
    ctx.lineTo(-width * 0.32, -height * 0.1);
    ctx.lineTo(-width * 0.18, -height * 0.3);
    ctx.moveTo(width * 0.32, height * 0.28);
    ctx.lineTo(width * 0.32, -height * 0.1);
    ctx.lineTo(width * 0.18, -height * 0.3);
    ctx.stroke();
  } else if (appearance.silhouette === "tank-cluster") {
    for (const x of [-0.22, 0, 0.22]) {
      ctx.fillStyle = x === 0 ? appearance.accent : "#475569";
      ctx.strokeStyle = appearance.accent;
      ctx.lineWidth = Math.max(1, ui.camera.zoom);
      ctx.beginPath();
      ctx.ellipse(width * x, 0, width * 0.14, height * 0.29, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = appearance.accent;
    ctx.lineWidth = detailWidth;
    ctx.lineCap = "square";
    ctx.beginPath();
    ctx.moveTo(-width * 0.28, height * 0.28);
    ctx.lineTo(-width * 0.28, -height * 0.28);
    ctx.lineTo(width * 0.24, -height * 0.28);
    ctx.lineTo(width * 0.24, -height * 0.14);
    ctx.moveTo(-width * 0.28, -height * 0.08);
    ctx.lineTo(width * 0.2, height * 0.28);
    ctx.moveTo(width * 0.24, -height * 0.14);
    ctx.lineTo(width * 0.34, -height * 0.02);
    ctx.stroke();
    ctx.fillStyle = appearance.accent;
    ctx.beginPath();
    ctx.arc(width * 0.34, height * 0.04, Math.max(1.5, width * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }
  if (module.type === "Dock") drawBerthPads(module.position);
  ctx.restore();
}

// Ships carry ore here and Home builds from it. Always drawn, since Home has
// one from the start.
function drawConstructionSite(): void {
  const { position, size } = state.station.constructionSite;
  const left = worldToScreen(ui.camera, ui.viewport, { x: position.x - size.width / 2, y: position.y - size.height / 2 });
  const right = worldToScreen(ui.camera, ui.viewport, { x: position.x + size.width / 2, y: position.y + size.height / 2 });
  fillWorldRect(position, size, "rgba(245,158,11,.25)");
  strokeWorldRect(position, size, "#f59e0b");
  ctx.save();
  ctx.strokeStyle = "rgba(245,158,11,.6)";
  ctx.lineWidth = Math.max(1, ui.camera.zoom);
  ctx.beginPath();
  ctx.moveTo(left.x, left.y); ctx.lineTo(right.x, right.y);
  ctx.moveTo(right.x, left.y); ctx.lineTo(left.x, right.y);
  ctx.stroke();
  ctx.restore();
}

// The slot being supplied fills as materials arrive, and is solid while it builds.
function supplyFraction(site: (typeof state.claimSites)[number]): number {
  if (site.timer !== null) return 1;
  const cost = CLAIM_MODULE_COST.Metal + CLAIM_MODULE_COST.Ice;
  return (site.delivered.Metal + site.delivered.Ice) / cost;
}

function drawClaimSite(site: (typeof state.claimSites)[number]): void {
  const size = { Dock: DOCK_SIZE, Storage: STORAGE_SIZE, Builder: BUILDER_SIZE };
  claimSiteSlots(site).forEach((slot, index) => {
    if (slot.built) { drawStationModule({ type: slot.type, position: slot.position, size: size[slot.type] }); return; }
    strokeWorldRect(slot.position, size[slot.type], "#cbd5e1");
    if (index !== site.stage) return;
    const height = size[slot.type].height * supplyFraction(site);
    fillWorldRect({ x: slot.position.x, y: slot.position.y + (size[slot.type].height - height) / 2 }, { width: size[slot.type].width, height }, "rgba(148,163,184,.55)");
  });
}

// Edges are rounded so the image lands on whole screen pixels at any zoom.
function drawShip(ship: Ship): void {
  const size = shipSize(ship.design);
  const a = worldToScreen(ui.camera, ui.viewport, { x: ship.position.x - size.width / 2, y: ship.position.y - size.height / 2 });
  const b = worldToScreen(ui.camera, ui.viewport, { x: ship.position.x + size.width / 2, y: ship.position.y + size.height / 2 });
  const x = Math.round(a.x);
  const y = Math.round(a.y);
  ctx.drawImage(shipSprite(ship.design), x, y, Math.max(1, Math.round(b.x) - x), Math.max(1, Math.round(b.y) - y));
}

function drawSelectionRing(center: Vec, size: Size): void {
  const screen = worldToScreen(ui.camera, ui.viewport, center);
  const radius = Math.hypot(size.width, size.height) / 2 * ui.camera.zoom + 5;
  ctx.save();
  ctx.strokeStyle = "#4ade80";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, radius, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

// Screen pixels per canvas pixel above which the pixel grid is drawn.
const GRID_ZOOM = 6;

function drawPaintCanvas(): void {
  const surface = ui.paintCanvas!;
  if (surface.width !== surface.clientWidth || surface.height !== surface.clientHeight) {
    surface.width = surface.clientWidth;
    surface.height = surface.clientHeight;
  }
  const g = surface.getContext("2d")!;
  const vp = paintViewport();
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#0f172a";
  g.fillRect(0, 0, vp.width, vp.height);
  const { design, origin } = placedDesign(ui.draft);
  if (design.width > 0) {
    const at = worldToScreen(ui.paintView, vp, origin);
    g.drawImage(shipSprite(design), at.x, at.y, design.width * ui.paintView.zoom, design.height * ui.paintView.zoom);
  }
  if (ui.paintView.zoom >= GRID_ZOOM) {
    const first = screenToWorld(ui.paintView, vp, { x: 0, y: 0 });
    const last = screenToWorld(ui.paintView, vp, { x: vp.width, y: vp.height });
    g.strokeStyle = "rgba(148,163,184,.25)";
    g.lineWidth = 1;
    g.beginPath();
    for (let x = Math.ceil(first.x); x <= last.x; x += 1) {
      const sx = Math.round(worldToScreen(ui.paintView, vp, { x, y: 0 }).x) + 0.5;
      g.moveTo(sx, 0);
      g.lineTo(sx, vp.height);
    }
    for (let y = Math.ceil(first.y); y <= last.y; y += 1) {
      const sy = Math.round(worldToScreen(ui.paintView, vp, { x: 0, y }).y) + 0.5;
      g.moveTo(0, sy);
      g.lineTo(vp.width, sy);
    }
    g.stroke();
  }
  if (ui.paintPointer) {
    const cell = cellAt(ui.paintView, vp, ui.paintPointer);
    const reach = ui.draft.tool === "fill" ? 0 : Math.floor(ui.draft.size / 2);
    const corner = worldToScreen(ui.paintView, vp, { x: cell.x - reach, y: cell.y - reach });
    const span = (2 * reach + 1) * ui.paintView.zoom;
    g.strokeStyle = ui.draft.tool === "erase" ? "#f87171" : "#facc15";
    g.lineWidth = 2;
    g.strokeRect(corner.x, corner.y, span, span);
  }
}

// The name of the part under the mouse, or null when it is not over a design.
function hoveredPart(hover: NonNullable<typeof ui.partHover>): string | null {
  if (hover.source === "paint") {
    if (!ui.paintCanvas || ui.shipMenuBuilder === null) return null;
    return draftPartAt(ui.draft, cellAt(ui.paintView, paintViewport(), paintPointAt(hover.at)));
  }
  const thumb = shipPanelBox.querySelector<HTMLElement>(".ship-thumb");
  const ship = state.ships.find((candidate) => candidate.id === ui.selectedShip);
  if (!thumb || !ship || shipPanelBox.hidden) return null;
  const bounds = thumb.getBoundingClientRect();
  return designPartAt(ship.design, {
    x: (hover.at.x - bounds.left) / bounds.width,
    y: (hover.at.y - bounds.top) / bounds.height,
  });
}

function renderPartTip(): void {
  const name = ui.partHover && hoveredPart(ui.partHover);
  partTip.hidden = !ui.partHover || name === null;
  if (!ui.partHover || name === null) return;
  partTip.textContent = name;
  partTip.style.left = `${ui.partHover.at.x + 14}px`;
  partTip.style.top = `${ui.partHover.at.y + 14}px`;
}

// Screen-space so the numbers stay readable at any zoom.
const GAUGE = { width: 36, height: 12, gap: 4 };

function drawGauge(shipPosition: Vec, gauge: Gauge, size: Size): void {
  const top = worldToScreen(ui.camera, ui.viewport, {
    x: shipPosition.x,
    y: shipPosition.y - size.height / 2,
  });
  const x = Math.round(top.x - GAUGE.width / 2);
  const y = Math.round(top.y - GAUGE.gap - GAUGE.height);

  ctx.fillStyle = "#1f2937";
  ctx.fillRect(x, y, GAUGE.width, GAUGE.height);
  ctx.fillStyle = "#a16207";
  ctx.fillRect(x, y, GAUGE.width * gauge.fill, GAUGE.height);
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, GAUGE.width - 1, GAUGE.height - 1);

  ctx.fillStyle = "#f9fafb";
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(gauge.text, x + GAUGE.width / 2, y + GAUGE.height / 2 + 0.5);
}

// Screen-space, like the gauge, so the beam and flicker read at any zoom.
function drawLaser(beam: Beam, seconds: number): void {
  const from = worldToScreen(ui.camera, ui.viewport, beam.from);
  const to = worldToScreen(ui.camera, ui.viewport, beam.to);
  const pulse = laserPulse(seconds);

  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = LASER_COLOR;
  ctx.lineWidth = 1 + pulse;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();

  // 2 by 2 so a single spark is still visible on a low-density screen.
  ctx.fillStyle = "#fff1f2";
  for (const pixel of flickerPixels({ x: Math.round(to.x), y: Math.round(to.y) }, seconds)) {
    ctx.fillRect(pixel.x - 1, pixel.y - 1, 2, 2);
  }
}

function drawOrderFeedback(seconds: number): void {
  if (ui.orderLines) {
    const alpha = orderLineAlpha(seconds - ui.orderLines.start);
    if (alpha <= 0) ui.orderLines = null;
    else {
      const to = worldToScreen(ui.camera, ui.viewport, ui.orderLines.to);
      ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = "#86efac"; ctx.setLineDash([5, 4]);
      for (const from of ui.orderLines.from) {
        const start = worldToScreen(ui.camera, ui.viewport, from);
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(to.x, to.y); ctx.stroke();
      }
      ctx.restore();
    }
  }
  if (ui.dragBox) {
    ctx.save(); ctx.strokeStyle = "#4ade80"; ctx.fillStyle = "rgba(74,222,128,.12)";
    const x = Math.min(ui.dragBox.start.x, ui.dragBox.end.x); const y = Math.min(ui.dragBox.start.y, ui.dragBox.end.y);
    const w = Math.abs(ui.dragBox.start.x - ui.dragBox.end.x); const h = Math.abs(ui.dragBox.start.y - ui.dragBox.end.y);
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); ctx.restore();
  }
}

function backdropNumber(sectorId: number, index: number, salt: number): number {
  let value = (sectorId + 1) * 0x9e3779b1 ^ (index + 1) * 0x85ebca6b ^ salt;
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return ((value ^ value >>> 16) >>> 0) / 2 ** 32;
}

function drawBackdrop(sectorId: number): void {
  const backdrop = sectorBackdrop(sectorId);
  ctx.fillStyle = backdrop.background;
  ctx.fillRect(0, 0, ui.viewport.width, ui.viewport.height);

  const glowX = ui.viewport.width * (0.2 + backdropNumber(sectorId, 0, 17) * 0.6);
  const glowY = ui.viewport.height * (0.2 + backdropNumber(sectorId, 0, 31) * 0.6);
  const glowRadius = Math.max(ui.viewport.width, ui.viewport.height) * 0.7;
  const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowRadius);
  glow.addColorStop(0, backdrop.wash);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, ui.viewport.width, ui.viewport.height);

  ctx.fillStyle = backdrop.starColor;
  for (let index = 0; index < backdrop.starCount; index += 1) {
    const x = Math.floor(backdropNumber(sectorId, index, 101) * ui.viewport.width);
    const y = Math.floor(backdropNumber(sectorId, index, 211) * ui.viewport.height);
    const size = backdropNumber(sectorId, index, 307) > 0.88 ? 2 : 1;
    ctx.globalAlpha = 0.35 + backdropNumber(sectorId, index, 401) * 0.65;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;
}

function draw(seconds: number): void {
  drawBackdrop(ui.currentSector);
  drawOrderFeedback(seconds);

  const sectorRocks = state.asteroids.filter((asteroid) => asteroid.sectorId === ui.currentSector);
  const sectorShips = state.ships.filter((ship) => ship.sectorId === ui.currentSector && ship.state !== "jumpingOut" && ship.state !== "jumpingHome");
  const gate = state.sectors[ui.currentSector]!.gate;
  const legacyGateVisible = gate.to !== ui.currentSector;
  const gateScreen = worldToScreen(ui.camera, ui.viewport, gate.position);
  if (legacyGateVisible) {
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(gateScreen.x - gate.size.width * ui.camera.zoom / 2, gateScreen.y - gate.size.height * ui.camera.zoom / 2, gate.size.width * ui.camera.zoom, gate.size.height * ui.camera.zoom);
  }
  for (const project of state.gateProjects) {
    const end = project.ends.find((candidate) => candidate.sectorId === ui.currentSector);
    if (!end) continue;
    if (project.complete) fillWorldRect(end.position, { width: 24, height: 24 }, "#22d3ee");
    else strokeWorldRect(end.position, { width: 24, height: 24 }, "#22d3ee");
  }
  for (const asteroid of sectorRocks) {
    fillWorldRect(asteroid.position, asteroid.size, asteroidColor(asteroid.material, asteroid.rich));
  }
  for (const connector of ui.currentSector === 0 ? stationConnectors(state.station.modules) : []) {
    drawStationConnector(connector.from, connector.to);
  }
  for (const module of ui.currentSector === 0 ? state.station.modules : []) {
    drawStationModule(module);
  }
  if (ui.currentSector === 0) drawConstructionSite();
  if (ui.currentSector === 0 && state.station.construction) {
    strokeWorldRect(state.station.construction.position, state.station.construction.size, "#cbd5e1");
  }
  for (const site of state.claimSites) {
    if (site.sectorId === ui.currentSector) drawClaimSite(site);
  }

  for (const ship of sectorShips) {
    const beam = laserBeam(state, ship);
    if (beam) drawLaser(beam, seconds);
  }

  for (const ship of sectorShips) {
    drawShip(ship);
    if (ui.selectedShips.includes(ship.id)) drawSelectionRing(ship.position, shipSize(ship.design));

    const gauge = cargoGauge(ship);
    if (gauge) drawGauge(ship.position, gauge, shipSize(ship.design));
  }
  const panelContext: ShipPanelContext = renderShipPanel(state, shipPanelBox, { selectedShips: ui.selectedShips, selectedShip: ui.selectedShip, renderedPanel: ui.renderedPanel });
  ui.selectedShips = panelContext.selectedShips;
  ui.selectedShip = panelContext.selectedShip;
  ui.renderedPanel = panelContext.renderedPanel;
  renderStoragePanel(storagePanel, state, ui.storagePanelOpen, performance.now(), ui.deleteConfirmations);
  renderPartTip();

  if (sectorNameEl) sectorNameEl.textContent = state.sectors[ui.currentSector]!.name;
  const builtDestination = state.gateProjects.find((project) => project.complete && project.ends.some((end) => end.sectorId === ui.currentSector))
    ?.ends.find((end) => end.sectorId !== ui.currentSector)?.sectorId;
  const gateDestination = builtDestination ?? (legacyGateVisible ? gate.to : null);
  canvas.setAttribute("aria-label", ui.mapOpen
    ? mapLayout(state, ui.viewport).circles.map((circle) => `${circle.name}: ${circle.ships} ships${ui.pendingGate ? `, ${circle.id === ui.pendingGate.sectorId ? "current sector" : sectorInGateRange(ui.pendingGate.sectorId, circle.id) ? "in gate range" : "out of gate range"}` : ""}`).join("; ")
    : `Sector ${state.sectors[ui.currentSector]!.name}: ${sectorRocks.length} asteroids, ${ui.currentSector === 0 ? "station present" : "no station"}${gateDestination === null ? "" : `, gate to ${state.sectors[gateDestination]!.name}`}`);
  // Re-checked every frame, so zooming under a still ui.pointer updates it too,
  // and the box closes by itself when a hovered asteroid runs out.
  let hovered = ui.mapOpen ? null : hoveredBody(state, ui.camera, ui.viewport, ui.pointer, ui.currentSector);
  if (hovered?.kind === "claimSite") ui.stickySite = hovered.id;
  else if (ui.infoHovered && ui.stickySite !== null && !ui.mapOpen) hovered = { kind: "claimSite", id: ui.stickySite };
  else ui.stickySite = null;
  // A + cell sits above the canvas, so a ship beside it would never hear the
  // click. While the ui.pointer is on a ship, the cells let clicks through.
  buildControls.classList.toggle("over-ship", hovered?.kind === "ship");
  const info = infoBox(state, hovered);
  box.hidden = info === null;
  if (info === null) ui.infoHovered = false;
  box.style.pointerEvents = info?.action ? "auto" : "none";
  infoAction.hidden = !info?.action;
  if (info?.action) { infoAction.textContent = info.action.label; infoAction.dataset.site = String(info.action.siteId); }
  const body = hovered && bodyOf(state, hovered);
  if (body && info) {
    const anchor = worldToScreen(ui.camera, ui.viewport, {
      x: body.position.x + body.size.width / 2,
      y: body.position.y - body.size.height / 2,
    });
    box.style.left = `${anchor.x + (info.action ? 0 : 8)}px`;
    box.style.top = `${anchor.y}px`;
    boxTitle.textContent = info.title;
    boxLine.textContent = info.line;
  }
  if (legacyGateVisible && ui.pointer && Math.hypot(ui.pointer.x - gateScreen.x, ui.pointer.y - gateScreen.y) < Math.max(14, gate.size.width * ui.camera.zoom / 2)) {
    const jumping = state.ships.some((ship) => ship.sectorId === ui.currentSector && (ship.state === "jumpingOut" || ship.state === "jumpingHome"));
    box.hidden = false; boxTitle.textContent = "Gate"; boxLine.textContent = jumping ? "Jumping" : `Gate to ${state.sectors[gate.to]!.name}`;
    box.style.left = `${gateScreen.x + 16}px`; box.style.top = `${gateScreen.y}px`;
  }
  if (ui.mapOpen) {
    // The map covers the sector, so only its circles have anything to show.
    const layout = mapLayout(state, ui.viewport);
    const id = ui.pointer ? mapHit(layout, ui.pointer) : null;
    const sectorInfo = id === null ? null : sectorBox(state, id);
    box.hidden = sectorInfo === null;
    if (sectorInfo && id !== null) {
      const circle = layout.circles[id]!;
      box.style.left = `${circle.center.x + circle.radius + 8}px`;
      box.style.top = `${circle.center.y - circle.radius}px`;
      boxTitle.textContent = sectorInfo.title;
      boxLine.textContent = sectorInfo.line;
    }
  }

  const sites = availableModuleBuildSites(state);
  const sitesKey = JSON.stringify(sites);
  if (sitesKey !== ui.renderedSites) {
    ui.renderedSites = sitesKey;
    buildControls.replaceChildren(...sites.map((site) => {
      const button = document.createElement("button");
      button.className = "build-toggle";
      button.dataset.x = String(site.x);
      button.dataset.y = String(site.y);
      button.setAttribute("aria-label", `Add station module at ${site.x}, ${site.y}`);
      const symbol = document.createElement("span");
      symbol.textContent = "+";
      button.append(symbol);
      return button;
    }));
  }
  const control = buildControlSize(ui.camera.zoom);
  buildControls.style.setProperty("--cell", `${control.cell}px`);
  buildControls.style.setProperty("--glyph", `${control.glyph}px`);
  for (const button of buildControls.querySelectorAll<HTMLButtonElement>("button[data-x]")) {
    const screen = worldToScreen(ui.camera, ui.viewport, {
      x: Number(button.dataset.x),
      y: Number(button.dataset.y),
    });
    button.style.left = `${screen.x - control.cell / 2}px`;
    button.style.top = `${screen.y - control.cell / 2}px`;
  }
  const inBuildArea = ui.pointer !== null
    && pointerInBuildArea(state, screenToWorld(ui.camera, ui.viewport, ui.pointer));
  buildControls.hidden = ui.currentSector !== 0 || !buildControlsVisible(inBuildArea, ui.controlsHovered);
  if (ui.buildMenuOpen && ui.selectedBuildSite) {
    const screen = worldToScreen(ui.camera, ui.viewport, ui.selectedBuildSite);
    buildMenu.style.left = `${Math.round(screen.x + 20)}px`;
    buildMenu.style.top = `${Math.round(screen.y - 20)}px`;
  }
  if (ui.shipMenuBuilder !== null) {
    drawPaintCanvas();
    const view = shipMenuView(state, ui.shipMenuBuilder, ui.draft);
    const stats = shipMenu.querySelector<HTMLElement>(".stats")!;
    const text = `Pixels ${view.pixels}\nSpeed ${view.stats.speed}\nHold ${view.stats.hold}\nMining time ${view.stats.miningTime}`;
    if (stats.textContent !== text) stats.textContent = text;
    const cost = shipMenu.querySelector<HTMLElement>(".cost")!;
    const costKey = JSON.stringify([view.parts, view.buildTime, view.materials]);
    if (cost.dataset.key !== costKey) {
      cost.dataset.key = costKey;
      cost.replaceChildren(document.createTextNode(`${view.parts}\nBuild time ${view.buildTime}\nCost `));
      view.materials.forEach((material, index) => {
        if (index > 0) cost.append(" ");
        const total = document.createElement("span");
        total.textContent = `${material.amount} ${material.material}`;
        total.classList.toggle("short", material.short);
        cost.append(total);
      });
    }
    shipMenu.querySelector<HTMLButtonElement>(".build")!.disabled = !view.canBuild;
    const blueprintName = shipMenu.querySelector<HTMLInputElement>(".blueprint-name")!;
    shipMenu.querySelector<HTMLButtonElement>("button[data-blueprint-save]")!.disabled =
      blueprintName.value.trim() === "" || designOf(ui.draft).width === 0;
  }
  const menuItems = buildMenuItems(state);
  const menuKey = JSON.stringify(menuItems);
  if (menuKey !== ui.renderedMenu) {
    ui.renderedMenu = menuKey;
    buildMenu.replaceChildren(...menuItems.map((item) => {
      const button = document.createElement("button");
      button.dataset.module = item.type;
      button.disabled = item.disabled;
      button.title = item.title;
      const name = document.createElement("span");
      name.textContent = item.type;
      const cost = document.createElement("span");
      cost.textContent = item.cost;
      button.append(name, cost);
      return button;
    }));
  }

  claimButton.hidden = !ui.mapOpen;
  hint.hidden = !ui.pendingClaim;
  hint.textContent = ui.mapOpen ? "Pick the sector for the claim station" : "Click a spot for the construction site. Esc cancels.";
  renameBox.hidden = ui.renamingSector === null || !ui.mapOpen;
  if (renameBox.hidden) ui.renamingSector = null;

  if (ui.mapOpen) {
    const layout = mapLayout(state, ui.viewport);
    ctx.save(); ctx.fillStyle = "rgba(15,23,42,.94)"; ctx.fillRect(0, 0, ui.viewport.width, ui.viewport.height);
    ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 3;
    for (const link of layout.links) { ctx.beginPath(); ctx.moveTo(link.from.x, link.from.y); ctx.lineTo(link.to.x, link.to.y); ctx.stroke(); }
    for (const circle of layout.circles) {
      const available = !ui.pendingGate || circle.id === ui.pendingGate.sectorId || sectorInGateRange(ui.pendingGate.sectorId, circle.id);
      ctx.beginPath(); ctx.arc(circle.center.x, circle.center.y, circle.radius, 0, Math.PI * 2);
      ctx.fillStyle = available ? circle.tint : "#334155";
      ctx.globalAlpha = available ? 1 : 0.55;
      ctx.fill(); ctx.strokeStyle = available ? "#67e8f9" : "#64748b"; ctx.stroke();
      ctx.fillStyle = "#f8fafc"; ctx.textAlign = "center"; ctx.font = "14px monospace";
      ctx.fillText(circle.name, circle.center.x, circle.center.y - 4);
      ctx.fillText(`${circle.ships} ships`, circle.center.x, circle.center.y + 18);
      if (circle.claimed) {
        const label = renameLabel(circle);
        ctx.font = "11px monospace"; ctx.strokeStyle = "#94a3b8"; ctx.strokeRect(label.x, label.y, label.width, label.height);
        ctx.fillText("Rename", circle.center.x, label.y + 12);
        ctx.font = "14px monospace";
      }
      if (ui.renamingSector === circle.id) {
        renameBox.style.left = `${Math.round(circle.center.x - 60)}px`;
        renameBox.style.top = `${Math.round(circle.center.y - 22)}px`;
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}



function frame(nowMs: number): void {
  const dt = Math.max(0, (nowMs - ui.lastTimeMs) / 1000);
  ui.lastTimeMs = nowMs;
  const movement = keyPan(ui.heldKeys, dt);
  if (movement.x || movement.y) ui.camera = panBy(ui.camera, movement.x, movement.y);
  // Paused frames skip the tick, so selecting, ordering and the menus keep
  // working on a state that simply does not advance.
  const seconds = gameSeconds(ui.clock, dt);
  if (seconds > 0) state = tick(state, seconds);
  renderSpeedControls();
  draw(nowMs / 1000);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
