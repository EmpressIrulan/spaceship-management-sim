import { BUG_SIZE } from "./build-constants";
import { moduleBounds } from "./station-module-geometry";
import { shipSize } from "./ship";
import type { Bug, Ship, StationModule, Vec } from "./model";

type Mover = { id: number; sectorId: number; position: Vec; origin: Vec | null; destination: Vec | null; size: { width: number; height: number }; active: boolean };

function moving(ship: Ship): boolean {
  return ship.leg !== null && !["docked", "docking", "berthing"].includes(ship.state);
}

function moveApart(movers: Mover[], modules: { sectorId: number; module: StationModule }[]): void {
  let cellSize = 1;
  for (const mover of movers) cellSize = Math.max(cellSize, Math.hypot(mover.size.width, mover.size.height));
  const cell = (mover: Mover) => ({ x: Math.floor(mover.position.x / cellSize), y: Math.floor(mover.position.y / cellSize) });
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
    const largest = Math.max(...indices.map((index) => Math.hypot(movers[index]!.size.width, movers[index]!.size.height)));
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
    const buckets = new Map<string, number[]>();
    movers.forEach((mover, index) => {
      const at = cell(mover);
      const key = `${mover.sectorId}:${at.x}:${at.y}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(index);
      buckets.set(key, bucket);
    });
    for (let i = 0; i < movers.length; i += 1) {
      const a = movers[i]!;
      const at = cell(a);
      const nearby: number[] = [];
      for (let x = at.x - 2; x <= at.x + 2; x += 1) for (let y = at.y - 2; y <= at.y + 2; y += 1) {
        nearby.push(...(buckets.get(`${a.sectorId}:${x}:${y}`) ?? []));
      }
      nearby.sort((left, right) => left - right);
      for (const j of nearby) {
        if (j <= i) continue;
        const b = movers[j]!;
        if (!a.active && !b.active) continue;
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const distance = Math.hypot(dx, dy);
        const required = (Math.hypot(a.size.width, a.size.height) + Math.hypot(b.size.width, b.size.height)) / 2;
        if (distance >= required - 1e-9) continue;
        changed = true;
        const angle = distance > 1e-9 ? Math.atan2(dy, dx) : ((a.id * 31 + b.id * 17) % 360) * Math.PI / 180;
        const push = (required + 1e-6 - distance) / ((b.active ? 1 : 0) + (a.active ? 1 : 0));
        if (a.active) { a.position.x -= Math.cos(angle) * push; a.position.y -= Math.sin(angle) * push; }
        if (b.active) { b.position.x += Math.cos(angle) * push; b.position.y += Math.sin(angle) * push; }
      }
      if (!a.active) continue;
      for (const { sectorId, module } of modules) {
        if (sectorId !== a.sectorId) continue;
        const bounds = moduleBounds(module.position, module.size);
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
  if (!ships.some(moving) && !bugs.some((bug) => bug.leg !== null)) return { ships, bugs };
  const movers: Mover[] = [
    ...ships.map((ship) => ({ id: ship.id, sectorId: ship.sectorId, position: { ...ship.position }, origin: ship.leg?.from ?? null, destination: ship.leg?.to ?? null, size: shipSize(ship.design), active: moving(ship) })),
    ...bugs.map((bug) => ({ id: bug.id, sectorId: bug.sectorId, position: { ...bug.position }, origin: bug.leg?.from ?? null, destination: bug.leg?.to ?? null, size: BUG_SIZE, active: bug.leg !== null })),
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
