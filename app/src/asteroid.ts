import type { Material } from "sim";

// Rich rocks are the same hue, lighter, so they stand out from plain ones.
export function asteroidColor(material: Material, rich = false): string {
  if (rich) return material === "Metal" ? "#fde047" : "#f0f9ff";
  return material === "Metal" ? "#a16207" : "#bae6fd";
}
