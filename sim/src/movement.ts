import { BUG_SIZE, BUG_SPEED_FACTOR } from "./build-constants";
import { moduleBounds } from "./station-module-geometry";
import { shipSize, speedFactor } from "./ship";
import { SHIP_CRUISE_SPEED } from "./motion";
import type { Bug, Ship, ShipDesign, StationModule } from "./model";

// Separation is a pure function of where every body would be on its straight
// leg this instant. Nothing is remembered between ticks, so a replay at any
// step size lands on the same positions, and every term below is continuous in
// those positions: a body drifts aside as others approach instead of snapping
// to a new layout when the crowd's order changes.

// A body's pushes are averaged once their combined overlap passes this many
// contact distances, and summed below it.
const CROWD = 1.5;
// Spreads body ids evenly round the circle, so any set of ids fans out.
// Moving bodies start to slide round each other this many contact distances out.
const RANGE = 1.5;
// Relative speed, in world units a second, below which a pair's motion is too
// small to say which way they pass each other.
const FIXED_SIDE = 0.5;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

type Body = { half: { x: number; y: number }; radius: number; cruise: number };

const bodySizes = new WeakMap<ShipDesign, Body>();
const bugBody: Body = {
  half: { x: BUG_SIZE.width / 2, y: BUG_SIZE.height / 2 },
  radius: Math.hypot(BUG_SIZE.width, BUG_SIZE.height) / 2,
  cruise: SHIP_CRUISE_SPEED * BUG_SPEED_FACTOR,
};

function shipBody(design: ShipDesign): Body {
  let body = bodySizes.get(design);
  if (!body) {
    const size = shipSize(design);
    body = { half: { x: size.width / 2, y: size.height / 2 }, radius: Math.hypot(size.width, size.height) / 2, cruise: SHIP_CRUISE_SPEED * speedFactor(design) };
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
let velocity = new Float64Array(0);
let cruise = new Float64Array(0);
let halfX = new Float64Array(0);
let halfY = new Float64Array(0);
let radius = new Float64Array(0);
let key = new Float64Array(0);
let sector = new Int32Array(0);
let active = new Uint8Array(0);
let still = new Uint8Array(0);
let ordered = new Int32Array(0);
const edges: number[] = [];
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
  velocity = new Float64Array(capacity * 2);
  cruise = new Float64Array(capacity);
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
    // The offset eases in and out only on the stretch of leg that lies clear of
    // the module, so the ship is never inside it while the offset shrinks.
    const start = side[i]!; const end = side[i + 1]!;
    const rise = start > 0 ? Math.min(ramp, start) : 0;
    const fall = length - end > 0 ? Math.min(ramp, length - end) : 0;
    const up = rise > 0 ? smooth((along - (start - rise)) / rise) : 1;
    const down = fall > 0 ? smooth((end + fall - along) / fall) : 1;
    const value = side[i + 2]! * Math.min(up, down);
    if (Math.abs(value) > Math.abs(offset)) offset = value;
  }
  return offset;
}

