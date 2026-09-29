import { createInitialState, type SimState } from "./state";
import type { ShipDesign } from "./ship";

// The ship before hulls had modules: the starting 2x2's size and speed with
// a single Storage, so a trip carries 10 and mines for 12 s. Tests of the
// mining cycle use it to keep their numbers in single loads.
export const ONE_STORAGE: ShipDesign = { width: 2, height: 2, slots: ["Engine", "Laser", "Storage", null] };

export function oneStorageStart(seed: number): SimState {
  const state = createInitialState(seed);
  return { ...state, ships: state.ships.map((ship) => ({ ...ship, design: ONE_STORAGE })) };
}
