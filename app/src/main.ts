import {
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
  setDefaultBehaviour,
  setMineMaterial,
  resumeDefault,
  setStorageLimit,
  shipSize,
  startModuleBuild,
  startShipBuild,
  startGateBuild,
  sectorInGateRange,
  tick,
  type Beam,
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
import { shipPanel, shipSprite, slotColor } from "./ships";
import { type MaterialBox, contextOrderAllowed, isBoxDrag, keyPan, orderLineAlpha, orderTargetAt, selectionPanel, shipsInBox, toggleShip } from "./selection";
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
import { deleteButtonAction, storagePanelOpenAfterClick, storagePanelRows, type DeleteConfirmation } from "./storage";
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
let currentSector = 0;
let mapOpen = false;
let viewport: Viewport = { width: 0, height: 0 };
// Last pointer position over the canvas, or null once it has left.
let pointer: Vec | null = null;
let buildMenuOpen = false;
let renderedMenu = "";
let renderedSites = "";
let controlsHovered = false;
let selectedBuildSite: Vec | null = null;
// The Builder whose Build ship menu is open, by module index.
let shipMenuBuilder: number | null = null;
let draft: ShipDraft = emptyDraft();
const blueprintStore = resolveBlueprintStore(window);
let blueprints: Blueprint[] = loadBlueprints(blueprintStore);
// The Build ship canvas: which canvas pixel is at its middle and how big one
// is on screen, plus the mouse state of a stroke or a pan in progress.
let paintView: Camera = emptyView();
let paintCanvas: HTMLCanvasElement | null = null;
let paintPointer: Vec | null = null;
// Where the mouse is over a ship's design, on the paint grid or the selected
// ship's thumbnail, in window pixels. Kept as a position and looked up every
// frame, so the name follows a pixel painted under a still mouse.
let partHover: { at: Vec; source: "paint" | "thumb" } | null = null;
let stroking: Vec | null = null;
let paintPan: Vec | null = null;
let selectedShip: number | null = null;
let selectedShips: number[] = [];
let renderedPanel = "";
const heldKeys = new Set<string>();
let pan: { last: Vec } | null = null;
let dragBox: { start: Vec; end: Vec; additive: boolean } | null = null;
let orderLines: { from: Vec[]; to: Vec; start: number } | null = null;
let pendingGate: PendingGate | null = null;
// "Build claim station" was pressed and the next click on the canvas, once a
// sector is showing, places the construction site.
let pendingClaim = false;
let renamingSector: number | null = null;
// The pointer can travel from a claim site onto its hover box to press
// Remove site, so the box keeps its site while the pointer is on it.
let stickySite: number | null = null;
let infoHovered = false;
let clock = INITIAL_CLOCK;
let storagePanelOpen = false;
const deleteConfirmations = new Map<Material, DeleteConfirmation>();

function openStoragePanel(): void {
  storagePanelOpen = true;
  storagePanel.hidden = false;
  if (storagePanel.children.length > 0) return;
  const title = document.createElement("h2");
  title.textContent = "Storage";
  const rows = storagePanelRows(state).map(({ material }) => {
    const row = document.createElement("div"); row.className = "storage-row"; row.dataset.material = material;
    const name = document.createElement("span"); name.className = "material"; name.textContent = material;
    const amount = document.createElement("span"); amount.className = "amount";
    const limitLabel = document.createElement("label"); limitLabel.textContent = "Limit";
    const limit = document.createElement("input"); limit.type = "number"; limit.min = "0"; limit.placeholder = "No limit"; limit.dataset.limit = material; limitLabel.append(limit);
    const deleteLabel = document.createElement("label"); deleteLabel.textContent = "Amount";
    const quantity = document.createElement("input"); quantity.type = "number"; quantity.min = "1"; quantity.dataset.deleteAmount = material; deleteLabel.append(quantity);
    const remove = document.createElement("button"); remove.textContent = "Delete"; remove.dataset.delete = material;
    row.append(name, amount, limitLabel, deleteLabel, remove);
    return row;
  });
  storagePanel.replaceChildren(title, ...rows);
}

function closeStoragePanel(): void {
  storagePanelOpen = false;
  storagePanel.hidden = true;
  deleteConfirmations.clear();
}

function renderStoragePanel(now: number): void {
  if (!storagePanelOpen) return;
  for (const row of storagePanelRows(state)) {
    const element = storagePanel.querySelector<HTMLElement>(`.storage-row[data-material="${row.material}"]`)!;
    element.querySelector<HTMLElement>(".amount")!.textContent = String(row.amount);
    const limit = element.querySelector<HTMLInputElement>("input[data-limit]")!;
    if (document.activeElement !== limit) limit.value = row.limit;
    const confirmation = deleteConfirmations.get(row.material);
    const remove = element.querySelector<HTMLButtonElement>("button[data-delete]")!;
    remove.textContent = confirmation !== undefined && now <= confirmation.until ? "Confirm" : "Delete";
    if (confirmation !== undefined && now > confirmation.until) deleteConfirmations.delete(row.material);
  }
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
  const action = deleteButtonAction(deleteConfirmations.get(material) ?? null, material, quantity.value, performance.now());
  if (action.deleteAmount !== null) {
    state = deleteStock(state, material, action.deleteAmount);
    quantity.value = "";
  }
  if (action.confirmation) deleteConfirmations.set(material, action.confirmation);
  else deleteConfirmations.delete(material);
  renderStoragePanel(performance.now());
});

