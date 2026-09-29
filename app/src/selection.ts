import { type DefaultBehaviour, type OrderTarget, type Ship, type SimState, type Vec } from "sim";
import { screenToWorld, type Camera, type Hovered, type Viewport } from "./camera";

// Screen pixels the pointer may wander during a click before it counts as a
// box drag.
const DRAG_THRESHOLD_PX = 4;
// Screen pixels per second, so panning feels the same at any zoom.
const KEY_PAN_SPEED_PX = 500;
export const ORDER_LINE_SECONDS = 1;

export function isBoxDrag(start: Vec, end: Vec): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) > DRAG_THRESHOLD_PX;
}

// Indices of the ships whose centres are inside the box between two screen points.
export function shipsInBox(state: SimState, camera: Camera, viewport: Viewport, a: Vec, b: Vec): number[] {
  const p = screenToWorld(camera, viewport, a);
  const q = screenToWorld(camera, viewport, b);
  const left = Math.min(p.x, q.x);
  const right = Math.max(p.x, q.x);
  const top = Math.min(p.y, q.y);
  const bottom = Math.max(p.y, q.y);
  const picked: number[] = [];
  state.ships.forEach((ship, index) => {
    const { x, y } = ship.position;
    if (x >= left && x <= right && y >= top && y <= bottom) picked.push(index);
  });
  return picked;
}

export function toggleShip(selection: number[], index: number): number[] {
  return selection.includes(index)
    ? selection.filter((i) => i !== index)
    : [...selection, index].sort((a, b) => a - b);
}

// What a right-click on `hovered`, at world point `world`, orders.
export function orderTargetAt(state: SimState, hovered: Hovered | null, world: Vec): OrderTarget {
  if (hovered?.kind === "asteroid") return { kind: "mine", asteroidId: hovered.id };
  if (hovered?.kind === "dock") return { kind: "home" };
  if (hovered?.kind === "module" && state.station.modules[hovered.index]?.type === "Dock") {
    return { kind: "home" };
  }
  return { kind: "move", point: { ...world } };
}

// The screen drag that WASD and the arrow keys stand for, to pass to panBy.
// Holding D moves the view right, which drags the map left.
export function keyPan(keys: ReadonlySet<string>, seconds: number): { dx: number; dy: number } {
  const held = (...names: string[]) => names.some((name) => keys.has(name) || keys.has(name.toUpperCase()));
  const step = KEY_PAN_SPEED_PX * seconds;
  let dx = 0;
  let dy = 0;
  if (held("a", "ArrowLeft")) dx += step;
  if (held("d", "ArrowRight")) dx -= step;
  if (held("w", "ArrowUp")) dy += step;
  if (held("s", "ArrowDown")) dy -= step;
  return { dx, dy };
}

export function orderLineAlpha(elapsedSeconds: number): number {
  return Math.max(0, 1 - elapsedSeconds / ORDER_LINE_SECONDS);
}

function shipStatus(ship: Ship): string {
  if (ship.order) {
    const order = `Order: ${ship.order.kind}`;
    return ship.state === "holding" ? `${order}, holding` : order;
  }
  switch (ship.state) {
    case "idle":
      return "Idle: no ore";
    case "outbound":
      return "Flying out";
    case "working":
      return `Mining ${ship.cargoMaterial ?? ""}`.trim();
    case "homebound":
      return "Heading home";
    case "unloading":
      return "Unloading";
    case "waiting":
      return "Waiting: storage full";
    case "moving":
      return "Moving";
    case "holding":
      return "Holding";
  }
}

export interface SelectionPanel {
  rows: { index: number; name: string; status: string }[];
  // "mixed" when the selected ships do not all share one default.
  defaultBehaviour: DefaultBehaviour | "mixed";
  canResume: boolean;
}

export function selectionPanel(state: SimState, selection: number[]): SelectionPanel | null {
  const ships = selection.flatMap((index) => {
    const ship = state.ships[index];
    return ship ? [{ index, ship }] : [];
  });
  if (ships.length === 0) return null;
  const defaults = new Set(ships.map(({ ship }) => ship.defaultBehaviour));
  return {
    rows: ships.map(({ index, ship }) => ({ index, name: `Ship ${index + 1}`, status: shipStatus(ship) })),
    defaultBehaviour: defaults.size === 1 ? ships[0]!.ship.defaultBehaviour : "mixed",
    canResume: ships.some(({ ship }) => ship.order !== null),
  };
}
