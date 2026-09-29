import { SHIP_SIZE, createInitialState, laserBeam, startModuleBuild, tick, type Beam, type ModuleType, type Size, type Vec } from "sim";
import {
  bodyOf,
  fitCamera,
  hoveredBody,
  panBy,
  wheelZoomFactor,
  worldToScreen,
  zoomAt,
  type Camera,
  type Viewport,
} from "./camera";
import { cargoGauge, infoBox, type Gauge } from "./labels";
import { asteroidColor } from "./asteroid";
import { LASER_COLOR, flickerPixels, laserPulse } from "./laser";
import { buildMenuItems } from "./building";

const canvasEl = document.querySelector<HTMLCanvasElement>("#screen");
const boxEl = document.querySelector<HTMLElement>("#info");
const titleEl = document.querySelector<HTMLElement>("#info-title");
const lineEl = document.querySelector<HTMLElement>("#info-line");
const buildControlEl = document.querySelector<HTMLElement>("#build-control");
const buildToggleEl = document.querySelector<HTMLButtonElement>("#build-toggle");
const buildMenuEl = document.querySelector<HTMLElement>("#build-menu");
if (!canvasEl || !boxEl || !titleEl || !lineEl || !buildControlEl || !buildToggleEl || !buildMenuEl) {
  throw new Error("missing #screen canvas or #info box");
}
const canvas: HTMLCanvasElement = canvasEl;
const box: HTMLElement = boxEl;
const boxTitle: HTMLElement = titleEl;
const boxLine: HTMLElement = lineEl;
const buildControl: HTMLElement = buildControlEl;
const buildToggle: HTMLButtonElement = buildToggleEl;
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

buildToggle.addEventListener("click", () => {
  buildMenuOpen = !buildMenuOpen;
  buildMenu.hidden = !buildMenuOpen;
});

buildMenu.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-module]");
  if (!button || button.disabled) return;
  state = startModuleBuild(state, button.dataset.module as ModuleType);
  buildMenuOpen = false;
  buildMenu.hidden = true;
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

let drag: { last: Vec } | null = null;

canvas.addEventListener("mousedown", (event) => {
  drag = { last: mousePoint(event) };
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

window.addEventListener("mouseup", () => {
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
    fillWorldRect(ship.position, SHIP_SIZE, ship.cargo > 0 ? "#fde047" : "#4ade80");

    const gauge = cargoGauge(ship);
    if (gauge) drawGauge(ship.position, gauge);
  }

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

  const stationEdge = state.station.construction?.position
    ?? state.station.modules[state.station.modules.length - 1]!.position;
  const controlPoint = worldToScreen(camera, viewport, { x: stationEdge.x + 24, y: stationEdge.y });
  buildControl.style.left = `${Math.round(controlPoint.x)}px`;
  buildControl.style.top = `${Math.round(controlPoint.y - 14)}px`;
  const menuItems = buildMenuItems(state);
  const menuKey = JSON.stringify(menuItems);
  if (menuKey === renderedMenu) return;
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

let lastTimeMs = performance.now();

function frame(nowMs: number): void {
  const dt = Math.max(0, (nowMs - lastTimeMs) / 1000);
  lastTimeMs = nowMs;
  state = tick(state, dt);
  draw(nowMs / 1000);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
