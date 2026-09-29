import {
  MAX_HULL,
  SHIP_MODULES,
  SHIP_SLOT_SIZE,
  availableModuleBuildSites,
  createInitialState,
  laserBeam,
  shipSize,
  startModuleBuild,
  startShipBuild,
  tick,
  type Beam,
  type ModuleType,
  type ShipDesign,
  type ShipModule,
  type Size,
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
import { cargoGauge, infoBox, type Gauge } from "./labels";
import { asteroidColor } from "./asteroid";
import { LASER_COLOR, flickerPixels, laserPulse } from "./laser";
import {
  buildControlSize,
  buildControlsVisible,
  buildMenuItems,
  dismissBuildMenuForClick,
  dismissBuildMenuForKey,
  pointerInBuildArea,
} from "./building";
import { shipBlocks, shipPanel, slotColor } from "./ships";
import {
  designOf,
  emptyDraft,
  paintSlot,
  resizeDraft,
  shipMenuView,
  withBrush,
  type ShipDraft,
} from "./shipyard";

const canvasEl = document.querySelector<HTMLCanvasElement>("#screen");
const boxEl = document.querySelector<HTMLElement>("#info");
const titleEl = document.querySelector<HTMLElement>("#info-title");
const lineEl = document.querySelector<HTMLElement>("#info-line");
const buildControlsEl = document.querySelector<HTMLElement>("#build-controls");
const buildMenuEl = document.querySelector<HTMLElement>("#build-menu");
const shipMenuEl = document.querySelector<HTMLElement>("#ship-menu");
const shipPanelEl = document.querySelector<HTMLElement>("#ship-panel");
if (!canvasEl || !boxEl || !titleEl || !lineEl || !buildControlsEl || !buildMenuEl || !shipMenuEl || !shipPanelEl) {
  throw new Error("missing #screen canvas or #info box");
}
const shipMenu: HTMLElement = shipMenuEl;
const shipPanelBox: HTMLElement = shipPanelEl;
const canvas: HTMLCanvasElement = canvasEl;
const box: HTMLElement = boxEl;
const boxTitle: HTMLElement = titleEl;
const boxLine: HTMLElement = lineEl;
const buildControls: HTMLElement = buildControlsEl;
const buildMenu: HTMLElement = buildMenuEl;

const context = canvas.getContext("2d");
if (!context) {
  throw new Error("2d context unavailable");
}
const ctx: CanvasRenderingContext2D = context;

// ?seed=N replays a sector exactly; otherwise each load gets a fresh one.
const seedParam = new URLSearchParams(location.search).get("seed");
const seed = seedParam === null ? Date.now() % 2 ** 32 : Number(seedParam);

let state = createInitialState(seed);
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
let selectedShip: number | null = null;
let renderedPanel = "";

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

window.addEventListener("keydown", (event) => {
  if (buildMenuOpen && dismissBuildMenuForKey(event.key)) closeBuildMenu();
  if (shipMenuBuilder !== null && event.key === "Escape") closeShipMenu();
});

function button(text: string, data: Record<string, string>, pressed = false): HTMLButtonElement {
  const element = document.createElement("button");
  element.textContent = text;
  Object.assign(element.dataset, data);
  if (pressed) element.classList.add("pressed");
  return element;
}

function gridElement(design: ShipDesign, clickable: boolean): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "ship-grid";
  grid.style.gridTemplateColumns = `repeat(${design.width}, var(--slot))`;
  design.slots.forEach((slot, index) => {
    const cell = document.createElement(clickable ? "button" : "div");
    cell.className = "slot";
    cell.style.background = slotColor(slot);
    cell.dataset.slot = String(index);
    if (slot) cell.title = slot;
    grid.append(cell);
  });
  return grid;
}

