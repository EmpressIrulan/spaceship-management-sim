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
  if (hovered.kind === "construction") {
    const construction = state.station.construction;
    return construction
      ? { title: `Building ${construction.type}`, line: `${Math.ceil(construction.timer)} s` }
      : null;
  }
  if (hovered.kind === "module") {
    const module = state.station.modules[hovered.index];
    if (!module) return null;
    if (module.type === "Builder") return { title: "Builder", line: "Idle" };
    if (module.type === "Dock") {
      const unloading = state.ships.filter((ship) => ship.state === "unloading").length;
      return { title: "Dock", line: `Unloading ${unloading} / ${state.station.dock.capacity}` };
    }
    const stored = MATERIALS.reduce((total, material) => total + state.station.inventory[material], 0);
    return { title: "Storage", line: `Stored ${stored} / ${state.station.storage.capacity}` };
  }
  if (hovered.kind === "ship") {
    const ship = state.ships[hovered.index];
    if (!ship) return null;
    if (ship.state === "waiting") return { title: "Ship", line: "Waiting: storage full" };
    if (ship.state === "working" && ship.cargoMaterial) {
      return { title: "Ship", line: `Mining ${ship.cargoMaterial}` };
    }
    return null;
  }
  const asteroid = state.asteroids.find((a) => a.id === hovered.id);
  return asteroid ? { title: "Asteroid", line: `${asteroid.material}: ${asteroid.ore}` } : null;
}
