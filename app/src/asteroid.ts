import type { Material } from "sim";

export function asteroidColor(material: Material): string {
  return material === "Metal" ? "#a16207" : "#bae6fd";
}