// Rebuilt whenever the draft changes. The stats, cost and Build button are
// refreshed every frame in draw(), since Storage keeps changing underneath.
function renderShipMenu(): void {
  const title = document.createElement("h2");
  title.textContent = "Build ship";
  const sizes = document.createElement("div");
  sizes.className = "row";
  for (const [label, axis] of [["Width", "width"], ["Height", "height"]] as const) {
    const name = document.createElement("span");
    name.textContent = label;
    sizes.append(name);
    for (let n = 1; n <= MAX_HULL; n += 1) {
      sizes.append(button(String(n), { [axis]: String(n) }, draft[axis] === n));
    }
  }
  const brushes = document.createElement("div");
  brushes.className = "row";
  for (const module of [...SHIP_MODULES, null]) {
    const brush = button(module ?? "clear", { brush: module ?? "" }, draft.brush === module);
    if (module) brush.style.borderLeft = `6px solid ${slotColor(module)}`;
    brushes.append(brush);
  }
  const stats = document.createElement("div");
  stats.className = "stats";
  const cost = document.createElement("div");
  cost.className = "cost";
  const build = button("Build", { build: "" });
  build.className = "build";
  shipMenu.replaceChildren(title, sizes, brushes, gridElement(designOf(draft), true), stats, cost, build);
}

function openShipMenu(builder: number): void {
  shipMenuBuilder = builder;
  draft = emptyDraft();
  renderShipMenu();
  shipMenu.hidden = false;
}

function closeShipMenu(): void {
  shipMenuBuilder = null;
  shipMenu.hidden = true;
}

shipMenu.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!target || target.disabled || shipMenuBuilder === null) return;
  const data = target.dataset;
  if (data.width) draft = resizeDraft(draft, Number(data.width), draft.height);
  else if (data.height) draft = resizeDraft(draft, draft.width, Number(data.height));
  else if (data.brush !== undefined) draft = withBrush(draft, (data.brush || null) as ShipModule | null);
  else if (data.slot) draft = paintSlot(draft, Number(data.slot));
  else if (data.build !== undefined) {
    state = startShipBuild(state, shipMenuBuilder, designOf(draft));
    closeShipMenu();
    return;
  }
  renderShipMenu();
});

// A press that barely moves is a click; anything more is a pan.
const CLICK_SLOP_PX = 4;

function clickCanvas(point: Vec): void {
  const hovered = hoveredBody(state, camera, viewport, point);
  if (hovered?.kind === "ship") {
    selectedShip = state.ships[hovered.index]?.id ?? null;
    closeShipMenu();
    return;
  }
  selectedShip = null;
  const module = hovered?.kind === "module" ? state.station.modules[hovered.index] : undefined;
  if (hovered?.kind === "module" && module?.type === "Builder") {
    openShipMenu(hovered.index);
    return;
  }
  closeShipMenu();
}

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
let camera: Camera = fitCamera(viewport, [state.station.dock, state.station.storage, ...state.asteroids]);

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

let drag: { last: Vec; start: Vec } | null = null;

canvas.addEventListener("mousedown", (event) => {
  const point = mousePoint(event);
  drag = { last: point, start: point };
});

canvas.addEventListener("mousemove", (event) => {
  pointer = mousePoint(event);
});

canvas.addEventListener("mouseleave", () => {
  pointer = null;
});

window.addEventListener("mousemove", (event) => {
  if (!drag) return;
  const point = mousePoint(event);
  camera = panBy(camera, point.x - drag.last.x, point.y - drag.last.y);
  drag.last = point;
});

window.addEventListener("mouseup", (event) => {
  if (drag && event.target === canvas) {
    const point = mousePoint(event);
    if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) < CLICK_SLOP_PX) clickCanvas(point);
  }
  drag = null;
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

function moduleColor(type: ModuleType): string {
  if (type === "Dock") return "#64748b";
  if (type === "Storage") return "#475569";
  return "#7c3aed";
}

// Edges are rounded one by one so neighbouring blocks share a pixel edge
// with no gap between them at any zoom.
function drawShip(ship: Parameters<typeof shipBlocks>[0]): void {
  const half = SHIP_SLOT_SIZE / 2;
  for (const block of shipBlocks(ship)) {
    const a = worldToScreen(camera, viewport, { x: block.position.x - half, y: block.position.y - half });
    const b = worldToScreen(camera, viewport, { x: block.position.x + half, y: block.position.y + half });
    const x = Math.round(a.x);
    const y = Math.round(a.y);
    ctx.fillStyle = block.color;
    ctx.fillRect(x, y, Math.max(1, Math.round(b.x) - x), Math.max(1, Math.round(b.y) - y));
  }
}

