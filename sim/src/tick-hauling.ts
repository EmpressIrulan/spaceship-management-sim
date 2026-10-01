import { haulCargoDestination, haulStationDetails } from "./haul";
import { type HaulStationId, type Ship } from "./state";
import { cargoTransferSeconds, shipStats, speedFactor } from "./ship";
import type { Draft } from "./tick-mining";
import { addCargo, berth, layoutOf, storageRemaining, transferCargo, withCargo } from "./tick-shared";

export function haulStored(end: NonNullable<ReturnType<typeof haulStationDetails>>): number {
  return end.inventory.Metal + end.inventory.Ice;
}

export function changeHaulInventory(draft: Draft, id: HaulStationId, material: "Metal" | "Ice", amount: number): void {
  if (id === "home") {
    draft.inventory = { ...draft.inventory, [material]: draft.inventory[material] + amount };
    return;
  }
  const siteId = Number(id.slice("claim:".length));
  draft.claimSites = draft.claimSites.map((site) => site.id === siteId
    ? { ...site, delivered: { ...site.delivered, [material]: site.delivered[material] + amount } } : site);
}

export function loadHauler(draft: Draft, ship: Ship, units: number): number {
  const route = ship.haulRoute;
  const source = route ? haulStationDetails(draft, route.from) : null;
  if (!route || !source || units <= 0) return 0;
  const taken = Math.min(units, source.inventory[route.material]);
  changeHaulInventory(draft, route.from, route.material, -taken);
  return taken;
}

export function unloadHauler(draft: Draft, ship: Ship, units: number): Ship {
  const destinationId = haulCargoDestination(ship);
  const destination = destinationId ? haulStationDetails(draft, destinationId) : null;
  if (!destinationId || !destination || units <= 0) return ship;
  let room = Math.max(0, destination.capacity - haulStored(destination));
  return transferCargo(ship, units, (material, amount) => {
    const accepted = Math.min(amount, room);
    changeHaulInventory(draft, destinationId, material, accepted);
    room -= accepted;
    return accepted;
  });
}

export function startHaulTransfer(draft: Draft, ship: Ship, stationId: HaulStationId, loading: boolean): Ship {
  const amount = loading ? shipStats(ship.design).hold : ship.cargo;
  const planned = { ...ship, cargoMaterial: loading ? ship.haulRoute?.material ?? null : ship.cargoMaterial,
    transfer: { startingCargo: loading ? 0 : ship.cargo, amount } };
  if (stationId === "home") return berth(draft, planned);
  return { ...planned, state: loading ? "haulLoading" : "haulUnloading", berth: null, leg: null,
    timer: cargoTransferSeconds(amount) };
}

export function beginHaulLoading(draft: Draft, ship: Ship): Ship {
  const route = ship.haulRoute;
  const source = route ? haulStationDetails(draft, route.from) : null;
  const destination = route ? haulStationDetails(draft, route.to) : null;
  if (!route || !source || !destination) return { ...ship, state: "holding", timer: 0, leg: null };
  if (haulStored(destination) >= destination.capacity) return { ...ship, state: "haulWaitingFull", timer: 0, leg: null, cargoMaterial: null };
  if (source.inventory[route.material] < shipStats(ship.design).hold) return { ...ship, state: "haulWaitingSource", timer: 0, leg: null, cargoMaterial: null };
  return startHaulTransfer(draft, ship, route.from, true);
}

export function beginHaulUnloading(draft: Draft, ship: Ship): Ship {
  const destinationId = haulCargoDestination(ship);
  const destination = destinationId ? haulStationDetails(draft, destinationId) : null;
  return !destinationId || !destination || haulStored(destination) >= destination.capacity
    ? { ...ship, state: "haulWaitingFull", timer: 0, leg: null }
    : startHaulTransfer(draft, ship, destinationId, false);
}