function closeGateMenu(): void {
  gateMenu.hidden = true;
  pendingGate = dismissGatePlacement(pendingGate);
}

function closeBuildMenu(): void {
  buildMenuOpen = false;
  buildMenu.hidden = true;
  selectedBuildSite = null;
}

buildControls.addEventListener("pointerover", () => {
  controlsHovered = true;
});
// The + cells sit above the canvas, so the canvas stops hearing the pointer
// while it is over one.
buildControls.addEventListener("pointermove", (event) => {
  pointer = mousePoint(event);
});
buildControls.addEventListener("pointerout", (event) => {
  if (!buildControls.contains(event.relatedTarget as Node | null)) controlsHovered = false;
});
buildControls.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-x]");
  if (!button) return;
  selectedBuildSite = { x: Number(button.dataset.x), y: Number(button.dataset.y) };
  buildMenuOpen = true;
  buildMenu.hidden = false;
});

buildMenu.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-module]");
  if (!button || button.disabled) return;
  if (!selectedBuildSite) return;
  state = startModuleBuild(state, button.dataset.module as ModuleType, selectedBuildSite);
  closeBuildMenu();
});

document.addEventListener("click", (event) => {
  if (!buildMenuOpen) return;
  const target = event.target as Node | null;
  if (dismissBuildMenuForClick(buildMenu.contains(target), buildControls.contains(target))) {
    closeBuildMenu();
  }
});

document.addEventListener("click", (event) => {
  if (!gateMenu.hidden && !gateMenu.contains(event.target as Node | null)) closeGateMenu();
});

window.addEventListener("mousedown", (event) => {
  if (shouldDismissShipMenuOnMouseDown(shipMenuBuilder !== null, shipMenu.contains(event.target as Node | null))) {
    closeShipMenu();
  }
}, true);

window.addEventListener("mousedown", (event) => {
  if (!gateMenu.hidden && !gateMenu.contains(event.target as Node | null)) closeGateMenu();
}, true);

claimButton.addEventListener("click", () => {
  pendingClaim = true;
  closeGateMenu();
});
infoAction.addEventListener("click", () => {
  const siteId = Number(infoAction.dataset.site);
  state = removeClaimSite(state, siteId);
  stickySite = null;
  infoHovered = false;
});
box.addEventListener("pointerenter", () => { infoHovered = true; });
box.addEventListener("pointerleave", () => { infoHovered = false; });

function startRename(sectorId: number): void {
  renamingSector = sectorId;
  renameBox.value = state.sectors[sectorId]!.name;
  renameBox.hidden = false;
  renameBox.focus();
  renameBox.select();
}

// Keys typed into the name box are not map or camera keys.
renameBox.addEventListener("keydown", (event) => {
  event.stopPropagation();
  if (event.key === "Enter" && renamingSector !== null) {
    state = renameSector(state, renamingSector, renameBox.value);
    renamingSector = null;
  } else if (event.key === "Escape") renamingSector = null;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") pendingClaim = false;
  if (event.key.toLowerCase() === "m" || event.key === "Escape") mapOpen = mapToggled(mapOpen, event.key);
  if (event.key === "Escape") closeGateMenu();
  if (buildMenuOpen && dismissBuildMenuForKey(event.key)) closeBuildMenu();
  if (shipMenuBuilder !== null && event.key === "Escape") closeShipMenu();
  if (!(event.target instanceof HTMLSelectElement) && !(event.target instanceof HTMLInputElement)) {
    heldKeys.add(event.key);
    const next = clockAfterKey(clock, event.key, event.repeat);
    if (next !== clock || event.key === " ") { clock = next; event.preventDefault(); }
  }
  if (event.key.startsWith("Arrow")) event.preventDefault();
});
window.addEventListener("keyup", (event) => { heldKeys.delete(event.key); heldKeys.delete(event.key.toLowerCase()); });
window.addEventListener("blur", () => heldKeys.clear());

speedControls.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-speed]");
  if (!target) return;
  clock = clockAfterButton(clock, target.dataset.speed as SpeedButtonId);
  // Focus would make a later Space press click this button as well.
  target.blur();
});

