import { giveDockOrder, hangarCapacity, type SimState } from "sim";
import type { Hovered } from "./camera";

export function dockAtHoveredCarrier(state: SimState, selectedShips: number[], hovered: Hovered | null): SimState | null {
  if (hovered?.kind !== "ship") return null;
  const carrier = state.ships[hovered.index];
  if (!carrier || selectedShips.includes(carrier.id) || hangarCapacity(carrier.design) === 0) return null;
  const next = giveDockOrder(state, selectedShips, carrier.id);
  return next === state ? null : next;
}
