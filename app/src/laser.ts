import type { Vec } from "sim";

// Placeholder look, to react to at the demo.
export const LASER_COLOR = "#ef4444";
const PULSES_PER_SECOND = 2;
const FLICKER_FRAMES_PER_SECOND = 20;
const FLICKER_RADIUS = 3;

// Beam strength from 0.4 to 1, used for its opacity and width.
export function laserPulse(seconds: number): number {
  return 0.7 + 0.3 * Math.sin(seconds * PULSES_PER_SECOND * 2 * Math.PI);
}

// Integer hash, so the flicker changes every frame step without a random
// source and plays the same way for the same clock.
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// Two to five pixels scattered within a few pixels of the impact point.
export function flickerPixels(impact: Vec, seconds: number): Vec[] {
  const frame = Math.floor(seconds * FLICKER_FRAMES_PER_SECOND);
  const span = 2 * FLICKER_RADIUS + 1;
  const count = 2 + (hash(frame) % 4);
  const pixels: Vec[] = [];
  for (let i = 0; i < count; i += 1) {
    const h = hash(frame * 8 + i + 1);
    pixels.push({
      x: impact.x + (h % span) - FLICKER_RADIUS,
      y: impact.y + ((h >>> 8) % span) - FLICKER_RADIUS,
    });
  }
  return pixels;
}
