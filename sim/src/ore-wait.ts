import type { Material, Ship, SimState } from "./model";
import { homeStation, nearestMineableRock } from "./state";
import { supplyQueueLength, supplyQueueStatus } from "./station-build-queue";

// The ticked materials a miner or supplier sitting idle at the Dock is waiting
// on because none of them has ore left it can reach, e.g. ["Ice"] for
// "Waiting: no Ice". Empty when the ship is not waiting for ore: busy, on an
// order, with nothing ticked, or a supplier whose site has nothing queued.
export function waitingForOre(state: SimState, ship: Ship): Material[] {
  if (ship.state !== "idle" || ship.order || ship.mineMaterials.length === 0) return [];
  const supplying = supplyQueueStatus(ship, supplyQueueLength(state)) === "supplying";
  if (ship.defaultBehaviour !== "mine" && !supplying) return [];
  if (ship.sectorId !== homeStation(state).sectorId) return [];
  return nearestMineableRock(ship, state.asteroids, state.sectors, state.gateProjects) ? [] : [...ship.mineMaterials];
}
