import { createInitialState, type SimState } from "./state";
import type { ShipDesign } from "./ship";

// The starting ship's size and speed with half the Storage swapped for Hull,
// so a trip carries 10 and mines for 12 s. Tests of the mining cycle use it to
// keep their numbers in single loads.
export const ONE_STORAGE: ShipDesign = {
  width: 4,
  height: 4,
  slots: [
    "Engine", "Engine", "Laser", "Laser",
    "Engine", "Engine", "Laser", "Laser",
    "Storage", "Storage", "Hull", "Hull",
    "Storage", "Storage", "Hull", "Hull",
  ],
};

export function oneStorageStart(seed: number): SimState {
  const state = createInitialState(seed);
  return { ...state, ships: state.ships.map((ship) => ({ ...ship, design: ONE_STORAGE })) };
}
