import { homeCamera, panBy, wheelZoomFactor, zoomAt } from "./camera";
import type { SimState, Vec } from "sim";
import type { UiState } from "./ui-state";
import type { Camera } from "./camera";

let cameraFlight = 0;

export function flyCameraTo(ui: UiState, target: Camera): void {
  const start = ui.camera;
  const startedAt = performance.now();
  const flight = ++cameraFlight;
  const animate = (now: number): void => {
    if (flight !== cameraFlight) return;
    const progress = Math.min(1, (now - startedAt) / 450);
    const eased = 1 - (1 - progress) ** 3;
    ui.camera = {
      center: {
        x: start.center.x + (target.center.x - start.center.x) * eased,
        y: start.center.y + (target.center.y - start.center.y) * eased,
      },
      zoom: start.zoom + (target.zoom - start.zoom) * eased,
    };
    if (progress < 1) requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

export function pointerAfterCanvasLeave(pointer: Vec | null, buildControls: Pick<HTMLElement, "contains">, relatedTarget: EventTarget | null): Vec | null {
  return relatedTarget !== null && buildControls.contains(relatedTarget as Node) ? pointer : null;
}

export function installCameraInput(ui: UiState, getState: () => SimState, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, mousePoint: (event: MouseEvent) => Vec, buildControls: HTMLElement): void {
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
  ui.camera = homeCamera([homeStation(getState()).dock, homeStation(getState()).storage, ...homeStation(getState()).modules]);

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    ui.camera = zoomAt(ui.camera, ui.viewport, mousePoint(event), wheelZoomFactor(event.deltaY));
  }, { passive: false });
  canvas.addEventListener("mousedown", (event) => {
    const point = mousePoint(event);
    if (event.button === 1) { event.preventDefault(); ui.pan = { last: point }; }
    else if (event.button === 0) ui.dragBox = { start: point, end: point, additive: event.shiftKey };
  });
  canvas.addEventListener("mousemove", (event) => { ui.pointer = mousePoint(event); });
  canvas.addEventListener("mouseleave", (event) => {
    ui.pointer = pointerAfterCanvasLeave(ui.pointer, buildControls, event.relatedTarget);
  });
  window.addEventListener("mousemove", (event) => {
    const point = mousePoint(event);
    if (ui.pan) { ui.camera = panBy(ui.camera, point.x - ui.pan.last.x, point.y - ui.pan.last.y); ui.pan.last = point; }
    if (ui.dragBox) ui.dragBox.end = point;
  });
}
import { homeStation } from "sim";
