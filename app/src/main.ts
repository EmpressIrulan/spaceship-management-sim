import {
  SHIP_SIZE,
  availableModuleBuildSites,
  createInitialState,
  giveOrder,
  laserBeam,
  resumeDefault,
  setDefaultBehaviour,
  startModuleBuild,
  tick,
  type Beam,
  type DefaultBehaviour,
  type ModuleType,
  type OrderTarget,
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
import {
  isBoxDrag,
  keyPan,
  orderLineAlpha,
  orderTargetAt,
  selectionPanel,
  shipsInBox,
  toggleShip,
} from "./selection";

const canvasEl = document.querySelector<HTMLCanvasElement>("#screen");
const boxEl = document.querySelector<HTMLElement>("#info");
const titleEl = document.querySelector<HTMLElement>("#info-title");
const lineEl = document.querySelector<HTMLElement>("#info-line");
const buildControlsEl = document.querySelector<HTMLElement>("#build-controls");
const buildMenuEl = document.querySelector<HTMLElement>("#build-menu");
const shipPanelEl = document.querySelector<HTMLElement>("#ship-panel");
if (!canvasEl || !boxEl || !titleEl || !lineEl || !buildControlsEl || !buildMenuEl || !shipPanelEl) {
  throw new Error("missing #screen canvas or #info box");
}
const shipPanel: HTMLElement = shipPanelEl;
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
const params = new URLSearchParams(location.search);
const seedParam = params.get("seed");
const seed = seedParam === null ? Date.now() % 2 ** 32 : Number(seedParam);

let state = createInitialState(seed);
// ?ships=N starts with N copies of the first ship, for trying orders on a
// fleet until ships can be built at the Builder (#14).
const shipCount = Math.min(20, Math.max(1, Math.floor(Number(params.get("ships") ?? 1)) || 1));
state = { ...state, ships: Array.from({ length: shipCount }, () => state.ships[0]!) };
let viewport: Viewport = { width: 0, height: 0 };
// Last pointer position over the canvas, or null once it has left.
let pointer: Vec | null = null;
let buildMenuOpen = false;
let renderedMenu = "";
let renderedSites = "";
let controlsHovered = false;
let selectedBuildSite: Vec | null = null;

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

// Keys held for panning. A focused dropdown keeps its own arrow keys.
const heldKeys = new Set<string>();
window.addEventListener("keydown", (event) => {
  if (buildMenuOpen && dismissBuildMenuForKey(event.key)) closeBuildMenu();
  if (event.target instanceof HTMLSelectElement) return;
  heldKeys.add(event.key);
  if (event.key.startsWith("Arrow")) event.preventDefault();
});
window.addEventListener("keyup", (event) => {
  heldKeys.delete(event.key);
  heldKeys.delete(event.key.toLowerCase());
  heldKeys.delete(event.key.toUpperCase());
});
window.addEventListener("blur", () => heldKeys.clear());

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

let selection: number[] = [];
// Middle-drag pans. Left-drag draws a selection box from `start`.
let pan: { last: Vec } | null = null;
let dragBox: { start: Vec; end: Vec; additive: boolean } | null = null;
// Lines from each ordered ship to its target, faded out after a second.
let orderLines: { from: Vec[]; to: Vec; startSeconds: number } | null = null;

canvas.addEventListener("mousedown", (event) => {
  const point = mousePoint(event);
  if (event.button === 1) {
    // Stops the browser's middle-click autoscroll.
    event.preventDefault();
    pan = { last: point };
  } else if (event.button === 0) {
    dragBox = { start: point, end: point, additive: event.shiftKey };
  }
});

canvas.addEventListener("mousemove", (event) => {
  pointer = mousePoint(event);
});

canvas.addEventListener("mouseleave", () => {
  pointer = null;
});

window.addEventListener("mousemove", (event) => {
  const point = mousePoint(event);
  if (pan) {
    camera = panBy(camera, point.x - pan.last.x, point.y - pan.last.y);
    pan.last = point;
  }
  if (dragBox) dragBox.end = point;
});

window.addEventListener("mouseup", (event) => {
  if (event.button === 1) pan = null;
  if (event.button !== 0 || !dragBox) return;
  const { start, end, additive } = dragBox;
  dragBox = null;
  if (isBoxDrag(start, end)) {
    const picked = shipsInBox(state, camera, viewport, start, end);
    selection = additive ? [...new Set([...selection, ...picked])].sort((a, b) => a - b) : picked;
    return;
  }
  const hovered = hoveredBody(state, camera, viewport, end);
  if (hovered?.kind === "ship") {
    selection = additive ? toggleShip(selection, hovered.index) : [hovered.index];
  } else if (!additive) {
    selection = [];
  }
});

function orderPoint(target: OrderTarget): Vec {
  if (target.kind === "move") return target.point;
  if (target.kind === "home") return state.station.dock.position;
  return state.asteroids.find((a) => a.id === target.asteroidId)?.position ?? state.station.dock.position;
}

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (selection.length === 0) return;
  const point = mousePoint(event);
  const hovered = hoveredBody(state, camera, viewport, point);
  const target = orderTargetAt(state, hovered, screenToWorld(camera, viewport, point));
  orderLines = {
    from: selection.map((index) => ({ ...state.ships[index]!.position })),
    to: orderPoint(target),
    startSeconds: performance.now() / 1000,
  };
  state = giveOrder(state, selection, target);
});

