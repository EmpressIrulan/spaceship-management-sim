// Seeded PRNG so a run can be replayed exactly. Never use Math.random in sim/.
export type Prng = () => number;

// One mulberry32 step. The state is a plain number so it can live inside
// SimState and keep `tick` free of hidden mutable state.
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

export function createPrng(seed: number): Prng {
  let state = seed >>> 0;
  return () => {
    const step = nextRandom(state);
    state = step.state;
    return step.value;
  };
}
