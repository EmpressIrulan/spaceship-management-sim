import { footprintsTouch, type ModuleType, type StationModule, type Vec } from "sim";

export type ModuleSilhouette = "open-bay" | "tank-cluster" | "crane" | "beacon" | "turret";

export interface ModuleAppearance {
  accent: string;
  silhouette: ModuleSilhouette;
}

const APPEARANCE: Record<ModuleType, ModuleAppearance> = {
  Dock: { accent: "#38bdf8", silhouette: "open-bay" },
  Storage: { accent: "#f59e0b", silhouette: "tank-cluster" },
  Builder: { accent: "#a78bfa", silhouette: "crane" },
  Turret: { accent: "#22d3ee", silhouette: "turret" },
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
      if (footprintsTouch(modules[left]!, modules[right]!)) {
        connectors.push({ from, to });
      }
    }
  }
  return connectors;
}
