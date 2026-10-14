import type { BerthLayout, Ship, ShipDesign, StationModule, Vec } from "./model";
import { PIXEL_SIZE, STARTING_SHIP } from "./ship";

export const DOCK_WIDTH = 10;
export const DOCK_HEIGHT = 10;
export const DOCK_AREA = DOCK_WIDTH * DOCK_HEIGHT;

function dimensions(dock: StationModule) {
  return { width: dock.width ?? DOCK_WIDTH, height: dock.height ?? DOCK_HEIGHT };
}

function docksFor(layout: BerthLayout): StationModule[] {
  return layout.modules.filter((module) => module.type === "Dock");
}

export function fitsDock(design: ShipDesign, layout?: BerthLayout): boolean {
  if (design.width <= 0 || design.height <= 0) return false;
  const docks = layout ? docksFor(layout) : [];
  return (docks.length ? docks : [{ type: "Dock" as const, position: { x: 0, y: 0 }, size: { width: 0, height: 0 } }])
    .some((dock) => design.width <= dimensions(dock).width && design.height <= dimensions(dock).height);
}

export function holdsBerth(ship: Ship): boolean {
  return ship.state === "loading" || ((ship.state === "haulLoading" || ship.state === "haulUnloading") && ship.berth !== null)
    || (ship.state === "unloading" && ship.transfer?.destination !== "constructionSite")
    || (ship.state === "berthing" && ship.berth !== null);
}

function berthDock(layout: BerthLayout, berth: number): { dock: StationModule; index: number; offset: number } | null {
  const docks = docksFor(layout);
  let offset = 0;
  for (const dock of docks) {
    const size = dimensions(dock);
    const area = size.width * size.height;
    if (berth < offset + area) return { dock, index: berth - offset, offset };
    offset += area;
  }
  return null;
}

export function berthPoint(layout: BerthLayout, berth: number, design = STARTING_SHIP): Vec {
  const found = berthDock(layout, berth);
  const dock = found?.dock.position ?? layout.dock;
  const width = found ? dimensions(found.dock).width : DOCK_WIDTH;
  const height = found ? dimensions(found.dock).height : DOCK_HEIGHT;
  const cell = found?.index ?? berth;
  return {
    x: dock.x + (cell % width + design.width / 2 - width / 2) * PIXEL_SIZE,
    y: dock.y + (Math.floor(cell / width) + design.height / 2 - height / 2) * PIXEL_SIZE,
  };
}

export function freeBerth(layout: BerthLayout, ships: Ship[], design = STARTING_SHIP): number | null {
  const docks = docksFor(layout);
  if (!fitsDock(design, layout)) return null;
  const occupied = new Set<string>();
  const reserve = (berth: number, shipDesign: ShipDesign): void => {
    const found = berthDock(layout, berth);
    if (!found) return;
    const width = dimensions(found.dock).width;
    const cell = found.index;
    const x = cell % width;
    const y = Math.floor(cell / width);
    for (let dy = 0; dy < shipDesign.height; dy++) for (let dx = 0; dx < shipDesign.width; dx++) {
      occupied.add(`${found.offset}:${x + dx}:${y + dy}`);
    }
  };
  const holders = ships.filter((ship) => {
    if (!holdsBerth(ship) || ship.sectorId !== layout.sectorId) return false;
    const point = ship.state === "berthing" && ship.leg ? ship.leg.to : ship.position;
    return docks.some((dock) => Math.abs(point.x - dock.position.x) <= dock.size.width / 2
      && Math.abs(point.y - dock.position.y) <= dock.size.height / 2);
  });
  for (const ship of holders) if (ship.berth !== null) reserve(ship.berth, ship.design);
  for (const ship of holders) if (ship.berth === null) {
    const berth = findBerth(layout, occupied, ship.design);
    if (berth !== null) reserve(berth, ship.design);
  }
  return findBerth(layout, occupied, design);
}

function findBerth(layout: BerthLayout, occupied: Set<string>, design: ShipDesign): number | null {
  let offset = 0;
  for (const dock of docksFor(layout)) {
    const { width, height } = dimensions(dock);
    for (let y = 0; y <= height - design.height; y++) for (let x = 0; x <= width - design.width; x++) {
      let clear = true;
      for (let dy = 0; dy < design.height; dy++) for (let dx = 0; dx < design.width; dx++) {
        if (occupied.has(`${offset}:${x + dx}:${y + dy}`)) clear = false;
      }
      if (clear) return offset + y * width + x;
    }
    offset += width * height;
  }
  return null;
}

export function dockBerths(dock: Vec): Vec[] {
  const module: StationModule = { type: "Dock", position: dock, size: { width: DOCK_WIDTH * PIXEL_SIZE, height: DOCK_HEIGHT * PIXEL_SIZE }, width: DOCK_WIDTH, height: DOCK_HEIGHT };
  const layout = { dock, sectorId: 0, modules: [module], capacity: DOCK_AREA };
  const points: Vec[] = [];
  for (let y = 0; y <= DOCK_HEIGHT - STARTING_SHIP.height; y += STARTING_SHIP.height) {
    for (let x = 0; x <= DOCK_WIDTH - STARTING_SHIP.width; x += STARTING_SHIP.width) {
      points.push(berthPoint(layout, y * DOCK_WIDTH + x));
    }
  }
  return points;
}
