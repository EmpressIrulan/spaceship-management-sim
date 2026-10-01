import { nextRandom } from "./prng";
import type { AsteroidField, Density, Vec } from "./model";

// Keeps asteroids from landing on top of each other, or a respawn from landing
// where the last one ran out. About three asteroid widths.
export const ASTEROID_MIN_SPACING = 40;
// Rocks in the same belt or cluster may sit closer than that, or a belt would
// have no room to fill a gap once one rock is mined out.
export const ROCK_SPACING = 25;

export const FIELD_LAYOUT = ["belt", "cluster", "belt", "cluster"] as const;
export const BELT_ROCKS = 5;
export const CLUSTER_ROCKS = 4;
// A sparse sector has fewer rocks in every field than a dense one.
export const SPARSE_BELT_ROCKS = 3;
export const SPARSE_CLUSTER_ROCKS = 3;
export const BELT_RADIUS = 100;
export const BELT_SWEEP = 1.8;
export const BELT_WIDTH = 24;
export const CLUSTER_RADIUS = 55;
// How far from the sector's origin a field's point can be. Not tied to the
// station, which only happens to sit at the origin of the home sector.
export const FIELD_MIN_REACH = 180;
export const FIELD_MAX_REACH = 340;
export const FIELD_SEPARATION = 240;
export const FIELD_GATE_CLEARANCE = 150;

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function insideField(field: AsteroidField, position: Vec): boolean {
  const d = distance(field.centre, position);
  if (field.kind === "cluster") return d <= field.radius;
  if (Math.abs(d - field.radius) > field.width / 2) return false;
  const turn = Math.atan2(position.y - field.centre.y, position.x - field.centre.x) - field.from;
  return ((turn % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) <= field.sweep;
}

// A random spot inside a belt or cluster, re-rolled if it lands too close to
// another rock (`rocks`) or to anything the station occupies (`blocked`). If
// random tries fail, a sweep of the whole field finds any spot left. A field
// the station has fully covered gets null, because a rock outside its field
// would not be in its belt or cluster; the caller tries again later.
export function placeInField(
  rng: number,
  field: AsteroidField,
  rocks: Vec[],
  blocked: Vec[],
): { position: Vec; rng: number } | null {
  const free = (position: Vec) =>
    rocks.every((other) => distance(other, position) >= ROCK_SPACING)
    && blocked.every((other) => distance(other, position) >= ASTEROID_MIN_SPACING);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const along = nextRandom(rng);
    const across = nextRandom(along.state);
    rng = across.state;
    const angle = field.kind === "belt" ? field.from + along.value * field.sweep : along.value * 2 * Math.PI;
    const d = field.kind === "belt"
      ? field.radius + (across.value - 0.5) * field.width
      : field.radius * Math.sqrt(across.value);
    const position = { x: field.centre.x + Math.cos(angle) * d, y: field.centre.y + Math.sin(angle) * d };
    if (free(position)) return { position, rng };
  }
  const reach = field.radius + (field.kind === "belt" ? field.width / 2 : 0);
  const step = ROCK_SPACING / 2;
  for (let x = -reach; x <= reach; x += step) {
    for (let y = -reach; y <= reach; y += step) {
      const position = { x: field.centre.x + x, y: field.centre.y + y };
      if (insideField(field, position) && free(position)) return { position, rng };
    }
  }
  return null;
}

// The sector's belts and clusters, each at a point of its own that keeps clear
// of the others and of the gate.
export function makeFields(rng: number, sectorId: number, firstId: number, gate: Vec): { fields: AsteroidField[]; rng: number } {
  const fields: AsteroidField[] = [];
  for (const kind of FIELD_LAYOUT) {
    let centre: Vec = { x: 0, y: 0 };
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const angle = nextRandom(rng);
      const reach = nextRandom(angle.state);
      rng = reach.state;
      const d = FIELD_MIN_REACH + reach.value * (FIELD_MAX_REACH - FIELD_MIN_REACH);
      centre = { x: Math.cos(angle.value * 2 * Math.PI) * d, y: Math.sin(angle.value * 2 * Math.PI) * d };
      if (distance(centre, gate) >= FIELD_GATE_CLEARANCE
        && fields.every((field) => distance(field.centre, centre) >= FIELD_SEPARATION)) break;
    }
    const spin = nextRandom(rng);
    rng = spin.state;
    const id = firstId + fields.length;
    fields.push(kind === "belt"
      ? { id, sectorId, kind, centre, radius: BELT_RADIUS, from: spin.value * 2 * Math.PI, sweep: BELT_SWEEP, width: BELT_WIDTH }
      : { id, sectorId, kind, centre, radius: CLUSTER_RADIUS });
  }
  return { fields, rng };
}


export function rocksInField(kind: AsteroidField["kind"], density: Density): number {
  if (density === "dense") return kind === "belt" ? BELT_ROCKS : CLUSTER_ROCKS;
  return kind === "belt" ? SPARSE_BELT_ROCKS : SPARSE_CLUSTER_ROCKS;
}
