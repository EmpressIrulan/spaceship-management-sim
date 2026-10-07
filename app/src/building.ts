import {
  MATERIALS, MODULE_SPACING,
  MODULE_COST,
  availableModuleBuildSites,
  availableModuleBuilds,
  queuedDependents,
  type ModuleType,
  type QueuedModuleBuild,
  type SimState,
  type Vec,
} from "sim";
import { homeStation } from "sim";

export interface BuildMenuItem {
  type: ModuleType;
  cost: string;
  disabled: boolean;
  // Hover text for a greyed-out option: what the construction site lacks.
  title: string;
}

// The + menu reads its stock from the station it grows, so every question is
// about that one station.
export function buildMenuItems(state: SimState, stationId: number): BuildMenuItem[] {
  const cost = MATERIALS.map((material) => `${MODULE_COST[material]} ${material}`).join(", ");
  return availableModuleBuilds(state, stationId).map((option) => {
    const short = MATERIALS.filter((material) => option.missing[material] > 0)
      .map((material) => `${option.missing[material]} more ${material}`);
    const title = short.length > 0 ? `Needs ${short.join(" and ")}` : "";
    return { type: option.type, cost, disabled: false, title };
  });
}

export function buildControlsVisible(stationHovered: boolean, controlsHovered: boolean): boolean {
  return stationHovered || controlsHovered;
}

// Whichever station's build area the pointer is over: its modules, its builds
// and the + sites round them. Null when none is near, so each station's
// controls only show around it.
export function buildAreaStation(state: SimState, world: Vec): number | null {
  const inBuildArea = (stationId: number): boolean => {
    const station = stationId === 0 ? homeStation(state) : state.stations.find((candidate) => candidate.id === stationId)!;
    const slots = [
      ...station.modules.map((module) => module.position),
      ...(station.construction ? [station.construction.position] : []),
      ...station.buildQueue.map((queued) => queued.position),
      ...availableModuleBuildSites(state, stationId),
    ];
    const half = MODULE_SPACING / 2;
    return slots.some((slot) => Math.abs(world.x - slot.x) <= half && Math.abs(world.y - slot.y) <= half);
  };
  // Home first, so an overlapping pair of build areas favours the starting
  // station.
  const ordered = [homeStation(state), ...state.stations.slice(1)];
  for (const station of ordered) {
    if (inBuildArea(station.id)) return station.id;
  }
  return null;
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

export function queuedBuildIndexAt(state: SimState, position: Vec, stationId = 0): number {
  return (stationById(state, stationId)?.buildQueue ?? []).findIndex((queued) => queued.position.x === position.x && queued.position.y === position.y);
}

// Every other ghost that would go with the one whose Cancel the pointer is on.
// It reads the same dependents query the cancel uses, so what the highlight
// promises is exactly what the click removes. The hovered ghost is named by
// position, not by index, because the queue shifts as builds finish underneath
// a pointer that has not moved. Null, or a ghost no longer waiting, highlights
// nothing.
export function cancelDependentsAt(state: SimState, hovered: Vec | { position: Vec; stationId: number } | null): QueuedModuleBuild[] {
  if (hovered === null) return [];
  const position = "position" in hovered ? hovered.position : hovered;
  const stationId = "position" in hovered ? hovered.stationId : 0;
  const station = stationById(state, stationId);
  const index = queuedBuildIndexAt(state, position, stationId);
  return index < 0 || !station ? [] : queuedDependents(station, index);
}
import { stationById } from "sim";
