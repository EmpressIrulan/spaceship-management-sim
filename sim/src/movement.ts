import { BUG_SIZE } from "./build-constants";
import { moduleBounds } from "./station-module-geometry";
import { shipSize } from "./ship";
import type { Bug, Ship, StationModule, Vec } from "./model";

type Mover = { id: number; sectorId: number; position: Vec; origin: Vec | null; destination: Vec | null; size: { width: number; height: number }; active: boolean };

function moving(ship: Ship): boolean {
  return ship.leg !== null && ship.timer > 0 && !["docked", "docking", "berthing"].includes(ship.state);
}

function movingBug(bug: Bug): boolean {
  return bug.leg !== null && bug.timer > 0;
}

function moveApart(movers: Mover[], modules: { sectorId: number; module: StationModule }[]): void {
  const radii = movers.map(({ size }) => Math.hypot(size.width, size.height) / 2);
  const obstaclesBySector = new Map<number, ReturnType<typeof moduleBounds>[]>();
  modules.forEach(({ sectorId, module }) => {
    const obstacles = obstaclesBySector.get(sectorId) ?? [];
    obstacles.push(moduleBounds(module.position, module.size));
    obstaclesBySector.set(sectorId, obstacles);
  });
  let cellSize = 1;
  for (const radius of radii) cellSize = Math.max(cellSize, radius * 2);
  const cell = (mover: Mover) => ({ x: Math.floor(mover.position.x / cellSize), y: Math.floor(mover.position.y / cellSize) });
  // A grid costs more than a handful of direct checks for the usual small fleet.
  const useGrid = movers.length > 16;
  const indices = movers.map((_, index) => index);
  // Break exact stacks in one deterministic placement instead of iterating
  // many times over a crowded group on every simulation tick.
  const stacks = new Map<string, number[]>();
  movers.forEach((mover, index) => {
    if (!mover.active) return;
    const key = `${mover.sectorId}:${mover.position.x}:${mover.position.y}`;
    const stack = stacks.get(key) ?? [];
    stack.push(index);
    stacks.set(key, stack);
  });
  for (const indices of stacks.values()) {
    if (indices.length < 2) continue;
    const largest = Math.max(...indices.map((index) => radii[index]! * 2));
    const radius = largest / (2 * Math.sin(Math.PI / indices.length));
    const center = { ...movers[indices[0]!]!.position };
    const phase = (movers[indices[0]!]!.id % 360) * Math.PI / 180;
    indices.forEach((index, slot) => {
      const mover = movers[index]!;
      const angle = phase + slot * 2 * Math.PI / indices.length;
      mover.position.x = center.x + Math.cos(angle) * radius;
      mover.position.y = center.y + Math.sin(angle) * radius;
    });
  }
  const maxPasses = 2;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    // Numeric sector/column/row keys avoid allocating 25 strings per body.
    const buckets = new Map<number, Map<number, Map<number, number[]>>>();
    if (useGrid) movers.forEach((mover, index) => {
      const at = cell(mover);
      let sector = buckets.get(mover.sectorId);
      if (!sector) { sector = new Map(); buckets.set(mover.sectorId, sector); }
      let column = sector.get(at.x);
      if (!column) { column = new Map(); sector.set(at.x, column); }
      let bucket = column.get(at.y);
      if (!bucket) { bucket = []; column.set(at.y, bucket); }
      bucket.push(index);
    });
    for (let i = 0; i < movers.length; i += 1) {
      const a = movers[i]!;
      let nearby = indices;
      if (useGrid) {
        const at = cell(a);
        nearby = [];
        const sector = buckets.get(a.sectorId)!;
        for (let x = at.x - 2; x <= at.x + 2; x += 1) {
          const column = sector.get(x);
          if (!column) continue;
          for (let y = at.y - 2; y <= at.y + 2; y += 1) {
            const bucket = column.get(y);
            if (bucket) nearby.push(...bucket);
          }
        }
        nearby.sort((left, right) => left - right);
      }
      for (const j of nearby) {
        if (j <= i) continue;
        const b = movers[j]!;
        if (a.sectorId !== b.sectorId || (!a.active && !b.active)) continue;
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const required = radii[i]! + radii[j]!;
        const squaredDistance = dx * dx + dy * dy;
        if (squaredDistance >= (required - 1e-9) ** 2) continue;
        const distance = Math.sqrt(squaredDistance);
        changed = true;
        const angle = distance > 1e-9 ? Math.atan2(dy, dx) : ((a.id * 31 + b.id * 17) % 360) * Math.PI / 180;
        const push = (required + 1e-6 - distance) / ((b.active ? 1 : 0) + (a.active ? 1 : 0));
        if (a.active) { a.position.x -= Math.cos(angle) * push; a.position.y -= Math.sin(angle) * push; }
        if (b.active) { b.position.x += Math.cos(angle) * push; b.position.y += Math.sin(angle) * push; }
      }
      if (!a.active) continue;
      for (const bounds of obstaclesBySector.get(a.sectorId) ?? []) {
        if (a.destination && a.destination.x >= bounds.left && a.destination.x <= bounds.right
          && a.destination.y >= bounds.top && a.destination.y <= bounds.bottom) continue;
        const hx = a.size.width / 2; const hy = a.size.height / 2;
        const left = bounds.left - hx; const right = bounds.right + hx;
        const top = bounds.top - hy; const bottom = bounds.bottom + hy;
        // A ship's legitimate route starts at the Dock's centre. Let it leave
        // that footprint, then treat it as an obstacle like every other module.
        if (a.origin && a.origin.x >= left && a.origin.x <= right && a.origin.y >= top && a.origin.y <= bottom
          && (a.position.x < left || a.position.x > right || a.position.y < top || a.position.y > bottom)) continue;
        if (a.position.x <= left || a.position.x >= right || a.position.y <= top || a.position.y >= bottom) continue;
        const choices = [
          { distance: a.position.x - left, x: left, y: a.position.y },
          { distance: right - a.position.x, x: right, y: a.position.y },
          { distance: a.position.y - top, x: a.position.x, y: top },
          { distance: bottom - a.position.y, x: a.position.x, y: bottom },
        ].sort((p, q) => p.distance - q.distance);
        a.position.x = choices[0]!.x; a.position.y = choices[0]!.y;
      }
    }
    if (!changed) break;
  }
}

