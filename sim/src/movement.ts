import { BUG_SIZE } from "./build-constants";
import { moduleBounds } from "./station-module-geometry";
import { shipSize } from "./ship";
import type { Bug, Ship, ShipDesign, StationModule } from "./model";

// Separation is a pure function of where every body would be on its straight
// leg this instant. Nothing is remembered between ticks, so a replay at any
// step size lands on the same positions, and every term below is continuous in
// those positions: a body drifts aside as others approach instead of snapping
// to a new layout when the crowd's order changes.

// Under this share of the contact distance a pair's "away" direction fades out
// instead of turning sharply as the pair passes through each other.
const SOFT_PUSH = 1;
// A body's pushes are averaged once their combined overlap passes this many
// contact distances, and summed below it.
const CROWD = 1.5;
// How strongly a pair's push leans toward the sidestep direction while they
// overlap.
const SIDESTEP = 1;
// Spreads body ids evenly round the circle, so any set of ids fans out.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

type Body = { half: { x: number; y: number }; radius: number };

const bodySizes = new WeakMap<ShipDesign, Body>();
const bugBody: Body = {
  half: { x: BUG_SIZE.width / 2, y: BUG_SIZE.height / 2 },
  radius: Math.hypot(BUG_SIZE.width, BUG_SIZE.height) / 2,
};

function shipBody(design: ShipDesign): Body {
  let body = bodySizes.get(design);
  if (!body) {
    const size = shipSize(design);
    body = { half: { x: size.width / 2, y: size.height / 2 }, radius: Math.hypot(size.width, size.height) / 2 };
    bodySizes.set(design, body);
  }
  return body;
}

function moving(ship: Ship): boolean {
  return ship.leg !== null && ship.timer > 0 && ship.state !== "docked" && ship.state !== "docking" && ship.state !== "berthing";
}

function movingBug(bug: Bug): boolean {
  return bug.leg !== null && bug.timer > 0;
}

export function trafficMoving(ships: Ship[], bugs: Bug[]): boolean {
  for (const ship of ships) if (moving(ship)) return true;
  for (const bug of bugs) if (movingBug(bug)) return true;
  return false;
}

// Scratch arrays, grown on demand and reused so a tick allocates little here.
let capacity = 0;
let px = new Float64Array(0);
let py = new Float64Array(0);
let dx = new Float64Array(0);
let dy = new Float64Array(0);
let heading = new Float64Array(0);
let halfX = new Float64Array(0);
let halfY = new Float64Array(0);
let radius = new Float64Array(0);
let key = new Float64Array(0);
let sector = new Int32Array(0);
let active = new Uint8Array(0);
let still = new Uint8Array(0);
let ordered = new Int32Array(0);
let orderedCount = -1;
let crowd = new Float64Array(0);
let outX = new Float64Array(0);
let outY = new Float64Array(0);

function reserve(count: number): void {
  if (count <= capacity) return;
  capacity = Math.max(count, capacity * 2, 32);
  px = new Float64Array(capacity); py = new Float64Array(capacity);
  dx = new Float64Array(capacity); dy = new Float64Array(capacity);
  heading = new Float64Array(capacity * 2);
  halfX = new Float64Array(capacity); halfY = new Float64Array(capacity);
  radius = new Float64Array(capacity); key = new Float64Array(capacity);
  sector = new Int32Array(capacity); active = new Uint8Array(capacity); still = new Uint8Array(capacity); ordered = new Int32Array(capacity); orderedCount = -1; crowd = new Float64Array(capacity);
  outX = new Float64Array(capacity); outY = new Float64Array(capacity);
}

const smooth = (t: number): number => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

type Bounds = { left: number; right: number; top: number; bottom: number };

