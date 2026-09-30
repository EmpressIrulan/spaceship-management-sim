import {
  MATERIALS,
  availableShipBuild,
  pixelCount,
  shipBuildCost,
  shipBuildSeconds,
  shipStats,
  type ShipDesign,
  type ShipModule,
  type SimState,
  type Vec,
} from "sim";
import { screenToWorld, zoomAt, type Camera, type Viewport, type ZoomLimits } from "./camera";

export const BRUSH_SIZES = [1, 3, 5] as const;
export type BrushSize = (typeof BRUSH_SIZES)[number];
export type Tool = "paint" | "erase" | "fill";

// The ship being painted in the Build ship menu. The canvas has no edge, so
// pixels live in a sparse map keyed "x,y" rather than in a grid. The map is
// mutated in place by applyTool, since copying a capital ship's worth of
// pixels on every mouse move would make painting lag; the other functions
// return a new draft that shares the same map.
export interface ShipDraft {
  cells: Map<string, ShipModule>;
  module: ShipModule;
  tool: Tool;
  size: BrushSize;
}

// The menu opens empty every time until savable blueprints (#30) exist.
export function emptyDraft(): ShipDraft {
  return { cells: new Map(), module: "Engine", tool: "paint", size: 1 };
}

export function shouldDismissShipMenuOnMouseDown(menuOpen: boolean, insideMenu: boolean): boolean {
  return menuOpen && !insideMenu;
}

export function withModule(draft: ShipDraft, module: ShipModule): ShipDraft {
  return { ...draft, module };
}

export function withTool(draft: ShipDraft, tool: Tool): ShipDraft {
  return { ...draft, tool };
}

export function withSize(draft: ShipDraft, size: BrushSize): ShipDraft {
  return { ...draft, size };
}

const key = (x: number, y: number): string => `${x},${y}`;

function parse(cell: string): Vec {
  const [x, y] = cell.split(",").map(Number);
  return { x: x!, y: y! };
}

function stamp(draft: ShipDraft, centre: Vec): void {
  const reach = Math.floor(draft.size / 2);
  for (let y = centre.y - reach; y <= centre.y + reach; y += 1) {
    for (let x = centre.x - reach; x <= centre.x + reach; x += 1) {
      if (draft.tool === "erase") draft.cells.delete(key(x, y));
      else draft.cells.set(key(x, y), draft.module);
    }
  }
}

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

// Recolours the 4-connected region under `at` that holds the same module (or
// the same emptiness). Empty canvas is infinite, so an empty region is only
// filled when it is closed off. Whether it is shows up as the search
// reaching a ring one pixel outside the ship's bounding box.
function fill(draft: ShipDraft, at: Vec): void {
  const target = draft.cells.get(key(at.x, at.y)) ?? null;
  if (target === draft.module) return;
  const bounds = boundsOf(draft);
  const inside = (x: number, y: number) =>
    bounds !== null && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  if (target === null && !inside(at.x, at.y)) return;
  const region: Vec[] = [];
  const seen = new Set([key(at.x, at.y)]);
  const queue = [at];
  for (let next = queue.pop(); next; next = queue.pop()) {
    region.push(next);
    for (const [dx, dy] of NEIGHBOURS) {
      const x = next.x + dx;
      const y = next.y + dy;
      if (seen.has(key(x, y)) || (draft.cells.get(key(x, y)) ?? null) !== target) continue;
      if (target === null && !inside(x, y)) return;
      seen.add(key(x, y));
      queue.push({ x, y });
    }
  }
  for (const cell of region) draft.cells.set(key(cell.x, cell.y), draft.module);
}

// Bumped on every edit, so designOf can hand back the same design until the
// pixels change. The menu asks for it every frame.
const edits = new WeakMap<ShipDraft["cells"], number>();
const built = new WeakMap<ShipDraft["cells"], { edit: number; placed: PlacedDesign }>();

// Every pixel on the straight line between two pixels, both ends included, so
// a fast drag paints a line instead of dots.
export function lineCells(from: Vec, to: Vec): Vec[] {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  const cells: Vec[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = steps === 0 ? 0 : step / steps;
    cells.push({ x: Math.round(from.x + (to.x - from.x) * t), y: Math.round(from.y + (to.y - from.y) * t) });
  }
  return cells;
}

