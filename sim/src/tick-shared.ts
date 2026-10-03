import { MATERIALS, arrived, cargoByMaterial, toBerth, toParking, type BerthLayout, type Ship, type Vec } from "./state";
import { supplyQueueStatus } from "./station-build-queue";
import type { Draft } from "./tick-mining";

export function storageRemaining(draft: Draft): number {
  const stored = Object.values(draft.inventory).reduce((total, amount) => total + amount, 0);
  return Math.max(0, draft.storageCapacity - stored);
}

export function layoutOf(draft: Draft): BerthLayout {
  return { dock: draft.dock, modules: draft.modules, capacity: draft.dockCapacity };
}

// Puts a ship home with cargo on a free pad, or parks it to wait for one.
export function berth(draft: Draft, ship: Ship): Ship {
  return toBerth(layoutOf(draft), draft.ships, ship) ?? toParking(layoutOf(draft), draft.ships, ship);
}

// A supply ship that flew out to a parking spot to wait for a build arrives
// holding, not waiting: holding is the state that watches the build queue, and a
// ship on a parking spot is not waiting for a pad.
export function arrivesAtPark(draft: Draft, ship: Ship): Ship | null {
  if (ship.berth !== null || supplyQueueStatus(ship, draft.buildQueue.length) !== "waiting") return null;
  return { ...arrived(ship), state: "holding" };
}

export function withCargo(ship: Ship, cargo: Record<"Metal" | "Ice", number>): Ship {
  const total = cargo.Metal + cargo.Ice;
  const active = ship.cargoMaterial && cargo[ship.cargoMaterial] > 0 ? ship.cargoMaterial
    : MATERIALS.find((material) => cargo[material] > 0) ?? null;
  return { ...ship, cargo: total, cargoByMaterial: cargo, cargoMaterial: active };
}

export function transferCargo(
  ship: Ship,
  units: number,
  transfer: (material: "Metal" | "Ice", amount: number) => number,
): Ship {
  const cargo = cargoByMaterial(ship);
  let left = units;
  for (const material of MATERIALS) {
    const moved = transfer(material, Math.min(left, cargo[material]));
    cargo[material] -= moved;
    left -= moved;
  }
  return withCargo(ship, cargo);
}

export function addCargo(ship: Ship, material: "Metal" | "Ice" | null, amount: number): Ship {
  if (!material || amount <= 0) return ship;
  const cargo = cargoByMaterial(ship);
  cargo[material] += amount;
  return { ...withCargo(ship, cargo), cargoMaterial: ship.cargoMaterial ?? material };
}
