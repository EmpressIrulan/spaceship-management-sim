import { MODULE_SPACING, type ModuleType, type StationModule, type Vec } from "sim";

export type ModuleSilhouette = "open-bay" | "tank-cluster" | "crane" | "beacon";

export interface ModuleAppearance {
  accent: string;
  silhouette: ModuleSilhouette;
}

const APPEARANCE: Record<ModuleType, ModuleAppearance> = {
  Dock: { accent: "#38bdf8", silhouette: "open-bay" },
  Storage: { accent: "#f59e0b", silhouette: "tank-cluster" },
  Builder: { accent: "#a78bfa", silhouette: "crane" },
  Claim: { accent: "#f43f5e", silhouette: "beacon" },
};

export function moduleAppearance(type: ModuleType): ModuleAppearance {
  return APPEARANCE[type];
}

export interface StationConnector {
  from: Vec;
  to: Vec;
}

export function stationConnectors(modules: StationModule[]): StationConnector[] {
  const connectors: StationConnector[] = [];
  for (let left = 0; left < modules.length; left += 1) {
    for (let right = left + 1; right < modules.length; right += 1) {
      const from = modules[left]!.position;
      const to = modules[right]!.position;
      const dx = Math.abs(from.x - to.x);
      const dy = Math.abs(from.y - to.y);
      if ((dx === MODULE_SPACING && dy === 0) || (dy === MODULE_SPACING && dx === 0)) {
        connectors.push({ from, to });
      }
    }
  }
  return connectors;
}
