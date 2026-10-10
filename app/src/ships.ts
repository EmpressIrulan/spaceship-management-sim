import {
  MATERIALS,
  cargoByMaterial,
  canMine,
  haulDestinations,
  nearestMineableRock,
  shipStats,
  supplyQueueLength,
  supplyQueueStatus,
  waitingForOre,
  type Order,
  type ShipDesign,
  type ShipModule,
  type Ship,
  type SimState,
} from "sim";
import { stationById } from "sim";
import { LASER_COLOR } from "./laser";
import { statsView } from "./shipyard";

export const MODULE_COLORS: Record<ShipModule, string> = {
  Engine: "#f97316",
  Laser: LASER_COLOR,
  Storage: "#94a3b8",
  Hangar: "#38bdf8",
  Hull: "#475569",
  // A Gun wears the same yellow as the shot it fires, so a hull reads as armed
  // at a glance and its shots trace back to it.
  Gun: "#facc15",
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

function waitingStatus(state: SimState, ship: Ship): string {
  if (ship.order?.kind === "haulGate" && ship.cargo === 0) return "Waiting: dock busy";
  const stored = MATERIALS.reduce((total, material) => total + homeStation(state).inventory[material], 0);
  return stored >= homeStation(state).storage.capacity ? "Waiting: storage full" : "Waiting: dock busy";
}

// The materials ticked for a ship on Mine for Station, as a suffix for its
// status. Everything ticked reads as plain "Mining", and nothing ticked has
// nothing to list.
function mineList(ship: Ship): string | null {
  if (ship.defaultBehaviour !== "mine" || ship.mineMaterials.length === 0) return null;
  return ship.mineMaterials.length === MATERIALS.length ? "" : ` ${ship.mineMaterials.join(", ")}`;
}

// At the Dock on its own default: idle with nothing ticked, waiting when none
// of what is ticked has ore left in the home sector.
function idleMiner(state: SimState, ship: Ship): string {
  if (ship.mineMaterials.length === 0) return "Idle";
  const available = nearestMineableRock(ship, state.asteroids, state.sectors, state.gateProjects) !== null;
  return available ? "Idle" : `Waiting: no ${ship.mineMaterials.join(", ")}`;
}

function supplyStatus(state: SimState, ship: Ship): string | null {
  if (supplyQueueStatus(ship, supplyQueueLength(state)) !== "supplying") return null;
  if (ship.mineMaterials.length === 0) return idleMiner(state, ship);
  const missing = waitingForOre(state, ship);
  return missing.length > 0 ? `Waiting: no ${missing.join(", ")}` : `Supplying site: ${ship.mineMaterials.join(", ")}`;
}

// Unloading into the construction site reads as unloading even under an order,
// so the transfer can be watched.
export function intoSite(ship: Ship): boolean {
  return ship.state === "unloading" && ship.transfer?.destination === "constructionSite";
}

export function orderLabel(order: Order): string {
  return order.kind === "supplyBuild" ? "Order: supply construction site" : `Order: ${order.kind}`;
}

function cargoLabel(ship: Ship): string {
  const contents = cargoByMaterial(ship);
  const listed = MATERIALS.filter((material) => contents[material] > 0);
  return listed.length > 1
    ? listed.map((material) => `${contents[material]} ${material}`).join(", ")
    : `${ship.cargo} ${listed[0] ?? ship.cargoMaterial ?? "ore"}`;
}

// One line saying what the ship is doing, for its hover box and panel.
export function shipStatus(state: SimState, ship: Ship): string {
  const { hold } = shipStats(ship.design);
  if (ship.state === "loading") {
    const starting = ship.transfer?.startingCargo ?? 0;
    const amount = ship.transfer?.amount ?? hold;
    return `Loading ${ship.cargo - starting}/${amount}`;
  }
  if (ship.state === "gateUnloading") {
    const starting = ship.transfer?.startingCargo ?? hold;
    const amount = ship.transfer?.amount ?? starting;
    return `Unloading ${starting - ship.cargo}/${amount}`;
  }
  if (ship.state === "waiting" || (ship.state === "berthing" && ship.berth === null)) return waitingStatus(state, ship);
  if (intoSite(ship)) return "Unloading into the construction site";
  if (ship.order) return orderLabel(ship.order);
  const supplying = supplyStatus(state, ship);
  if (supplying) return supplying;
  const route = ship.haulRoute;
  const names = new Map(haulDestinations(state).map((stop) => [stop.id, stop.name]));
  const source = route ? names.get(route.from) ?? null : null;
  const destination = route ? names.get(route.to) ?? null : null;
  const cargoDestination = ship.cargo > 0 && ship.cargoMaterial && ship.cargoMaterial !== route?.material ? source : destination;
  switch (ship.state) {
    case "idle":
      if (!canMine(ship.design)) return `Idle: ${missing(ship.design)}`;
      return ship.defaultBehaviour === "mine" ? idleMiner(state, ship) : "Idle: no ore";
    case "outbound":
      return `Flying out to mine ${ship.cargoMaterial ?? "ore"}`;
    case "working":
      return `Mining${mineList(ship) ?? ` ${ship.cargoMaterial ?? "ore"}`}`;
    case "homebound":
      if (ship.defaultBehaviour === "supply") return `Flying to the construction site${ship.cargo > 0 ? ` with ${cargoLabel(ship)}` : ""}`;
      return `Flying home with ${cargoLabel(ship)}`;
    case "unloading":
      return "Unloading";
    case "berthing":
      return "Docking";
    case "moving":
      return "Moving";
    case "holding":
      // A waiting supply ship is parked on a spot beside the Dock, so this asks
      // whether it is at Home rather than where exactly it stopped.
      {
        const supplyQueueLength = state.supplyStation === 0 ? homeStation(state).buildQueue.length
          : stationById(state, state.supplyStation)?.buildQueue.length ?? homeStation(state).buildQueue.length;
        if (supplyQueueStatus(ship, supplyQueueLength) === "waiting"
          && ship.sectorId === homeStation(state).sectorId) return "Waiting at Home: nothing queued";
        return "Holding";
      }
    case "docking":
      return "Docking with carrier";
    case "docked":
      return "Inside carrier";
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
      return `Unloading ${ship.cargo}/${shipStats(ship.design).hold} ${ship.cargoMaterial ?? route?.material ?? "cargo"}`;
    case "haulReturning":
    case "haulJumpingReturning":
      return `Returning to ${source ?? "station"}`;
    case "haulWaitingSource":
      return `Waiting at ${source ?? "station"}: no ${route?.material ?? "cargo"}`;
    case "haulWaitingFull":
      return `Waiting at ${ship.cargo > 0 ? cargoDestination : source}: ${cargoDestination ?? destination ?? "station"} full`;
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
  const contents = cargoByMaterial(ship);
  const listed = MATERIALS.filter((material) => contents[material] > 0);
  const cargo = listed.length > 1
    ? `${listed.map((material) => `${material} ${contents[material]}`).join(", ")} / ${hold}`
    : `${ship.cargo}/${hold}${listed[0] ? ` ${listed[0]}` : ""}`;
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
import { homeStation } from "sim";