// One click or drag step at a canvas pixel.
export function applyTool(draft: ShipDraft, at: Vec): void {
  if (draft.tool === "fill") fill(draft, at);
  else stamp(draft, at);
  edits.set(draft.cells, (edits.get(draft.cells) ?? 0) + 1);
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function boundsOf(draft: ShipDraft): Bounds | null {
  if (draft.cells.size === 0) return null;
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const cell of draft.cells.keys()) {
    const { x, y } = parse(cell);
    bounds.left = Math.min(bounds.left, x);
    bounds.right = Math.max(bounds.right, x);
    bounds.top = Math.min(bounds.top, y);
    bounds.bottom = Math.max(bounds.bottom, y);
  }
  return bounds;
}

// The design plus the canvas pixel its top left slot sits on, for drawing it
// where it was painted.
export interface PlacedDesign {
  design: ShipDesign;
  origin: Vec;
}

export function placedDesign(draft: ShipDraft): PlacedDesign {
  const edit = edits.get(draft.cells) ?? 0;
  const cached = built.get(draft.cells);
  if (cached?.edit === edit) return cached.placed;
  const placed = placeCells(draft);
  built.set(draft.cells, { edit, placed });
  return placed;
}

// The painted pixels trimmed to their bounding box, which is the ship.
export function designOf(draft: ShipDraft): ShipDesign {
  return placedDesign(draft).design;
}

function placeCells(draft: ShipDraft): PlacedDesign {
  const bounds = boundsOf(draft);
  if (!bounds) return { design: { width: 0, height: 0, slots: [] }, origin: { x: 0, y: 0 } };
  const width = bounds.right - bounds.left + 1;
  const height = bounds.bottom - bounds.top + 1;
  const slots: ShipDesign["slots"] = Array(width * height).fill(null);
  for (const [cell, module] of draft.cells) {
    const { x, y } = parse(cell);
    slots[(y - bounds.top) * width + (x - bounds.left)] = module;
  }
  return { design: { width, height, slots }, origin: { x: bounds.left, y: bounds.top } };
}

// Screen pixels per canvas pixel. Wide limits, since one ship may be a few
// pixels or a few hundred across.
const PAINT_ZOOM: ZoomLimits = { min: 0.25, max: 64 };

export function emptyView(): Camera {
  return { center: { x: 0.5, y: 0.5 }, zoom: 16 };
}

export function zoomView(view: Camera, viewport: Viewport, cursor: Vec, factor: number): Camera {
  return zoomAt(view, viewport, cursor, factor, PAINT_ZOOM);
}

// The canvas pixel under a screen point.
export function cellAt(view: Camera, viewport: Viewport, screen: Vec): Vec {
  const world = screenToWorld(view, viewport, screen);
  return { x: Math.floor(world.x), y: Math.floor(world.y) };
}

const EMPTY_SLOT = "Empty slot";

// The part on a pixel of the paint grid. Every canvas pixel has a name, since
// the canvas has no edge and a square with nothing painted is an empty slot.
export function draftPartAt(draft: ShipDraft, cell: Vec): string {
  return draft.cells.get(key(cell.x, cell.y)) ?? EMPTY_SLOT;
}

// The part under a point on a drawn design, given as how far across the
// picture it sits, 0 to 1 on each axis, so any thumbnail size works. Null off
// the picture.
export function designPartAt(design: ShipDesign, fraction: Vec): string | null {
  const x = Math.floor(fraction.x * design.width);
  const y = Math.floor(fraction.y * design.height);
  if (x < 0 || y < 0 || x >= design.width || y >= design.height) return null;
  return design.slots[y * design.width + x] ?? EMPTY_SLOT;
}

// Whole seconds under a minute, then minutes with any seconds left over.
export function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole} s`;
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

export interface StatsView {
  speed: string;
  hold: string;
  miningTime: string;
}

export function statsView(design: ShipDesign): StatsView {
  const stats = shipStats(design);
  return {
    speed: String(Math.round(stats.speed)),
    hold: String(stats.hold),
    miningTime: stats.miningSeconds === null ? "no laser" : formatDuration(stats.miningSeconds),
  };
}

export interface ShipMenuView {
  stats: StatsView;
  pixels: string;
  buildTime: string;
  cost: string;
  canBuild: boolean;
}

export function shipMenuView(state: SimState, builder: number, draft: ShipDraft): ShipMenuView {
  const design = designOf(draft);
  const cost = shipBuildCost(design);
  return {
    stats: statsView(design),
    pixels: String(pixelCount(design)),
    buildTime: formatDuration(shipBuildSeconds(design)),
    cost: MATERIALS.map((material) => `${cost[material]} ${material}`).join(" "),
    canBuild: availableShipBuild(state, builder, design),
  };
}
