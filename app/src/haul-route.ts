import { configureHaul, type HaulRoute, type HaulStationId, type Material, type SimState } from "sim";

export type HaulRouteFieldChange =
  | { field: "from" | "to"; value: HaulStationId }
  | { field: "material"; value: Material };

export function applyHaulRouteFieldChange(
  state: SimState,
  selectedShipIds: number[],
  change: HaulRouteFieldChange,
): SimState {
  return applyHaulRouteFieldChangeWithFeedback(state, selectedShipIds, change).state;
}

export function applyHaulRouteFieldChangeWithFeedback(
  state: SimState,
  selectedShipIds: number[],
  change: HaulRouteFieldChange,
): { state: SimState; skipped: string[] } {
  let nextState = state;
  const skipped: string[] = [];
  for (const shipId of selectedShipIds) {
    const ship = nextState.ships.find((candidate) => candidate.id === shipId);
    if (!ship || ship.defaultBehaviour !== "haul" || !ship.haulRoute) continue;
    const route: HaulRoute = {
      from: change.field === "from" ? change.value : ship.haulRoute.from,
      to: change.field === "to" ? change.value : ship.haulRoute.to,
      material: change.field === "material" ? change.value : ship.haulRoute.material,
    };
    const updated = configureHaul(nextState, [shipId], route);
    if (updated === nextState) {
      const reason = route.from === route.to ? "From and To must be different" : "route is not available";
      skipped.push(`Ship ${shipId + 1}: ${reason}`);
    } else nextState = updated;
  }
  return { state: nextState, skipped };
}
