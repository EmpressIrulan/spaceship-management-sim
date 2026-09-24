// Placeholder durations only, to exist for tick to drive. Not balanced, not final.
export const OUTBOUND_SECONDS = 3;
export const WORKING_SECONDS = 2;
export const HOMEBOUND_SECONDS = 3;

export type ShipState = "outbound" | "working" | "homebound";

export interface Ship {
  state: ShipState;
  timer: number;
}

export interface SimState {
  tickCount: number;
  ships: Ship[];
}

export function createInitialState(): SimState {
  return {
    tickCount: 0,
    ships: [{ state: "outbound", timer: OUTBOUND_SECONDS }],
  };
}
