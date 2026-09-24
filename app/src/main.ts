import { SHIP_SIZE, createInitialState, tick, type Size, type Vec } from "sim";
import {
  fitCamera,
  hoveringStation,
  panBy,
  wheelZoomFactor,
  worldToScreen,
  zoomAt,
  type Camera,
  type Viewport,
} from "./camera";
import { cargoGauge, type Gauge } from "./labels";


const canvasEl = document.querySelector<HTMLCanvasElement>("#screen");
const menuEl = document.querySelector<HTMLElement>("#inventory");
const storedEl = document.querySelector<HTMLElement>("#inventory-stored");
if (!canvasEl || !menuEl || !storedEl) {
  throw new Error("missing #screen canvas or #inventory menu");
}
const canvas: HTMLCanvasElement = canvasEl;
const menu: HTMLElement = menuEl;
const stored: HTMLElement = storedEl;

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

let camera: Camera = fitCamera(viewport, [state.station, state.asteroid]);

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

function draw(): void {
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  fillWorldRect(state.asteroid.position, state.asteroid.size, "#a16207");
  fillWorldRect(state.station.position, state.station.size, "#64748b");

  for (const ship of state.ships) {
    fillWorldRect(ship.position, SHIP_SIZE, ship.cargo > 0 ? "#fde047" : "#4ade80");

    const gauge = cargoGauge(ship);
    if (gauge) drawGauge(ship.position, gauge);
  }

  // Re-checked every frame, so zooming under a still pointer updates it too.
  const menuOpen = hoveringStation(state, camera, viewport, pointer);
  menu.hidden = !menuOpen;
  if (menuOpen) {
    const station = state.station;
    const anchor = worldToScreen(camera, viewport, {
      x: station.position.x + station.size.width / 2,
      y: station.position.y - station.size.height / 2,
    });
    menu.style.left = `${anchor.x + 8}px`;
    menu.style.top = `${anchor.y}px`;
    stored.textContent = String(station.inventory);
  }
}

let lastTimeMs = performance.now();

function frame(nowMs: number): void {
  const dt = Math.max(0, (nowMs - lastTimeMs) / 1000);
  lastTimeMs = nowMs;
  state = tick(state, dt);
  draw();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
