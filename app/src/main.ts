import { createInitialState, tick } from "sim";

const canvasEl = document.querySelector<HTMLCanvasElement>("#screen");
if (!canvasEl) {
  throw new Error("missing #screen canvas");
}
const canvas: HTMLCanvasElement = canvasEl;

const context = canvas.getContext("2d");
if (!context) {
  throw new Error("2d context unavailable");
}
const ctx: CanvasRenderingContext2D = context;
ctx.imageSmoothingEnabled = false;

let state = createInitialState();
let lastTimeMs = performance.now();

function frame(nowMs: number): void {
  const dt = (nowMs - lastTimeMs) / 1000;
  lastTimeMs = nowMs;
  state = tick(state, dt);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Placeholder sprite: a crisp, unscaled block standing in for pixel art to come.
  ctx.fillStyle = "#4ade80";
  ctx.fillRect(16, 16, 16, 16);

  ctx.fillStyle = "#e5e7eb";
  ctx.font = "16px monospace";
  ctx.fillText(`tick ${state.tickCount}`, 48, 29);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
