export type Speed = 1 | 2 | 4;

// `speed` is kept while paused, so unpausing goes back to it.
export interface Clock {
  speed: Speed;
  paused: boolean;
}

export const INITIAL_CLOCK: Clock = { speed: 1, paused: false };

const SPEED_KEYS: Record<string, Speed> = { "1": 1, "2": 2, "3": 4 };

export function gameSeconds(clock: Clock, realSeconds: number): number {
  return clock.paused ? 0 : realSeconds * clock.speed;
}

// Picking a speed while paused also unpauses. Auto-repeat from a held key is
// ignored, or holding Space would flip pause on and off.
export function clockAfterKey(clock: Clock, key: string, repeat = false): Clock {
  if (repeat) return clock;
  if (key === " ") return { ...clock, paused: !clock.paused };
  const speed = SPEED_KEYS[key];
  return speed === undefined ? clock : { speed, paused: false };
}

export type SpeedButtonId = "pause" | "1" | "2" | "4";

export function speedButtons(clock: Clock): { id: SpeedButtonId; label: string; active: boolean }[] {
  return [
    { id: "pause", label: "Pause", active: clock.paused },
    ...([1, 2, 4] as const).map((speed) => ({ id: String(speed) as SpeedButtonId, label: `${speed}x`, active: !clock.paused && clock.speed === speed })),
  ];
}

export function clockAfterButton(clock: Clock, id: SpeedButtonId): Clock {
  return id === "pause" ? { ...clock, paused: !clock.paused } : { speed: Number(id) as Speed, paused: false };
}
