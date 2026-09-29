import { CARGO_PER_TRIP, MATERIALS, UNLOADING_SECONDS, WORKING_SECONDS, type Ship, type SimState } from "sim";
import type { Hovered } from "./camera";

export interface Gauge {
  // 0 to 1. Follows the timer so the bar moves smoothly between whole units.
  fill: number;
  text: string;
}

// An empty ship heading out or waiting at the station has nothing worth
// reading, so it gets no gauge.
export function cargoGauge(ship: Ship): Gauge | null {
  const text = `${ship.cargo}/${CARGO_PER_TRIP}`;
  switch (ship.state) {
    case "idle":
    case "outbound":
      return null;
    case "waiting":
      return { fill: ship.cargo / CARGO_PER_TRIP, text };
    case "working":
      return { fill: 1 - ship.timer / WORKING_SECONDS, text };
    case "homebound":
      return { fill: 1, text };
    case "unloading":
      return { fill: ship.timer / UNLOADING_SECONDS, text };
  }
}

export interface InfoBox {
  title: string;
  line: string;
}

// Null closes the box, including when the hovered asteroid has just gone.
export function infoBox(state: SimState, hovered: Hovered | null): InfoBox | null {
  if (!hovered) return null;
  if (hovered.kind === "dock") {
    const unloading = state.ships.filter((ship) => ship.state === "unloading").length;
    return {
      title: "Dock",
      line: `Unloading ${unloading} / ${state.station.dock.capacity}`,
    };
  }
  if (hovered.kind === "storage") {
    const stored = MATERIALS.reduce((total, material) => total + state.station.inventory[material], 0);
    const lines = MATERIALS.filter((material) => state.station.inventory[material] > 0)
      .map((material) => `${material}: ${state.station.inventory[material]}`);
    return {
      title: "Storage",
      line: [`Stored ${stored} / ${state.station.storage.capacity}`, ...lines].join("\n"),
    };
  }
  if (hovered.kind === "ship") {
    const ship = state.ships[hovered.index];
    if (!ship) return null;
    return ship.state === "waiting" ? { title: "Ship", line: "Waiting: storage full" } : null;
  }
  const asteroid = state.asteroids.find((a) => a.id === hovered.id);
  return asteroid ? { title: "Asteroid", line: `${asteroid.material}: ${asteroid.ore}` } : null;
}
