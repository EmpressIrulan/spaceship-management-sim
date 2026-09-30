import {
  MATERIALS,
  canMine,
  shipStats,
  type ShipDesign,
  type ShipModule,
  type Ship,
  type SimState,
} from "sim";
import { LASER_COLOR } from "./laser";
import { statsView } from "./shipyard";

export const MODULE_COLORS: Record<ShipModule, string> = {
  Engine: "#f97316",
  Laser: LASER_COLOR,
  Storage: "#94a3b8",
  Hull: "#475569",
};

export function slotColor(slot: ShipModule): string {
  return MODULE_COLORS[slot];
}

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// RGBA bytes of the ship at one image pixel per design pixel, transparent
// where nothing is painted.
export function spritePixels(design: ShipDesign): Uint8ClampedArray<ArrayBuffer> {
  const bytes = new Uint8ClampedArray(new ArrayBuffer(design.slots.length * 4));
  design.slots.forEach((slot, index) => {
    if (slot) bytes.set([...rgb(MODULE_COLORS[slot]), 255], index * 4);
  });
  return bytes;
}

// A ship is drawn as one small image scaled up, so a capital ship of tens of
// thousands of pixels costs the same to draw as a two-pixel one. Designs are
// never edited once built, so the image is made once per design.
const sprites = new WeakMap<ShipDesign, HTMLCanvasElement>();

export function shipSprite(design: ShipDesign): HTMLCanvasElement {
  let sprite = sprites.get(design);
  if (!sprite) {
    sprite = document.createElement("canvas");
    sprite.width = design.width;
    sprite.height = design.height;
    sprite.getContext("2d")!.putImageData(new ImageData(spritePixels(design), design.width, design.height), 0, 0);
    sprites.set(design, sprite);
  }
  return sprite;
}

function missing(design: ShipDesign): string {
  const has = (module: ShipModule) => design.slots.includes(module);
  if (!has("Laser")) return "no laser";
  if (!has("Engine")) return "no engine";
  return "no storage";
}

// One line saying what the ship is doing, for its hover box and panel.
export function shipStatus(state: SimState, ship: Ship): string {
  if (ship.order) return `Order: ${ship.order.kind}`;
  const route = ship.haulRoute;
  const source = route ? state.sectors[route.from === "home" ? state.station.sectorId
    : state.claimSites.find((site) => `claim:${site.id}` === route.from)?.sectorId ?? -1]?.name : null;
  const destination = route ? state.sectors[route.to === "home" ? state.station.sectorId
    : state.claimSites.find((site) => `claim:${site.id}` === route.to)?.sectorId ?? -1]?.name : null;
  switch (ship.state) {
    case "idle":
      return canMine(ship.design) ? "Idle: no ore" : `Idle: ${missing(ship.design)}`;
    case "outbound":
      return `Flying out to mine ${ship.cargoMaterial ?? "ore"}`;
    case "working":
      return `Mining ${ship.cargoMaterial ?? "ore"}`;
    case "homebound":
      return `Flying home with ${ship.cargo} ${ship.cargoMaterial ?? "ore"}`;
    case "unloading":
      return "Unloading";
    case "waiting": {
      const stored = MATERIALS.reduce((total, material) => total + state.station.inventory[material], 0);
      return stored >= state.station.storage.capacity ? "Waiting: storage full" : "Waiting: dock busy";
    }
    case "moving":
      return "Moving";
    case "holding":
      return "Holding";
    case "jumpingOut":
    case "jumpingHome":
      return "Jumping";
    case "gateHauling":
      return `Hauling ${ship.cargo} ${ship.cargoMaterial ?? "ore"} to gate`;
    case "gateReturning":
      return "Returning to Storage";
    case "haulLoading":
      return `Loading ${ship.cargo}/${shipStats(ship.design).hold} ${route?.material ?? "cargo"}`;
    case "haulOutbound":
    case "haulJumpingOutbound":
      return `Hauling ${route?.material ?? "cargo"} to ${destination ?? "station"}`;
    case "haulUnloading":
      return `Unloading ${ship.cargo}/${shipStats(ship.design).hold} ${route?.material ?? "cargo"}`;
    case "haulReturning":
    case "haulJumpingReturning":
      return `Returning to ${source ?? "station"}`;
    case "haulWaitingSource":
      return `Waiting at ${source ?? "station"}: no ${route?.material ?? "cargo"}`;
    case "haulWaitingFull":
      return `Waiting at ${ship.cargo > 0 ? destination : source}: ${destination ?? "station"} full`;
  }
}

export interface ShipPanel {
  size: string;
  design: ShipDesign;
  rows: [string, string][];
}

// Null once the ship has gone, which closes the panel.
export function shipPanel(state: SimState, id: number): ShipPanel | null {
  const ship = state.ships.find((candidate) => candidate.id === id);
  if (!ship) return null;
  const stats = statsView(ship.design);
  const { hold } = shipStats(ship.design);
  const cargo = `${ship.cargo}/${hold}${ship.cargo > 0 && ship.cargoMaterial ? ` ${ship.cargoMaterial}` : ""}`;
  return {
    size: `${ship.design.width}x${ship.design.height}`,
    design: ship.design,
    rows: [
      ["Speed", stats.speed],
      ["Hold", stats.hold],
      ["Mining time", stats.miningTime],
      ["Cargo", cargo],
      ["State", shipStatus(state, ship)],
    ],
  };
}
