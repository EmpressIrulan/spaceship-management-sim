// Placeholder tuning, a quarter of the first cut's speed at the client's
// request. Distances are arbitrary until there are real sectors, so revisit
// both numbers together once routes cover more ground.
export const SHIP_CRUISE_SPEED = 25; // world units per second
export const SHIP_ACCELERATION = 10; // world units per second squared

// Ships speed up from rest, cruise, and slow to rest again. A hop too short to
// reach cruise speed turns around at the midpoint instead.
function profile(distance: number): { rampSeconds: number; rampDistance: number; peak: number } {
  const fullRamp = (SHIP_CRUISE_SPEED * SHIP_CRUISE_SPEED) / (2 * SHIP_ACCELERATION);
  if (distance >= 2 * fullRamp) {
    return {
      rampSeconds: SHIP_CRUISE_SPEED / SHIP_ACCELERATION,
      rampDistance: fullRamp,
      peak: SHIP_CRUISE_SPEED,
    };
  }
  const peak = Math.sqrt(SHIP_ACCELERATION * distance);
  return { rampSeconds: peak / SHIP_ACCELERATION, rampDistance: distance / 2, peak };
}

export function travelSeconds(distance: number): number {
  const { rampSeconds, rampDistance, peak } = profile(distance);
  return 2 * rampSeconds + (distance - 2 * rampDistance) / peak;
}

// Distance covered after `elapsed` seconds of a leg of the given length.
export function distanceAlong(distance: number, elapsed: number): number {
  const { rampSeconds, rampDistance, peak } = profile(distance);
  const total = travelSeconds(distance);
  const t = Math.min(Math.max(elapsed, 0), total);
  if (t < rampSeconds) {
    return 0.5 * SHIP_ACCELERATION * t * t;
  }
  if (t > total - rampSeconds) {
    const left = total - t;
    return distance - 0.5 * SHIP_ACCELERATION * left * left;
  }
  return rampDistance + peak * (t - rampSeconds);
}
