// Placeholder tuning, a quarter of the first cut's speed at the client's
// request. Distances are arbitrary until there are real sectors, so revisit
// both numbers together once routes cover more ground.
export const SHIP_CRUISE_SPEED = 25; // world units per second
export const SHIP_ACCELERATION = 10; // world units per second squared

// Ships speed up from rest, cruise, and slow to rest again. A hop too short to
// reach cruise speed turns around at the midpoint instead. `factor` scales
// cruise speed and acceleration together, from the ship's engines.
function profile(
  distance: number,
  factor: number,
): { rampSeconds: number; rampDistance: number; peak: number; acceleration: number } {
  const cruise = SHIP_CRUISE_SPEED * factor;
  const acceleration = SHIP_ACCELERATION * factor;
  const fullRamp = (cruise * cruise) / (2 * acceleration);
  if (distance >= 2 * fullRamp) {
    return { rampSeconds: cruise / acceleration, rampDistance: fullRamp, peak: cruise, acceleration };
  }
  const peak = Math.sqrt(acceleration * distance);
  return { rampSeconds: peak / acceleration, rampDistance: distance / 2, peak, acceleration };
}

export function travelSeconds(distance: number, factor = 1): number {
  if (distance <= 0) return 0;
  const { rampSeconds, rampDistance, peak } = profile(distance, factor);
  return 2 * rampSeconds + (distance - 2 * rampDistance) / peak;
}

// Distance covered after `elapsed` seconds of a leg of the given length.
export function distanceAlong(distance: number, elapsed: number, factor = 1): number {
  const { rampSeconds, rampDistance, peak, acceleration } = profile(distance, factor);
  const total = travelSeconds(distance, factor);
  const t = Math.min(Math.max(elapsed, 0), total);
  if (t < rampSeconds) {
    return 0.5 * acceleration * t * t;
  }
  if (t > total - rampSeconds) {
    const left = total - t;
    return distance - 0.5 * acceleration * left * left;
  }
  return rampDistance + peak * (t - rampSeconds);
}
