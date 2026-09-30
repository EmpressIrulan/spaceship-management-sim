import { MATERIALS, shipStats, unloadingSeconds, type Ship, type SimState } from "sim";
import type { Hovered } from "./camera";
import { shipStatus } from "./ships";
import { formatDuration } from "./shipyard";

export interface Gauge {
  // 0 to 1. Follows the timer so the bar moves smoothly between whole units.
  fill: number;
  text: string;
}

// An empty ship heading out or waiting at the station has nothing worth
// reading, so it gets no gauge.
export function cargoGauge(ship: Ship): Gauge | null {
  const { hold, miningSeconds } = shipStats(ship.design);
  const text = `${ship.cargo}/${hold}`;
  switch (ship.state) {
    case "idle":
    case "outbound":
    case "moving":
    case "holding":
    case "jumpingOut":
    case "jumpingHome":
      return null;
    case "waiting":
      return { fill: ship.cargo / hold, text };
    case "working":
      return { fill: miningSeconds ? 1 - ship.timer / miningSeconds : 0, text };
    case "homebound":
      return { fill: 1, text };
    case "unloading":
      return { fill: ship.timer / unloadingSeconds(ship.design), text };
  }
}

export interface InfoBox {
  title: string;
  line: string;
}

// Every Storage module shares one inventory, so each shows the same box.
function storageBox(state: SimState): InfoBox {
  const stored = MATERIALS.reduce((total, material) => total + state.station.inventory[material], 0);
  const lines = MATERIALS.filter((material) => state.station.inventory[material] > 0)
    .map((material) => `${material}: ${state.station.inventory[material]}`);
  return {
    title: "Storage",
    line: [`Stored ${stored} / ${state.station.storage.capacity}`, ...lines].join("\n"),
  };
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
  if (hovered.kind === "storage") return storageBox(state);
  if (hovered.kind === "construction") {
    const construction = state.station.construction;
    return construction
      ? { title: `Building ${construction.type}`, line: `${Math.ceil(construction.timer)} s` }
      : null;
  }
  if (hovered.kind === "module") {
    const module = state.station.modules[hovered.index];
    if (!module) return null;
    if (module.type === "Builder") {
      const job = state.station.shipBuilds.find((candidate) => candidate.builder === hovered.index);
      if (!job) return { title: "Builder", line: "Idle" };
      const size = `${job.design.width}x${job.design.height}`;
      return { title: "Builder", line: `Building ${size}: ${formatDuration(Math.ceil(job.timer))}` };
    }
    if (module.type === "Dock") {
      const unloading = state.ships.filter((ship) => ship.state === "unloading").length;
      return { title: "Dock", line: `Unloading ${unloading} / ${state.station.dock.capacity}` };
    }
    return storageBox(state);
  }
  if (hovered.kind === "ship") {
    const ship = state.ships[hovered.index];
    return ship ? { title: "Ship", line: shipStatus(state, ship) } : null;
  }
  const asteroid = state.asteroids.find((a) => a.id === hovered.id);
  return asteroid ? { title: "Asteroid", line: `${asteroid.material}: ${asteroid.ore}` } : null;
}
