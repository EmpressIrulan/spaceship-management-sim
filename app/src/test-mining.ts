import { createInitialState, MATERIALS, setMineMaterial, tick, type SimState } from "sim";

// The game starts its ship with nothing ticked, so it sits idle. Tests that
// need a ship already flying out to a rock tick every material first.
export function miningStart(seed: number): SimState {
  const ticked = MATERIALS.reduce((state, material) => setMineMaterial(state, [0], material, true), createInitialState(seed));
  return tick(ticked, 0);
}
