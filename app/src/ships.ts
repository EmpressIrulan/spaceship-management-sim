import {
  MATERIALS,
  SHIP_SLOT_SIZE,
  canMine,
  shipStats,
  type ShipDesign,
  type ShipModule,
  type Ship,
  type SimState,
  type Vec,
} from "sim";
import { LASER_COLOR } from "./laser";
import { statsView } from "./shipyard";

export const MODULE_COLORS: Record<ShipModule, string> = {
  Engine: "#f97316",
  Laser: LASER_COLOR,
  Storage: "#94a3b8",
};
// An empty slot still shows as hull.
export const EMPTY_SLOT_COLOR = "#334155";

export function slotColor(slot: ShipModule | null): string {
  return slot ? MODULE_COLORS[slot] : EMPTY_SLOT_COLOR;
}

export interface Block {
  // World-space centre of one slot.
  position: Vec;
  color: string;
}

// One block per slot, laid out row by row around the ship's centre.
export function shipBlocks(ship: Ship): Block[] {
  const { width, height, slots } = ship.design;
  return slots.map((slot, index) => ({
    position: {
      x: ship.position.x + ((index % width) - (width - 1) / 2) * SHIP_SLOT_SIZE,
      y: ship.position.y + (Math.floor(index / width) - (height - 1) / 2) * SHIP_SLOT_SIZE,
    },
    color: slotColor(slot),
  }));
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
