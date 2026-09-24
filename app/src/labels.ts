import { CARGO_PER_TRIP, UNLOADING_SECONDS, WORKING_SECONDS, type Ship } from "sim";

export interface Gauge {
  // 0 to 1. Follows the timer so the bar moves smoothly between whole units.
  fill: number;
  text: string;
}

// An empty ship heading out has nothing worth reading, so it gets no gauge.
export function cargoGauge(ship: Ship): Gauge | null {
  const text = `${ship.cargo}/${CARGO_PER_TRIP}`;
  switch (ship.state) {
    case "outbound":
      return null;
    case "working":
      return { fill: 1 - ship.timer / WORKING_SECONDS, text };
    case "homebound":
      return { fill: 1, text };
    case "unloading":
      return { fill: ship.timer / UNLOADING_SECONDS, text };
  }
}