export function separateTraffic(ships: Ship[], bugs: Bug[], modules: StationModule[], moduleSectors: number[] = []): { ships: Ship[]; bugs: Bug[] } {
  // Arrival transitions consume the exact endpoint before starting a new leg.
  if (!ships.some(moving) && !bugs.some(movingBug)) return { ships, bugs };
  const movers: Mover[] = [
    ...ships.map((ship) => ({ id: ship.id, sectorId: ship.sectorId, position: { ...ship.position }, origin: ship.leg?.from ?? null, destination: ship.leg?.to ?? null, size: shipSize(ship.design), active: moving(ship) })),
    ...bugs.map((bug) => ({ id: bug.id, sectorId: bug.sectorId, position: { ...bug.position }, origin: bug.leg?.from ?? null, destination: bug.leg?.to ?? null, size: BUG_SIZE, active: movingBug(bug) })),
  ];
  moveApart(movers, modules.map((module, i) => ({ sectorId: moduleSectors[i] ?? 0, module })));
  const shifted = <T extends { position: Vec }>(item: T, mover: Mover): T => {
    const dx = mover.position.x - item.position.x; const dy = mover.position.y - item.position.y;
    return dx === 0 && dy === 0 ? item : { ...item, position: mover.position };
  };
  return {
    ships: ships.map((ship, i) => shifted(ship, movers[i]!)),
    bugs: bugs.map((bug, i) => shifted(bug, movers[ships.length + i]!)),
  };
}
