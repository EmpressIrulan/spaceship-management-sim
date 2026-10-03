import { configureHaul, type HaulRoute, type HaulStationId, type Material, type SimState } from "sim";

export type HaulRouteFieldChange =
  | { field: "from" | "to"; value: HaulStationId }
  | { field: "material"; value: Material };

export function applyHaulRouteFieldChange(
  state: SimState,
  selectedShipIds: number[],
  change: HaulRouteFieldChange,
): SimState {
  let nextState = state;
  for (const shipId of selectedShipIds) {
    const ship = nextState.ships.find((s) => s.id === shipId);
    if (!ship || ship.defaultBehaviour !== "haul" || !ship.haulRoute) continue;
    const currentRoute = ship.haulRoute;
    const mergedRoute: HaulRoute = {
      from: change.field === "from" ? change.value : currentRoute.from,
      to: change.field === "to" ? change.value : currentRoute.to,
      material: change.field === "material" ? change.value : currentRoute.material,
    };
    nextState = configureHaul(nextState, [shipId], mergedRoute);
  }
  return nextState;
}
