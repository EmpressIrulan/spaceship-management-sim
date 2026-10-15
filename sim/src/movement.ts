import { BUG_SIZE } from "./build-constants";
import { moduleBounds } from "./station-module-geometry";
import { shipSize } from "./ship";
import type { Bug, Ship, StationModule, Vec } from "./model";

type Mover = { id: number; sectorId: number; position: Vec; origin: Vec | null; destination: Vec | null; size: { width: number; height: number }; active: boolean };

function moving(ship: Ship): boolean {
  return ship.leg !== null && !["docked", "docking", "berthing"].includes(ship.state);
}

function moveApart(movers: Mover[], modules: { sectorId: number; module: StationModule }[]): void {
  // Fleet order and the fixed separation direction keep coincident traffic deterministic.
  for (let i = 0; i < movers.length; i += 1) {
    const a = movers[i]!;
    for (let j = i + 1; j < movers.length; j += 1) {
      const b = movers[j]!;
      if (a.sectorId !== b.sectorId || (!a.active && !b.active)) continue;
      const dx = b.position.x - a.position.x;
      const dy = b.position.y - a.position.y;
      const distance = Math.hypot(dx, dy);
      const required = (Math.hypot(a.size.width, a.size.height) + Math.hypot(b.size.width, b.size.height)) / 2;
      if (distance >= required) continue;
      const angle = distance > 1e-9 ? Math.atan2(dy, dx) : ((a.id * 31 + b.id * 17) % 360) * Math.PI / 180;
      const push = (required - distance) / ((b.active ? 1 : 0) + (a.active ? 1 : 0));
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