function drawSelectionRing(center: Vec, size: Size): void {
  const screen = worldToScreen(camera, viewport, center);
  const radius = Math.hypot(size.width, size.height) / 2 * camera.zoom + 5;
  ctx.save();
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, radius, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function renderShipPanel(): void {
  const panel = selectedShip === null ? null : shipPanel(state, selectedShip);
  if (!panel) selectedShip = null;
  shipPanelBox.hidden = panel === null;
  const key = JSON.stringify(panel);
  if (!panel || key === renderedPanel) return;
  renderedPanel = key;
  const title = document.createElement("h2");
  title.textContent = `Ship ${panel.size}`;
  const rows = document.createElement("dl");
  for (const [label, value] of panel.rows) {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    detail.dataset.row = label;
    rows.append(term, detail);
  }
  shipPanelBox.replaceChildren(title, gridElement(panel.design, false), rows);
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

function draw(seconds: number): void {
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  for (const asteroid of state.asteroids) {
    fillWorldRect(asteroid.position, asteroid.size, asteroidColor(asteroid.material));
  }
  for (const module of state.station.modules) {
    fillWorldRect(module.position, module.size, moduleColor(module.type));
  }
  if (state.station.construction) {
    strokeWorldRect(state.station.construction.position, state.station.construction.size, "#cbd5e1");
  }

  for (const ship of state.ships) {
    const beam = laserBeam(state, ship);
    if (beam) drawLaser(beam, seconds);
  }

  for (const ship of state.ships) {
    drawShip(ship);
    if (ship.id === selectedShip) drawSelectionRing(ship.position, shipSize(ship.design));

    const gauge = cargoGauge(ship);
    if (gauge) drawGauge(ship.position, gauge, shipSize(ship.design));
  }
  renderShipPanel();

  // Re-checked every frame, so zooming under a still pointer updates it too,
  // and the box closes by itself when a hovered asteroid runs out.
  const hovered = hoveredBody(state, camera, viewport, pointer);
  const info = infoBox(state, hovered);
  box.hidden = info === null;
  const body = hovered && bodyOf(state, hovered);
  if (body && info) {
    const anchor = worldToScreen(camera, viewport, {
      x: body.position.x + body.size.width / 2,
      y: body.position.y - body.size.height / 2,
    });
    box.style.left = `${anchor.x + 8}px`;
    box.style.top = `${anchor.y}px`;
    boxTitle.textContent = info.title;
    boxLine.textContent = info.line;
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
  buildControls.hidden = !buildControlsVisible(inBuildArea, controlsHovered);
  if (buildMenuOpen && selectedBuildSite) {
    const screen = worldToScreen(camera, viewport, selectedBuildSite);
    buildMenu.style.left = `${Math.round(screen.x + 20)}px`;
    buildMenu.style.top = `${Math.round(screen.y - 20)}px`;
  }
  if (shipMenuBuilder !== null) {
    const builder = state.station.modules[shipMenuBuilder]!;
    const screen = worldToScreen(camera, viewport, builder.position);
    shipMenu.style.left = `${Math.round(screen.x + builder.size.width / 2 * camera.zoom + 12)}px`;
    shipMenu.style.top = `${Math.round(screen.y - 20)}px`;
    const view = shipMenuView(state, shipMenuBuilder, draft);
    const stats = shipMenu.querySelector<HTMLElement>(".stats")!;
    const text = `Speed ${view.stats.speed}\nHold ${view.stats.hold}\nMining time ${view.stats.miningTime}`;
    if (stats.textContent !== text) stats.textContent = text;
    const cost = shipMenu.querySelector<HTMLElement>(".cost")!;
    if (cost.textContent !== view.cost) cost.textContent = view.cost;
    shipMenu.querySelector<HTMLButtonElement>(".build")!.disabled = !view.canBuild;
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
}

let lastTimeMs = performance.now();

function frame(nowMs: number): void {
  const dt = Math.max(0, (nowMs - lastTimeMs) / 1000);
  lastTimeMs = nowMs;
  state = tick(state, dt);
  draw(nowMs / 1000);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
