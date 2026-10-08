import type { BerthLayout, Ship, ShipDesign, Vec } from "./model";
import { PIXEL_SIZE, STARTING_SHIP } from "./ship";

export const DOCK_WIDTH = 8;
export const DOCK_HEIGHT = 12;
export const DOCK_AREA = DOCK_WIDTH * DOCK_HEIGHT;

export function fitsDock(design: ShipDesign): boolean {
  return design.width > 0 && design.height > 0 && design.width <= DOCK_WIDTH && design.height <= DOCK_HEIGHT;
}

export function holdsBerth(ship: Ship): boolean {
  return ship.state === "loading" || ((ship.state === "haulLoading" || ship.state === "haulUnloading") && ship.berth !== null)
    || (ship.state === "unloading" && ship.transfer?.destination !== "constructionSite")
    || (ship.state === "berthing" && ship.berth !== null);
}

// A berth encodes the Dock module and the top-left pixel of the reserved
// rectangle. Reservations stay put until departure; ships never jump to repack.
export function berthPoint(layout: BerthLayout, berth: number, design = STARTING_SHIP): Vec {
  const docks = layout.modules.filter((module) => module.type === "Dock");
  const dock = docks[Math.floor(berth / DOCK_AREA)]?.position ?? layout.dock;
  const cell = berth % DOCK_AREA;
  return {
    x: dock.x + (cell % DOCK_WIDTH + design.width / 2 - DOCK_WIDTH / 2) * PIXEL_SIZE,
    y: dock.y + (Math.floor(cell / DOCK_WIDTH) + design.height / 2 - DOCK_HEIGHT / 2) * PIXEL_SIZE,
  };
}

export function freeBerth(layout: BerthLayout, ships: Ship[], design = STARTING_SHIP): number | null {
  if (!fitsDock(design)) return null;
  const docks = layout.modules.filter((module) => module.type === "Dock");
  const count = Math.min(docks.length, Math.floor(layout.capacity / DOCK_AREA));
  const occupied = new Set<number>();
  const reserve = (berth: number, design: ShipDesign): void => {
    const base = Math.floor(berth / DOCK_AREA) * DOCK_AREA;
    const cell = berth % DOCK_AREA;
    for (let y = 0; y < design.height; y++) for (let x = 0; x < design.width; x++) {
      occupied.add(base + cell + y * DOCK_WIDTH + x);
    }
  };
  const find = (design: ShipDesign): number | null => {
    if (!fitsDock(design)) return null;
    for (let dock = 0; dock < count; dock++) {
      for (let y = 0; y <= DOCK_HEIGHT - design.height; y++) for (let x = 0; x <= DOCK_WIDTH - design.width; x++) {
        const berth = dock * DOCK_AREA + y * DOCK_WIDTH + x;
        let clear = true;
        for (let dy = 0; dy < design.height; dy++) for (let dx = 0; dx < design.width; dx++) {
          if (occupied.has(berth + dy * DOCK_WIDTH + dx)) clear = false;
        }
        if (clear) return berth;
      }
    }
    return null;
  };
  const holders = ships.filter((ship) => {
    if (!holdsBerth(ship) || ship.sectorId !== layout.sectorId) return false;
    const point = ship.state === "berthing" && ship.leg ? ship.leg.to : ship.position;
    return docks.some((dock) => Math.abs(point.x - dock.position.x) <= dock.size.width / 2
      && Math.abs(point.y - dock.position.y) <= dock.size.height / 2);
  });
  for (const ship of holders) if (ship.berth !== null) reserve(ship.berth, ship.design);
  // Empty ships sent home in older states may unload without a reservation.
  // Account for each one separately, rather than assigning them the same room.
  for (const ship of holders) if (ship.berth === null) {
    const berth = find(ship.design);
    if (berth !== null) reserve(berth, ship.design);
  }
  return find(design);
}

// Starting-ship positions retained for fixtures that ask where a 4x4 lands.
// These are not fixed pads: smaller ships use finer positions in the same bay.
export function dockBerths(dock: Vec): Vec[] {
  const layout = { dock, sectorId: 0, modules: [], capacity: DOCK_AREA };
  const points: Vec[] = [];
  for (let y = 0; y <= DOCK_HEIGHT - STARTING_SHIP.height; y += STARTING_SHIP.height) {
    for (let x = 0; x <= DOCK_WIDTH - STARTING_SHIP.width; x += STARTING_SHIP.width) {
      points.push(berthPoint(layout, y * DOCK_WIDTH + x));
    }
  }
  return points;
}