function renderSpeedControls(): void {
  const buttons = speedButtons(clock);
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

// A small picture of a ship, scaled to fit the panel.
function thumbnailElement(design: ShipDesign): HTMLElement {
  const thumb = document.createElement("canvas");
  thumb.width = design.width;
  thumb.height = design.height;
  thumb.className = "ship-thumb";
  const scale = Math.min(176 / design.width, 120 / design.height, 24);
  thumb.style.width = `${design.width * scale}px`;
  thumb.style.height = `${design.height * scale}px`;
  thumb.getContext("2d")!.drawImage(shipSprite(design), 0, 0);
  return thumb;
}

const TOOL_BUTTONS = [["erase", "Eraser"], ["fill", "Fill"]] as const;

function renderBlueprints(): void {
  const list = shipMenu.querySelector<HTMLElement>(".blueprints")!;
  if (blueprints.length === 0) {
    const empty = document.createElement("span");
    empty.className = "hint";
    empty.textContent = "No saved blueprints";
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...blueprints.map((blueprint, index) => {
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
  paintCanvas = document.createElement("canvas");
  paintCanvas.className = "paint";
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "Drag to paint. Right-drag or middle-drag to pan, scroll to zoom.";
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
  shipMenu.replaceChildren(title, modules, tools, paintCanvas, hint, stats, cost, save, blueprintList, build);
  renderBlueprints();
  syncShipMenuButtons();
}

function syncShipMenuButtons(): void {
  for (const element of shipMenu.querySelectorAll<HTMLButtonElement>("button[data-module]")) {
    element.classList.toggle("pressed", draft.tool === "paint" && draft.module === element.dataset.module);
  }
  for (const element of shipMenu.querySelectorAll<HTMLButtonElement>("button[data-size]")) {
    element.classList.toggle("pressed", draft.tool !== "fill" && draft.size === Number(element.dataset.size));
  }
  for (const element of shipMenu.querySelectorAll<HTMLButtonElement>("button[data-tool]")) {
    element.classList.toggle("pressed", draft.tool === element.dataset.tool);
  }
}

function openShipMenu(builder: number): void {
  shipMenuBuilder = builder;
  draft = emptyDraft();
  paintView = emptyView();
  renderShipMenu();
  shipMenu.hidden = false;
}

function closeShipMenu(): void {
  shipMenuBuilder = null;
  shipMenu.hidden = true;
  stroking = null;
  paintPan = null;
  partHover = null;
}

shipMenu.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!target || target.disabled || shipMenuBuilder === null) return;
  const data = target.dataset;
  if (data.module) draft = withModule(withTool(draft, "paint"), data.module as ShipDraft["module"]);
  else if (data.size) draft = withSize(draft.tool === "fill" ? withTool(draft, "paint") : draft, Number(data.size) as ShipDraft["size"]);
  else if (data.tool) draft = withTool(draft, data.tool as ShipDraft["tool"]);
  else if (data.blueprintSave !== undefined) {
    const input = shipMenu.querySelector<HTMLInputElement>(".blueprint-name")!;
    blueprints = saveBlueprint(blueprintStore, input.value, designOf(draft));
    input.value = "";
    target.disabled = true;
    renderBlueprints();
  }
  else if (data.blueprintLoad !== undefined) {
    const blueprint = blueprints[Number(data.blueprintLoad)];
    if (!blueprint) return;
    draft = draftFromDesign(draft, blueprint.design);
    paintView = viewCentredOn(paintView, blueprint.design);
  }
  else if (data.blueprintDelete !== undefined) {
    const blueprint = blueprints[Number(data.blueprintDelete)];
    if (!blueprint) return;
    blueprints = deleteBlueprint(blueprintStore, blueprint.name);
    renderBlueprints();
  }
  else if (data.build !== undefined) {
    state = startShipBuild(state, shipMenuBuilder, designOf(draft));
    closeShipMenu();
    return;
  }
  syncShipMenuButtons();
});

shipMenu.addEventListener("input", (event) => {
  const input = (event.target as HTMLElement).closest<HTMLInputElement>(".blueprint-name");
  if (!input) return;
  const save = shipMenu.querySelector<HTMLButtonElement>("button[data-blueprint-save]")!;
  save.disabled = input.value.trim() === "" || designOf(draft).width === 0;
});

function paintPointAt(client: Vec): Vec {
  const bounds = paintCanvas!.getBoundingClientRect();
  return {
    x: (client.x - bounds.left) * (paintCanvas!.width / bounds.width),
    y: (client.y - bounds.top) * (paintCanvas!.height / bounds.height),
  };
}

function paintPoint(event: MouseEvent): Vec {
  return paintPointAt({ x: event.clientX, y: event.clientY });
}

function paintViewport(): Viewport {
  return { width: paintCanvas!.width, height: paintCanvas!.height };
}

shipMenu.addEventListener("mousedown", (event) => {
  if (event.target !== paintCanvas) return;
  event.preventDefault();
  const point = paintPoint(event);
  if (event.button === 0) {
    const cell = cellAt(paintView, paintViewport(), point);
    applyTool(draft, cell);
    stroking = cell;
  } else if (event.button === 1 || event.button === 2) paintPan = point;
});
shipMenu.addEventListener("contextmenu", (event) => {
  if (event.target === paintCanvas) event.preventDefault();
});
shipMenu.addEventListener("wheel", (event) => {
  if (event.target !== paintCanvas) return;
  event.preventDefault();
  paintView = zoomView(paintView, paintViewport(), paintPoint(event), wheelZoomFactor(event.deltaY));
}, { passive: false });
shipMenu.addEventListener("mousemove", (event) => {
  paintPointer = event.target === paintCanvas ? paintPoint(event) : null;
  partHover = paintPointer ? { at: { x: event.clientX, y: event.clientY }, source: "paint" } : null;
});
shipMenu.addEventListener("mouseleave", () => {
  paintPointer = null;
  partHover = null;
});
shipPanelBox.addEventListener("mousemove", (event) => {
  const onThumb = (event.target as HTMLElement).closest(".ship-thumb") !== null;
  partHover = onThumb ? { at: { x: event.clientX, y: event.clientY }, source: "thumb" } : null;
});
shipPanelBox.addEventListener("mouseleave", () => {
  partHover = null;
});
window.addEventListener("mousemove", (event) => {
  if (!paintCanvas || shipMenuBuilder === null) return;
  const point = paintPoint(event);
  if (paintPan) {
    paintView = panBy(paintView, (point.x - paintPan.x), (point.y - paintPan.y));
    paintPan = point;
  }
  // Fill is a single click, so dragging with it does nothing more.
  if (stroking && draft.tool !== "fill") {
    const cell = cellAt(paintView, paintViewport(), point);
    for (const step of lineCells(stroking, cell)) applyTool(draft, step);
    stroking = cell;
  }
});
window.addEventListener("mouseup", () => {
  stroking = null;
  paintPan = null;
});

function resize(): void {
  const ratio = window.devicePixelRatio || 1;
  viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
  canvas.width = Math.round(viewport.width * ratio);
  canvas.height = Math.round(viewport.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener("resize", resize);
resize();

// Fits the starting field only. Respawns can land off screen; the camera does
// not follow them.
let camera: Camera = fitCamera(viewport, [state.station.dock, state.station.storage, ...state.asteroids.filter((rock) => rock.sectorId === 0), state.sectors[0]!.gate]);

function mousePoint(event: MouseEvent): Vec {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    camera = zoomAt(camera, viewport, mousePoint(event), wheelZoomFactor(event.deltaY));
  },
  { passive: false },
);

canvas.addEventListener("mousedown", (event) => {
  const point = mousePoint(event);
  if (event.button === 1) { event.preventDefault(); pan = { last: point }; }
  else if (event.button === 0) dragBox = { start: point, end: point, additive: event.shiftKey };
});

canvas.addEventListener("mousemove", (event) => {
  pointer = mousePoint(event);
});

canvas.addEventListener("mouseleave", () => {
  pointer = null;
});

window.addEventListener("mousemove", (event) => {
  const point = mousePoint(event);
  if (pan) { camera = panBy(camera, point.x - pan.last.x, point.y - pan.last.y); pan.last = point; }
  if (dragBox) dragBox.end = point;
});

window.addEventListener("mouseup", (event) => {
  if (event.button === 1) pan = null;
  if (event.button === 0 && dragBox) {
    const { start, end, additive } = dragBox; dragBox = null;
    if (!isBoxDrag(start, end) && event.target === canvas && pendingClaim && !mapOpen) {
      const placed = startClaimSite(state, currentSector, screenToWorld(camera, viewport, mousePoint(event)));
      if (placed !== state) { state = placed; pendingClaim = false; }
    } else if (!isBoxDrag(start, end) && event.target === canvas && pendingGate?.targetSector === currentSector) {
      state = startGateBuild(state, pendingGate.sectorId, pendingGate.position, currentSector, screenToWorld(camera, viewport, mousePoint(event)));
      pendingGate = null;
    } else if (isBoxDrag(start, end)) {
      const picked = shipsInBox(state, camera, viewport, currentSector, start, end);
      selectedShips = additive ? [...new Set([...selectedShips, ...picked])] : picked;
      selectedShip = selectedShips[0] ?? null;
    } else if (event.target === canvas && mapOpen) {
      const layout = mapLayout(state, viewport);
      const renameId = renameHit(layout, mousePoint(event));
      const id = renameId === null ? mapHit(layout, mousePoint(event)) : null;
      if (renameId !== null) startRename(renameId);
      else if (id !== null) {
        if (!gateTargetAllowed(pendingGate, id)) return;
        currentSector = id;
        const sectorRocks = state.asteroids.filter((rock) => rock.sectorId === id);
        const sectorSites = state.claimSites.filter((site) => site.sectorId === id).map((site) => ({ position: site.position, size: CLAIM_SITE_SIZE }));
        const bodies = [...sectorRocks, ...sectorSites, ...(id === 0 ? [state.station.dock, state.station.storage, ...state.station.modules] : []), state.sectors[id]!.gate];
        camera = fitCamera(viewport, bodies);
        mapOpen = false;
        if (pendingGate) pendingGate.targetSector = id;
      }
    } else if (event.target === canvas) {
      const point = mousePoint(event); const hovered = hoveredBody(state, camera, viewport, point, currentSector);
      const clickedStorage = hovered?.kind === "storage"
        || (hovered?.kind === "module" && state.station.modules[hovered.index]?.type === "Storage");
      const storageOpen = storagePanelOpenAfterClick(storagePanelOpen, clickedStorage ? "storage" : hovered ? "other" : "empty");
      if (storageOpen && !storagePanelOpen) openStoragePanel();
      else if (!storageOpen && storagePanelOpen) closeStoragePanel();
      if (hovered?.kind === "ship") selectedShips = additive ? toggleShip(selectedShips, state.ships[hovered.index]!.id) : [state.ships[hovered.index]!.id];
      else if (!additive) selectedShips = [];
      selectedShip = selectedShips[0] ?? null;
      if (hovered?.kind === "module" && state.station.modules[hovered.index]?.type === "Builder") openShipMenu(hovered.index);
    }
  }
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (!contextOrderAllowed(mapOpen)) return;
  const point = mousePoint(event); const hovered = hoveredBody(state, camera, viewport, point, currentSector, { includeShips: false });
  if (!selectedShips.length && !hovered && currentSector === HOME_SECTOR) {
    pendingGate = { sectorId: currentSector, position: screenToWorld(camera, viewport, point) };
    gateMenu.style.left = `${point.x}px`; gateMenu.style.top = `${point.y}px`; gateMenu.hidden = false;
    return;
  }
  if (!selectedShips.length) return;
  const world = screenToWorld(camera, viewport, point); const target = orderTargetAt(state, hovered, world, currentSector);
  const to = target.kind === "move" ? target.point : target.kind === "home" ? state.station.dock.position
    : target.kind === "haulGate" ? world : target.kind === "supplySite" ? state.claimSites.find((site) => site.id === target.siteId)?.position ?? world : state.asteroids.find((asteroid) => asteroid.id === target.asteroidId)?.position ?? world;
  orderLines = { from: selectedShips.flatMap((id) => { const ship = state.ships.find((item) => item.id === id); return ship ? [ship.position] : []; }), to, start: performance.now() / 1000 };
  state = giveOrder(state, selectedShips, target);
});

gateMenu.addEventListener("click", () => {
  gateMenu.hidden = true;
  mapOpen = pendingGate !== null;
});

shipPanelBox.addEventListener("change", (event) => {
  if ((event.target as HTMLSelectElement).name === "default") state = setDefaultBehaviour(state, selectedShips, (event.target as HTMLSelectElement).value as "mine" | "none");
});
shipPanelBox.addEventListener("change", (event) => {
  const box = event.target as HTMLInputElement;
  if (box.name === "mine-material") state = setMineMaterial(state, selectedShips, box.value as Material, box.checked);
});
shipPanelBox.addEventListener("click", (event) => {
  if ((event.target as HTMLElement).closest("button[data-resume]")) state = resumeDefault(state, selectedShips);
});

function fillWorldRect(center: Vec, size: Size, color: string): void {
  const topLeft = worldToScreen(camera, viewport, {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
  });
  ctx.fillStyle = color;
  ctx.fillRect(topLeft.x, topLeft.y, size.width * camera.zoom, size.height * camera.zoom);
}

function strokeWorldRect(center: Vec, size: Size, color: string): void {
  const topLeft = worldToScreen(camera, viewport, {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
  });
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = color;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 2;
  ctx.strokeRect(topLeft.x, topLeft.y, size.width * camera.zoom, size.height * camera.zoom);
  ctx.restore();
}

function drawStationConnector(from: Vec, to: Vec): void {
  const start = worldToScreen(camera, viewport, from);
  const end = worldToScreen(camera, viewport, to);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = Math.max(4, 7 * camera.zoom);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = Math.max(1, 2 * camera.zoom);
  ctx.stroke();
  ctx.restore();
}

// The Dock's pads, marked whether or not a ship is on them. Called with the
// canvas already translated to the Dock's centre.
function drawBerthPads(dock: Vec): void {
  const side = BERTH_PAD_SIZE * camera.zoom;
  ctx.save();
  ctx.strokeStyle = moduleAppearance("Dock").accent;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(1, camera.zoom);
  ctx.setLineDash([Math.max(2, 3 * camera.zoom), Math.max(2, 2 * camera.zoom)]);
  for (const pad of dockBerths(dock)) {
    ctx.strokeRect((pad.x - dock.x) * camera.zoom - side / 2, (pad.y - dock.y) * camera.zoom - side / 2, side, side);
  }
  ctx.restore();
}

function drawStationModule(module: StationModule): void {
  const center = worldToScreen(camera, viewport, module.position);
  const width = module.size.width * camera.zoom;
  const height = module.size.height * camera.zoom;
  const appearance = moduleAppearance(module.type);
  const detailWidth = Math.max(1.5, 2 * camera.zoom);

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.fillStyle = "#1e293b";
  ctx.strokeStyle = appearance.accent;
  ctx.lineWidth = Math.max(1.5, 2 * camera.zoom);
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
      ctx.lineWidth = Math.max(1, camera.zoom);
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

// The slot being supplied fills as materials arrive, and is solid while it builds.
function supplyFraction(site: (typeof state.claimSites)[number]): number {
  if (site.timer !== null) return 1;
  const cost = CLAIM_MODULE_COST.Metal + CLAIM_MODULE_COST.Ice;
  return (site.delivered.Metal + site.delivered.Ice) / cost;
}

function drawClaimSite(site: (typeof state.claimSites)[number]): void {
  const size = { Dock: DOCK_SIZE, Storage: STORAGE_SIZE, Builder: DOCK_SIZE };
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
  const a = worldToScreen(camera, viewport, { x: ship.position.x - size.width / 2, y: ship.position.y - size.height / 2 });
  const b = worldToScreen(camera, viewport, { x: ship.position.x + size.width / 2, y: ship.position.y + size.height / 2 });
  const x = Math.round(a.x);
  const y = Math.round(a.y);
  ctx.drawImage(shipSprite(ship.design), x, y, Math.max(1, Math.round(b.x) - x), Math.max(1, Math.round(b.y) - y));
}

function drawSelectionRing(center: Vec, size: Size): void {
  const screen = worldToScreen(camera, viewport, center);
  const radius = Math.hypot(size.width, size.height) / 2 * camera.zoom + 5;
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
  const surface = paintCanvas!;
  if (surface.width !== surface.clientWidth || surface.height !== surface.clientHeight) {
    surface.width = surface.clientWidth;
    surface.height = surface.clientHeight;
  }
  const g = surface.getContext("2d")!;
  const vp = paintViewport();
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#0f172a";
  g.fillRect(0, 0, vp.width, vp.height);
  const { design, origin } = placedDesign(draft);
  if (design.width > 0) {
    const at = worldToScreen(paintView, vp, origin);
    g.drawImage(shipSprite(design), at.x, at.y, design.width * paintView.zoom, design.height * paintView.zoom);
  }
  if (paintView.zoom >= GRID_ZOOM) {
    const first = screenToWorld(paintView, vp, { x: 0, y: 0 });
    const last = screenToWorld(paintView, vp, { x: vp.width, y: vp.height });
    g.strokeStyle = "rgba(148,163,184,.25)";
    g.lineWidth = 1;
    g.beginPath();
    for (let x = Math.ceil(first.x); x <= last.x; x += 1) {
      const sx = Math.round(worldToScreen(paintView, vp, { x, y: 0 }).x) + 0.5;
      g.moveTo(sx, 0);
      g.lineTo(sx, vp.height);
    }
    for (let y = Math.ceil(first.y); y <= last.y; y += 1) {
      const sy = Math.round(worldToScreen(paintView, vp, { x: 0, y }).y) + 0.5;
      g.moveTo(0, sy);
      g.lineTo(vp.width, sy);
    }
    g.stroke();
  }
  if (paintPointer) {
    const cell = cellAt(paintView, vp, paintPointer);
    const reach = draft.tool === "fill" ? 0 : Math.floor(draft.size / 2);
    const corner = worldToScreen(paintView, vp, { x: cell.x - reach, y: cell.y - reach });
    const span = (2 * reach + 1) * paintView.zoom;
    g.strokeStyle = draft.tool === "erase" ? "#f87171" : "#facc15";
    g.lineWidth = 2;
    g.strokeRect(corner.x, corner.y, span, span);
  }
}

// The name of the part under the mouse, or null when it is not over a design.
function hoveredPart(hover: NonNullable<typeof partHover>): string | null {
  if (hover.source === "paint") {
    if (!paintCanvas || shipMenuBuilder === null) return null;
    return draftPartAt(draft, cellAt(paintView, paintViewport(), paintPointAt(hover.at)));
  }
  const thumb = shipPanelBox.querySelector<HTMLElement>(".ship-thumb");
  const ship = state.ships.find((candidate) => candidate.id === selectedShip);
  if (!thumb || !ship || shipPanelBox.hidden) return null;
  const bounds = thumb.getBoundingClientRect();
  return designPartAt(ship.design, {
    x: (hover.at.x - bounds.left) / bounds.width,
    y: (hover.at.y - bounds.top) / bounds.height,
  });
}

function renderPartTip(): void {
  const name = partHover && hoveredPart(partHover);
  partTip.hidden = !partHover || name === null;
  if (!partHover || name === null) return;
  partTip.textContent = name;
  partTip.style.left = `${partHover.at.x + 14}px`;
  partTip.style.top = `${partHover.at.y + 14}px`;
}

function renderShipPanel(): void {
  selectedShips = selectedShips.filter((id) => state.ships.some((ship) => ship.id === id));
  selectedShip = selectedShips[0] ?? null;
  const panel = selectedShip === null ? null : shipPanel(state, selectedShip);
  const list = selectionPanel(state, selectedShips);
  shipPanelBox.hidden = !panel || !list;
  // The design is left out of the key, since a capital ship's pixels are too
  // many to serialise every frame. The ship's id stands in for it.
  const key = JSON.stringify({ panel: { ...panel, design: null }, list, ship: selectedShip });
  if (!panel || !list || key === renderedPanel) return;
  renderedPanel = key;
  const title = document.createElement("h2");
  title.textContent = selectedShips.length > 1 ? `${selectedShips.length} ships selected` : `Ship ${panel.size}`;
  const rows = document.createElement("dl");
  for (const row of list.rows) {
    const term = document.createElement("dt"); term.textContent = row.name;
    const detail = document.createElement("dd"); detail.textContent = row.status; rows.append(term, detail);
  }
  for (const [label, value] of selectedShips.length === 1 ? panel.rows : []) {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    detail.dataset.row = label;
    rows.append(term, detail);
  }
  const select = document.createElement("select"); select.name = "default";
  for (const [value, label] of [["mine", "Default: Mine for Station"], ["none", "Default: None"]] as const) {
    const option = document.createElement("option"); option.value = value; option.textContent = label;
    option.selected = list.defaultBehaviour === value; select.append(option);
  }
  if (list.defaultBehaviour === "mixed") { const mixed = document.createElement("option"); mixed.textContent = "Default: Mixed"; mixed.selected = true; select.prepend(mixed); }
  const resume = document.createElement("button"); resume.textContent = "Resume"; resume.dataset.resume = ""; resume.disabled = !list.canResume;
  shipPanelBox.replaceChildren(title, rows, select, ...materialBoxes(list.materials), resume, ...(selectedShips.length === 1 ? [thumbnailElement(panel.design)] : []));
}

// One tickbox per material for ships on Mine for Station. A box the selected
// ships disagree on is half-ticked, and clicking it ticks it for all of them.
function materialBoxes(boxes: MaterialBox[] | null): HTMLElement[] {
  return (boxes ?? []).map(({ material, ticked }) => {
    const input = document.createElement("input");
    input.type = "checkbox"; input.name = "mine-material"; input.value = material;
    input.checked = ticked === "on"; input.indeterminate = ticked === "mixed";
    const label = document.createElement("label");
    label.className = "mine-material"; label.append(input, ` ${material}`);
    return label;
  });
}

// Screen-space so the numbers stay readable at any zoom.
const GAUGE = { width: 36, height: 12, gap: 4 };

function drawGauge(shipPosition: Vec, gauge: Gauge, size: Size): void {
  const top = worldToScreen(camera, viewport, {
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
  const from = worldToScreen(camera, viewport, beam.from);
  const to = worldToScreen(camera, viewport, beam.to);
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
  if (orderLines) {
    const alpha = orderLineAlpha(seconds - orderLines.start);
    if (alpha <= 0) orderLines = null;
    else {
      const to = worldToScreen(camera, viewport, orderLines.to);
      ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = "#86efac"; ctx.setLineDash([5, 4]);
      for (const from of orderLines.from) {
        const start = worldToScreen(camera, viewport, from);
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(to.x, to.y); ctx.stroke();
      }
      ctx.restore();
    }
  }
  if (dragBox) {
    ctx.save(); ctx.strokeStyle = "#4ade80"; ctx.fillStyle = "rgba(74,222,128,.12)";
    const x = Math.min(dragBox.start.x, dragBox.end.x); const y = Math.min(dragBox.start.y, dragBox.end.y);
    const w = Math.abs(dragBox.start.x - dragBox.end.x); const h = Math.abs(dragBox.start.y - dragBox.end.y);
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
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  const glowX = viewport.width * (0.2 + backdropNumber(sectorId, 0, 17) * 0.6);
  const glowY = viewport.height * (0.2 + backdropNumber(sectorId, 0, 31) * 0.6);
  const glowRadius = Math.max(viewport.width, viewport.height) * 0.7;
  const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowRadius);
  glow.addColorStop(0, backdrop.wash);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  ctx.fillStyle = backdrop.starColor;
  for (let index = 0; index < backdrop.starCount; index += 1) {
    const x = Math.floor(backdropNumber(sectorId, index, 101) * viewport.width);
    const y = Math.floor(backdropNumber(sectorId, index, 211) * viewport.height);
    const size = backdropNumber(sectorId, index, 307) > 0.88 ? 2 : 1;
    ctx.globalAlpha = 0.35 + backdropNumber(sectorId, index, 401) * 0.65;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;
}

function draw(seconds: number): void {
  drawBackdrop(currentSector);
  drawOrderFeedback(seconds);

  const sectorRocks = state.asteroids.filter((asteroid) => asteroid.sectorId === currentSector);
  const sectorShips = state.ships.filter((ship) => ship.sectorId === currentSector && ship.state !== "jumpingOut" && ship.state !== "jumpingHome");
  const gate = state.sectors[currentSector]!.gate;
  const legacyGateVisible = gate.to !== currentSector;
  const gateScreen = worldToScreen(camera, viewport, gate.position);
  if (legacyGateVisible) {
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(gateScreen.x - gate.size.width * camera.zoom / 2, gateScreen.y - gate.size.height * camera.zoom / 2, gate.size.width * camera.zoom, gate.size.height * camera.zoom);
  }
  for (const project of state.gateProjects) {
    const end = project.ends.find((candidate) => candidate.sectorId === currentSector);
    if (!end) continue;
    if (project.complete) fillWorldRect(end.position, { width: 24, height: 24 }, "#22d3ee");
    else strokeWorldRect(end.position, { width: 24, height: 24 }, "#22d3ee");
  }
  for (const asteroid of sectorRocks) {
    fillWorldRect(asteroid.position, asteroid.size, asteroidColor(asteroid.material, asteroid.rich));
  }
  for (const connector of currentSector === 0 ? stationConnectors(state.station.modules) : []) {
    drawStationConnector(connector.from, connector.to);
  }
  for (const module of currentSector === 0 ? state.station.modules : []) {
    drawStationModule(module);
  }
  if (currentSector === 0 && state.station.construction) {
    strokeWorldRect(state.station.construction.position, state.station.construction.size, "#cbd5e1");
  }
  for (const site of state.claimSites) {
    if (site.sectorId === currentSector) drawClaimSite(site);
  }

  for (const ship of sectorShips) {
    const beam = laserBeam(state, ship);
    if (beam) drawLaser(beam, seconds);
  }

  for (const ship of sectorShips) {
    drawShip(ship);
    if (selectedShips.includes(ship.id)) drawSelectionRing(ship.position, shipSize(ship.design));

    const gauge = cargoGauge(ship);
    if (gauge) drawGauge(ship.position, gauge, shipSize(ship.design));
  }
  renderShipPanel();
  renderStoragePanel(performance.now());
  renderPartTip();

  if (sectorNameEl) sectorNameEl.textContent = state.sectors[currentSector]!.name;
  const builtDestination = state.gateProjects.find((project) => project.complete && project.ends.some((end) => end.sectorId === currentSector))
    ?.ends.find((end) => end.sectorId !== currentSector)?.sectorId;
  const gateDestination = builtDestination ?? (legacyGateVisible ? gate.to : null);
  canvas.setAttribute("aria-label", mapOpen
    ? mapLayout(state, viewport).circles.map((circle) => `${circle.name}: ${circle.ships} ships${pendingGate ? `, ${circle.id === pendingGate.sectorId ? "current sector" : sectorInGateRange(pendingGate.sectorId, circle.id) ? "in gate range" : "out of gate range"}` : ""}`).join("; ")
    : `Sector ${state.sectors[currentSector]!.name}: ${sectorRocks.length} asteroids, ${currentSector === 0 ? "station present" : "no station"}${gateDestination === null ? "" : `, gate to ${state.sectors[gateDestination]!.name}`}`);
  // Re-checked every frame, so zooming under a still pointer updates it too,
  // and the box closes by itself when a hovered asteroid runs out.
  let hovered = mapOpen ? null : hoveredBody(state, camera, viewport, pointer, currentSector);
  if (hovered?.kind === "claimSite") stickySite = hovered.id;
  else if (infoHovered && stickySite !== null && !mapOpen) hovered = { kind: "claimSite", id: stickySite };
  else stickySite = null;
  // A + cell sits above the canvas, so a ship beside it would never hear the
  // click. While the pointer is on a ship, the cells let clicks through.
  buildControls.classList.toggle("over-ship", hovered?.kind === "ship");
  const info = infoBox(state, hovered);
  box.hidden = info === null;
  if (info === null) infoHovered = false;
  box.style.pointerEvents = info?.action ? "auto" : "none";
  infoAction.hidden = !info?.action;
  if (info?.action) { infoAction.textContent = info.action.label; infoAction.dataset.site = String(info.action.siteId); }
  const body = hovered && bodyOf(state, hovered);
  if (body && info) {
    const anchor = worldToScreen(camera, viewport, {
      x: body.position.x + body.size.width / 2,
      y: body.position.y - body.size.height / 2,
    });
    box.style.left = `${anchor.x + (info.action ? 0 : 8)}px`;
    box.style.top = `${anchor.y}px`;
    boxTitle.textContent = info.title;
    boxLine.textContent = info.line;
  }
  if (legacyGateVisible && pointer && Math.hypot(pointer.x - gateScreen.x, pointer.y - gateScreen.y) < Math.max(14, gate.size.width * camera.zoom / 2)) {
    const jumping = state.ships.some((ship) => ship.sectorId === currentSector && (ship.state === "jumpingOut" || ship.state === "jumpingHome"));
    box.hidden = false; boxTitle.textContent = "Gate"; boxLine.textContent = jumping ? "Jumping" : `Gate to ${state.sectors[gate.to]!.name}`;
    box.style.left = `${gateScreen.x + 16}px`; box.style.top = `${gateScreen.y}px`;
  }
  if (mapOpen) {
    // The map covers the sector, so only its circles have anything to show.
    const layout = mapLayout(state, viewport);
    const id = pointer ? mapHit(layout, pointer) : null;
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
  if (sitesKey !== renderedSites) {
    renderedSites = sitesKey;
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
  const control = buildControlSize(camera.zoom);
  buildControls.style.setProperty("--cell", `${control.cell}px`);
  buildControls.style.setProperty("--glyph", `${control.glyph}px`);
  for (const button of buildControls.querySelectorAll<HTMLButtonElement>("button[data-x]")) {
    const screen = worldToScreen(camera, viewport, {
      x: Number(button.dataset.x),
      y: Number(button.dataset.y),
    });
    button.style.left = `${screen.x - control.cell / 2}px`;
    button.style.top = `${screen.y - control.cell / 2}px`;
  }
  const inBuildArea = pointer !== null
    && pointerInBuildArea(state, screenToWorld(camera, viewport, pointer));
  buildControls.hidden = currentSector !== 0 || !buildControlsVisible(inBuildArea, controlsHovered);
  if (buildMenuOpen && selectedBuildSite) {
    const screen = worldToScreen(camera, viewport, selectedBuildSite);
    buildMenu.style.left = `${Math.round(screen.x + 20)}px`;
    buildMenu.style.top = `${Math.round(screen.y - 20)}px`;
  }
  if (shipMenuBuilder !== null) {
    drawPaintCanvas();
    const view = shipMenuView(state, shipMenuBuilder, draft);
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
      blueprintName.value.trim() === "" || designOf(draft).width === 0;
  }
  const menuItems = buildMenuItems(state);
  const menuKey = JSON.stringify(menuItems);
  if (menuKey !== renderedMenu) {
    renderedMenu = menuKey;
    buildMenu.replaceChildren(...menuItems.map((item) => {
      const button = document.createElement("button");
      button.dataset.module = item.type;
      button.disabled = item.disabled;
      const name = document.createElement("span");
      name.textContent = item.type;
      const cost = document.createElement("span");
      cost.textContent = item.cost;
      button.append(name, cost);
      return button;
    }));
  }

  claimButton.hidden = !mapOpen;
  hint.hidden = !pendingClaim;
  hint.textContent = mapOpen ? "Pick the sector for the claim station" : "Click a spot for the construction site. Esc cancels.";
  renameBox.hidden = renamingSector === null || !mapOpen;
  if (renameBox.hidden) renamingSector = null;

  if (mapOpen) {
    const layout = mapLayout(state, viewport);
    ctx.save(); ctx.fillStyle = "rgba(15,23,42,.94)"; ctx.fillRect(0, 0, viewport.width, viewport.height);
    ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 3;
    for (const link of layout.links) { ctx.beginPath(); ctx.moveTo(link.from.x, link.from.y); ctx.lineTo(link.to.x, link.to.y); ctx.stroke(); }
    for (const circle of layout.circles) {
      const available = !pendingGate || circle.id === pendingGate.sectorId || sectorInGateRange(pendingGate.sectorId, circle.id);
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
      if (renamingSector === circle.id) {
        renameBox.style.left = `${Math.round(circle.center.x - 60)}px`;
        renameBox.style.top = `${Math.round(circle.center.y - 22)}px`;
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

let lastTimeMs = performance.now();

function frame(nowMs: number): void {
  const dt = Math.max(0, (nowMs - lastTimeMs) / 1000);
  lastTimeMs = nowMs;
  const movement = keyPan(heldKeys, dt);
  if (movement.x || movement.y) camera = panBy(camera, movement.x, movement.y);
  // Paused frames skip the tick, so selecting, ordering and the menus keep
  // working on a state that simply does not advance.
  const seconds = gameSeconds(clock, dt);
  if (seconds > 0) state = tick(state, seconds);
  renderSpeedControls();
  draw(nowMs / 1000);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