// With `seconds`, separation may change a body's offset by at most half a
// cruise step per frame, easing on from the offset it left last frame, so a
// crowd opens up over several frames. Module clearance is not eased: it comes
// from the leg alone. Without `seconds` the answer is applied whole.
export function separateTraffic(
  ships: Ship[], bugs: Bug[], modules: StationModule[], moduleSectors: number[] = [], seconds = Infinity,
): { ships: Ship[]; bugs: Bug[] } {
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
    cruise[i] = body.cruise;
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
      // Average velocity over the rest of the leg: what is left to cover over
      // the time left. It is exact for a bug, whose legs run at one speed.
      const left = Math.max(item.timer, 1e-3);
      velocity[i * 2] = (leg.to.x - item.position.x) / left;
      velocity[i * 2 + 1] = (leg.to.y - item.position.y) / left;
    } else {
      heading[i * 2] = 0; heading[i * 2 + 1] = 0;
      velocity[i * 2] = 0; velocity[i * 2 + 1] = 0;
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
  // of the bodies. A first sweep finds the overlapping pairs and how crowded
  // each body is, and a second one pushes.
  edges.length = 0;
  const overlapping = (i: number, j: number): void => {
    if (!active[i] && !active[j]) return;
    const required = radius[i]! + radius[j]!;
    const ox = px[j]! - px[i]!; const oy = py[j]! - py[i]!;
    const squared = ox * ox + oy * oy;
    if (squared >= required * required * RANGE * RANGE) return;
    edges.push(i, j);
    const weight = Math.max(0, 1 - Math.sqrt(squared) / required);
    if (active[i]) crowd[i] = crowd[i]! + weight;
    if (active[j]) crowd[j] = crowd[j]! + weight;
  };
  // Sweep along x: bodies are visited in order and each is compared only with
  // the ones within one body width ahead of it.
  let reach = 1;
  for (let i = 0; i < count; i += 1) reach = Math.max(reach, radius[i]! * 2 * RANGE);
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
      overlapping(i, j);
    }
  }
  for (let e = 0; e < edges.length; e += 2) {
    const i = edges[e]!; const j = edges[e + 1]!;
    const required = radius[i]! + radius[j]!;
    const ox = px[j]! - px[i]!; const oy = py[j]! - py[i]!;
    // Work in a fixed order so the pair sees one geometry from either side.
    const first = key[i]! <= key[j]! ? i : j;
    const second = first === i ? j : i;
    const rx = first === i ? ox : -ox; const ry = first === i ? oy : -oy;
    const distance = Math.sqrt(rx * rx + ry * ry);
    // Sideways: perpendicular to how the two close on each other.
    // Bodies that hardly move relative to each other have no side to pass on,
    // so they fade to a fixed direction per pair, spread by id.
    const dvx = velocity[second * 2]! - velocity[first * 2]!;
    const dvy = velocity[second * 2 + 1]! - velocity[first * 2 + 1]!;
    const closing = Math.sqrt(dvx * dvx + dvy * dvy);
    const sure = smooth((closing - FIXED_SIDE) / (3 * FIXED_SIDE));
    const ga = key[first]! * GOLDEN_ANGLE; const gb = key[second]! * GOLDEN_ANGLE;
    let sx = sure * (-dvy / (closing || 1)) + (1 - sure) * (Math.cos(gb) - Math.cos(ga));
    let sy = sure * (dvx / (closing || 1)) + (1 - sure) * (Math.sin(gb) - Math.sin(ga));
    const sideLength = Math.sqrt(sx * sx + sy * sy) || 1;
    sx /= sideLength; sy /= sideLength;
    // Alone, a pair begins to slide sideways before contact, on the side they
    // are already offset to, far enough to clear each other by the time they
    // meet. The slide grows smoothly from nothing, so there is no sudden swap
    // when they cross. In a crowd that answer would change sharply as
    // neighbours come and go, so it gives way to a gentler push that leaves
    // some overlap.
    let tx = sx; let ty = sy;
    if (rx * sx + ry * sy < -1e-6) { tx = -sx; ty = -sy; }
    // Only as much slide as the pair still needs: how far apart sideways they
    // must be at this point along their pass, less how far they already are.
    const sideways = Math.max(0, rx * tx + ry * ty);
    const along = Math.sqrt(Math.max(0, distance * distance - sideways * sideways)) / (required * RANGE);
    const slide = Math.max(0, required * Math.max(0, 1 - along * along) - sideways);
    const exactX = tx * slide; const exactY = ty * slide;
    const push = Math.max(0, required - distance);
    const bx = rx + push * sx; const by = ry + push * sy;
    const soft = push / Math.max(Math.sqrt(bx * bx + by * by), required);
    const softX = bx * soft; const softY = by * soft;
    const crowded = Math.max(crowd[i]!, crowd[j]!);
    // Bodies that barely move relative to each other have no side to pass on
    // either, and get the gentle push too.
    const gentle = 1 - (1 - smooth(crowded - 1)) * sure;
    const share = active[i] && active[j] ? 0.5 : 1;
    const gx = (exactX + (softX - exactX) * gentle) * share;
    const gy = (exactY + (softY - exactY) * gentle) * share;
    if (active[first]) { dx[first] = dx[first]! - gx; dy[first] = dy[first]! - gy; }
    if (active[second]) { dx[second] = dx[second]! + gx; dy[second] = dy[second]! + gy; }
  }

  // A body squeezed by several neighbours moves by the average of their pushes
  // rather than the sum, so a dense group is not flung outward and a small
  // change in one position cannot move everyone around it.
  for (let i = 0; i < count; i += 1) {
    const scale = active[i] ? 1 / Math.max(1, crowd[i]! / CROWD) : 0;
    outX[i] = px[i]! + dx[i]! * scale;
    outY[i] = py[i]! + dy[i]! * scale;
  }

  const limited = Number.isFinite(seconds);
  let shipsOut = ships;
  let bugsOut = bugs;
  for (let i = 0; i < count; i += 1) {
    const isBug = i >= shipCount;
    const item = isBug ? bugs[i - shipCount]! : ships[i]!;
    let next: Ship | Bug | null = null;
    if (!active[i]) {
      // Whatever nudged a body that has stopped is over.
      if (limited && (item.nudgeX || item.nudgeY)) next = { ...item, nudgeX: 0, nudgeY: 0 };
    } else {
      // Where the leg and the modules put the body, and how far separation
      // wants it moved from there.
      let nx = outX[i]! - px[i]!; let ny = outY[i]! - py[i]!;
      if (limited) {
        const bx = item.nudgeX ?? 0; const by = item.nudgeY ?? 0;
        const mx = nx - bx; const my = ny - by;
        const move = Math.sqrt(mx * mx + my * my);
        const allowed = 0.5 * cruise[i]! * seconds;
        if (move > allowed) { nx = bx + mx * allowed / move; ny = by + my * allowed / move; }
      }
      const x = px[i]! + nx; const y = py[i]! + ny;
      const moved = x !== item.position.x || y !== item.position.y;
      if (moved || (limited && ((item.nudgeX ?? 0) !== nx || (item.nudgeY ?? 0) !== ny))) {
        next = limited ? { ...item, position: { x, y }, nudgeX: nx, nudgeY: ny } : { ...item, position: { x, y } };
      }
    }
    if (!next) continue;
    if (isBug) {
      if (bugsOut === bugs) bugsOut = bugs.slice();
      bugsOut[i - shipCount] = next as Bug;
    } else {
      if (shipsOut === ships) shipsOut = ships.slice();
      shipsOut[i] = next as Ship;
    }
  }
  return { ships: shipsOut, bugs: bugsOut };
}