shipPanel.addEventListener("change", (event) => {
  const select = event.target as HTMLSelectElement;
  if (select.name !== "default") return;
  state = setDefaultBehaviour(state, selection, select.value as DefaultBehaviour);
});
shipPanel.addEventListener("click", (event) => {
  if ((event.target as HTMLElement).closest("button[data-resume]")) state = resumeDefault(state, selection);
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

// Screen-space so the numbers stay readable at any zoom.
const GAUGE = { width: 36, height: 12, gap: 4 };

function drawGauge(shipPosition: Vec, gauge: Gauge): void {
  const top = worldToScreen(camera, viewport, {
    x: shipPosition.x,
    y: shipPosition.y - SHIP_SIZE.height / 2,
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

const SELECTED_COLOR = "#22c55e";

function drawSelectionRing(position: Vec): void {
  const center = worldToScreen(camera, viewport, position);
  // Clears the hull at any zoom, and stays visible as a ring when zoomed out.
  const radius = Math.max(8, (SHIP_SIZE.width / 2) * camera.zoom + 4);
  ctx.save();
  ctx.strokeStyle = SELECTED_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawSelectionBox(): void {
  if (!dragBox || !isBoxDrag(dragBox.start, dragBox.end)) return;
  ctx.save();
  ctx.strokeStyle = SELECTED_COLOR;
  ctx.fillStyle = "rgba(34, 197, 94, 0.12)";
  ctx.lineWidth = 1;
  const x = Math.min(dragBox.start.x, dragBox.end.x);
  const y = Math.min(dragBox.start.y, dragBox.end.y);
  const w = Math.abs(dragBox.end.x - dragBox.start.x);
  const h = Math.abs(dragBox.end.y - dragBox.start.y);
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.restore();
}

function drawOrderLines(seconds: number): void {
  if (!orderLines) return;
  const alpha = orderLineAlpha(seconds - orderLines.startSeconds);
  if (alpha <= 0) {
    orderLines = null;
    return;
  }
  const to = worldToScreen(camera, viewport, orderLines.to);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = SELECTED_COLOR;
  ctx.lineWidth = 1.5;
  for (const fromWorld of orderLines.from) {
    const from = worldToScreen(camera, viewport, fromWorld);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

let renderedPanel = "";

function renderShipPanel(): void {
  const panel = selectionPanel(state, selection);
  const key = JSON.stringify(panel);
  if (key === renderedPanel) return;
  renderedPanel = key;
  shipPanel.hidden = panel === null;
  if (!panel) {
    shipPanel.replaceChildren();
    return;
  }
  const title = document.createElement("h2");
  title.textContent = panel.rows.length === 1 ? "Selected: 1 ship" : `Selected: ${panel.rows.length} ships`;
  const list = document.createElement("ul");
  list.append(...panel.rows.map((row) => {
    const item = document.createElement("li");
    item.dataset.ship = String(row.index);
    const name = document.createElement("span");
    name.textContent = row.name;
    const status = document.createElement("span");
    status.textContent = row.status;
    item.append(name, status);
    return item;
  }));
  const select = document.createElement("select");
  select.name = "default";
  const options: [string, string][] = [["mine", "Default: Mine for Station"], ["none", "Default: None"]];
  if (panel.defaultBehaviour === "mixed") options.unshift(["mixed", "Default: Mixed"]);
  select.append(...options.map(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.disabled = value === "mixed";
    return option;
  }));
  select.value = panel.defaultBehaviour;
  const resume = document.createElement("button");
  resume.dataset.resume = "";
  resume.textContent = "Resume";
  resume.disabled = !panel.canResume;
  shipPanel.replaceChildren(title, list, select, resume);
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

  drawOrderLines(seconds);

  for (const ship of state.ships) {
    fillWorldRect(ship.position, SHIP_SIZE, ship.cargo > 0 ? "#fde047" : "#4ade80");

    const gauge = cargoGauge(ship);
    if (gauge) drawGauge(ship.position, gauge);
  }
  for (const index of selection) {
    const ship = state.ships[index];
    if (ship) drawSelectionRing(ship.position);
  }
  drawSelectionBox();
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
  const keys = keyPan(heldKeys, dt);
  if (keys.dx !== 0 || keys.dy !== 0) camera = panBy(camera, keys.dx, keys.dy);
  state = tick(state, dt);
  draw(nowMs / 1000);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
