import { giveDockOrderWithFeedback, hangarCapacity, type SimState } from "sim";
import type { Hovered } from "./camera";

export function dockAtHoveredCarrier(state: SimState, selectedShips: number[], hovered: Hovered | null): { state: SimState; refused: string[] } | null {
  if (hovered?.kind !== "ship") return null;
  const carrier = state.ships[hovered.index];
  if (!carrier || selectedShips.includes(carrier.id) || hangarCapacity(carrier.design) === 0) return null;
  const result = giveDockOrderWithFeedback(state, selectedShips, carrier.id);
  return result.state === state && result.refused.length === 0 ? null : result;
}