// A leg that runs into a station module is bent to one side for the length of
// the module and eased back after it. The side is chosen from the leg alone, so
// a body passing the module's centre never flips from one edge to the other.
function bendAround(
  from: { x: number; y: number },
  to: { x: number; y: number },
  at: { x: number; y: number },
  half: { x: number; y: number },
  bounds: Bounds[],
  sectorOfBounds: number[],
  sectorId: number,
): number {
  const lx = to.x - from.x; const ly = to.y - from.y;
  const length = Math.hypot(lx, ly);
  if (length < 1e-9) return 0;
  const hx = lx / length; const hy = ly / length;
  const nx = -hy; const ny = hx;
  let plus = 0; let minus = 0;
  let plusAt: number[] | null = null; let minusAt: number[] | null = null;
  for (let m = 0; m < bounds.length; m += 1) {
    if (sectorOfBounds[m] !== sectorId) continue;
    const b = bounds[m]!;
    // A module the leg ends in is the ship's own errand, not an obstacle.
    if (to.x >= b.left && to.x <= b.right && to.y >= b.top && to.y <= b.bottom) continue;
    const ex = (b.right - b.left) / 2 + half.x; const ey = (b.bottom - b.top) / 2 + half.y;
    const cx = (b.left + b.right) / 2 - from.x; const cy = (b.top + b.bottom) / 2 - from.y;
    // A leg that starts inside a footprint is a ship leaving its own Dock.
    if (Math.abs(cx) < ex && Math.abs(cy) < ey) continue;
    const par = cx * hx + cy * hy;
    const perp = cx * nx + cy * ny;
    const reachPar = ex * Math.abs(hx) + ey * Math.abs(hy);
    const reachPerp = ex * Math.abs(nx) + ey * Math.abs(ny);
    if (Math.abs(perp) >= reachPerp || par + reachPar <= 0 || par - reachPar >= length) continue;
    const need = perp + reachPerp;
    const back = perp - reachPerp;
    if (need > plus) plus = need;
    if (back < minus) minus = back;
    (plusAt ??= []).push(par - reachPar, par + reachPar, need);
    (minusAt ??= []).push(par - reachPar, par + reachPar, back);
  }
  if (!plusAt) return 0;
  const useMinus = -minus < plus;
  const side = useMinus ? minusAt! : plusAt;
  const amount = useMinus ? minus : plus;
  const ramp = Math.min(Math.abs(amount) * 1.5 + 1, length / 2);
  const along = (at.x - from.x) * hx + (at.y - from.y) * hy;
  let offset = 0;
  for (let i = 0; i < side.length; i += 3) {
    const rise = smooth((along - (side[i]! - ramp)) / ramp);
    const fall = smooth((side[i + 1]! + ramp - along) / ramp);
    const value = side[i + 2]! * Math.min(rise, fall);
    if (Math.abs(value) > Math.abs(offset)) offset = value;
  }
  // Leave and arrive exactly on the leg, so a new leg never starts with a hop.
  return offset * smooth(along / ramp) * smooth((length - along) / ramp);
}

