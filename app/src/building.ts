import { MATERIALS, MODULE_COST, availableModuleBuilds, type ModuleType, type SimState } from "sim";

export interface BuildMenuItem {
  type: ModuleType;
  cost: string;
  disabled: boolean;
}

export function buildMenuItems(state: SimState): BuildMenuItem[] {
  const cost = MATERIALS.map((material) => `${MODULE_COST[material]} ${material}`).join(", ");
  return availableModuleBuilds(state).map((option) => ({
    type: option.type,
    cost,
    disabled: !option.enabled,
  }));
}

export function buildControlsVisible(stationHovered: boolean, controlsHovered: boolean): boolean {
  return stationHovered || controlsHovered;
}

export function dismissBuildMenuForClick(insideMenu: boolean, insideControls: boolean): boolean {
  return !insideMenu && !insideControls;
}

export function dismissBuildMenuForKey(key: string): boolean {
  return key === "Escape";
}
