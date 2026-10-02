import {
  MATERIALS,
  MODULE_COST,
  MODULE_SPACING,
  availableModuleBuildSites,
  availableModuleBuilds,
  type ModuleType,
  type SimState,
  type Vec,
} from "sim";

export interface BuildMenuItem {
  type: ModuleType;
  cost: string;
  disabled: boolean;
  // Hover text for a greyed-out option: what the construction site lacks.
  title: string;
}

export function buildMenuItems(state: SimState): BuildMenuItem[] {
  const cost = MATERIALS.map((material) => `${MODULE_COST[material]} ${material}`).join(", ");
  return availableModuleBuilds(state).map((option) => {
    const short = MATERIALS.filter((material) => option.missing[material] > 0)
      .map((material) => `${option.missing[material]} more ${material}`);
    const title = short.length > 0 ? `Needs ${short.join(" and ")}` : "";
    return { type: option.type, cost, disabled: false, title };
  });
}

export function buildControlsVisible(stationHovered: boolean, controlsHovered: boolean): boolean {
  return stationHovered || controlsHovered;
}

// Every module, the construction and every empty site owns one slot-sized
// square. The squares tile, so the pointer can cross from a module to a +
// without leaving them at any zoom.
export function pointerInBuildArea(state: SimState, world: Vec): boolean {
  const slots = [
    ...state.station.modules.map((module) => module.position),
    ...(state.station.construction ? [state.station.construction.position] : []),
    ...state.station.buildQueue.map((queued) => queued.position),
    ...availableModuleBuildSites(state),
  ];
  const half = MODULE_SPACING / 2;
  return slots.some((slot) => Math.abs(world.x - slot.x) <= half && Math.abs(world.y - slot.y) <= half);
}

// Screen pixels for a + control: the clickable cell fills its slot, and the
// drawn glyph is capped so it stays a button rather than a tile when zoomed in.
const GLYPH_MAX = 26;

export function buildControlSize(zoom: number): { cell: number; glyph: number } {
  const cell = MODULE_SPACING * zoom;
  return { cell, glyph: Math.min(GLYPH_MAX, Math.round(cell * 0.65)) };
}

export function dismissBuildMenuForClick(insideMenu: boolean, insideControls: boolean): boolean {
  return !insideMenu && !insideControls;
}

export function dismissBuildMenuForKey(key: string): boolean {
  return key === "Escape";
}

export function queuedBuildIndexAt(state: SimState, position: Vec): number {
  return state.station.buildQueue.findIndex((queued) => queued.position.x === position.x && queued.position.y === position.y);
}