export function separateTraffic(ships: Ship[], bugs: Bug[], modules: StationModule[], moduleSectors: number[] = []): { ships: Ship[]; bugs: Bug[] } {
  // Arrival transitions consume the exact endpoint before starting a new leg.
  if (!trafficMoving(ships, bugs)) return { ships, bugs };
  const shipCount = ships.length;
  const count = shipCount + bugs.length;
  reserve(count);

  for (let i = 0; i < count; i += 1) {
    const isBug = i >= shipCount;
    const item = isBug ? bugs[i - shipCount]! : ships[i]!;
    const body = isBug ? bugBody : shipBody((item as Ship).design);
    const live = isBug ? movingBug(item as Bug) : moving(item as Ship);
    halfX[i] = body.half.x; halfY[i] = body.half.y;
    px[i] = item.position.x; py[i] = item.position.y;
    dx[i] = 0; dy[i] = 0; crowd[i] = 0;
    radius[i] = body.radius;
    sector[i] = item.sectorId;
    active[i] = live ? 1 : 0;
    // Parked at a point in space, as opposed to inside a Dock or on its way.
    still[i] = !live && item.leg === null && (isBug || (item as Ship).state !== "docked") ? 1 : 0;
    key[i] = item.id * 2 + (isBug ? 1 : 0);
    const leg = item.leg;
    if (live && leg) {
      const lx = leg.to.x - leg.from.x; const ly = leg.to.y - leg.from.y;
      const length = Math.sqrt(lx * lx + ly * ly);
      heading[i * 2] = length > 1e-9 ? lx / length : 0;
      heading[i * 2 + 1] = length > 1e-9 ? ly / length : 0;
    } else {
      heading[i * 2] = 0; heading[i * 2 + 1] = 0;
    }
  }

  // Station modules and bodies sitting still steer legs: a leg is bent around
  // each one it would run into, and eased back after it.
  let anyActive = false;
  for (let i = 0; i < count; i += 1) if (active[i]) { anyActive = true; break; }
  if (anyActive) {
    const bounds: Bounds[] = [];
    const sectors: number[] = [];
    const watched = (sectorId: number): boolean => {
      for (let b = 0; b < count; b += 1) if (active[b] && sector[b] === sectorId) return true;
      return false;
    };
    modules.forEach((module, i) => {
      const sectorId = moduleSectors[i] ?? 0;
      if (!watched(sectorId)) return;
      bounds.push(moduleBounds(module.position, module.size));
      sectors.push(sectorId);
    });
    for (let i = 0; i < count; i += 1) {
      if (active[i] || !still[i]) continue;
      if (!watched(sector[i]!)) continue;
      bounds.push({ left: px[i]! - halfX[i]!, right: px[i]! + halfX[i]!, top: py[i]! - halfY[i]!, bottom: py[i]! + halfY[i]! });
      sectors.push(sector[i]!);
    }
    if (bounds.length > 0) {
      const half = { x: 0, y: 0 };
      for (let i = 0; i < count; i += 1) {
        if (!active[i]) continue;
        const leg = (i >= shipCount ? bugs[i - shipCount]! : ships[i]!).leg!;
        half.x = halfX[i]!; half.y = halfY[i]!;
        const offset = bendAround(leg.from, leg.to, { x: px[i]!, y: py[i]! }, half, bounds, sectors, sector[i]!);
        if (offset === 0) continue;
        px[i] = px[i]! - heading[i * 2 + 1]! * offset;
        py[i] = py[i]! + heading[i * 2]! * offset;
      }
    }
  }

  // Nearby pairs push each other apart. Every push is computed from the same
  // positions and summed afterwards, so the result does not depend on the order
  // of the bodies.
  const pair = (i: number, j: number): void => {
    if (!active[i] && !active[j]) return;
    const required = radius[i]! + radius[j]!;
    const ox = px[j]! - px[i]!; const oy = py[j]! - py[i]!;
    const squared = ox * ox + oy * oy;
    if (squared >= required * required) return;
    // Work in a fixed order so the pair sees one geometry from either side.
    const first = key[i]! <= key[j]! ? i : j;
    const second = first === i ? j : i;
    const rx = first === i ? ox : -ox; const ry = first === i ? oy : -oy;
    const push = required - Math.sqrt(squared);
    // Sidestep: the side each body takes if it keeps to its own right. Bodies
    // on one heading, or none, leave along fixed directions spread by id.
    let sx = heading[first * 2 + 1]! - heading[second * 2 + 1]!;
    let sy = heading[second * 2]! - heading[first * 2]!;
    let sideLength = Math.sqrt(sx * sx + sy * sy);
    if (sideLength > 0.5) { sx /= sideLength; sy /= sideLength; } else {
      const a = key[first]! * GOLDEN_ANGLE; const b = key[second]! * GOLDEN_ANGLE;
      sx = Math.cos(b) - Math.cos(a); sy = Math.sin(b) - Math.sin(a);
      sideLength = Math.sqrt(sx * sx + sy * sy);
      sx /= sideLength; sy /= sideLength;
    }
    const vx = rx + SIDESTEP * push * sx; const vy = ry + SIDESTEP * push * sy;
    const scale = push / Math.max(Math.sqrt(vx * vx + vy * vy), SOFT_PUSH * required);
    const share = active[i] && active[j] ? 0.5 : 1;
    const gx = vx * scale * share; const gy = vy * scale * share;
    const weight = push / required;
    if (active[first]) { dx[first] = dx[first]! - gx; dy[first] = dy[first]! - gy; crowd[first] = crowd[first]! + weight; }
    if (active[second]) { dx[second] = dx[second]! + gx; dy[second] = dy[second]! + gy; crowd[second] = crowd[second]! + weight; }
  };
  // Sweep along x: bodies are visited in order and each is compared only with
  // the ones within one body width ahead of it.
  let reach = 1;
  for (let i = 0; i < count; i += 1) reach = Math.max(reach, radius[i]! * 2);
  // Bodies barely move in x between ticks, so last tick's order is nearly
  // sorted and an insertion pass finishes it in about one sweep.
  const order = ordered;
  if (orderedCount !== count) {
    for (let i = 0; i < count; i += 1) order[i] = i;
    orderedCount = count;
  }
  for (let a = 1; a < count; a += 1) {
    const item = order[a]!;
    const x = px[item]!;
    let b = a - 1;
    while (b >= 0 && px[order[b]!]! > x) { order[b + 1] = order[b]!; b -= 1; }
    order[b + 1] = item;
  }
  for (let a = 0; a < count; a += 1) {
    const i = order[a]!;
    const x = px[i]!; const y = py[i]!;
    for (let b = a + 1; b < count; b += 1) {
      const j = order[b]!;
      if (px[j]! - x >= reach) break;
      if (Math.abs(py[j]! - y) >= reach || sector[i] !== sector[j]) continue;
      pair(i, j);
    }
  }

  // A body squeezed by several neighbours moves by the average of their pushes
  // rather than the sum, so a dense group is not flung outward and a small
  // change in one position cannot move everyone around it.
  for (let i = 0; i < count; i += 1) {
    const scale = active[i] ? 1 / Math.max(1, crowd[i]! / CROWD) : 0;
    outX[i] = px[i]! + dx[i]! * scale;
    outY[i] = py[i]! + dy[i]! * scale;
  }

  let shipsOut = ships;
  let bugsOut = bugs;
  for (let i = 0; i < count; i += 1) {
    if (!active[i]) continue;
    const item = i >= shipCount ? bugs[i - shipCount]! : ships[i]!;
    const x = outX[i]!; const y = outY[i]!;
    if (x === item.position.x && y === item.position.y) continue;
    if (i >= shipCount) {
      if (bugsOut === bugs) bugsOut = bugs.slice();
      bugsOut[i - shipCount] = { ...(item as Bug), position: { x, y } };
    } else {
      if (shipsOut === ships) shipsOut = ships.slice();
      shipsOut[i] = { ...(item as Ship), position: { x, y } };
    }
  }
  return { ships: shipsOut, bugs: bugsOut };
}
