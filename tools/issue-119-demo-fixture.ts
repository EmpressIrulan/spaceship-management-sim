// Recording-only fixture; injected into a separate demo bundle, never the game build.
import { BUILDER_SIZE, MATERIALS, STORAGE_CAPACITY, STORAGE_SIZE, cargoTransferSeconds, createInitialState, shipBuildCost, tick, type ShipDesign, type SimState } from "sim";
import type { UiState } from "../app/src/ui-state";
import { openStoragePanel } from "../app/src/storage-panel";

export const DEMO_MINER: ShipDesign = { width: 2, height: 2, slots: ["Engine", "Laser", "Storage", "Storage"] };
export const DEMO_HULL: ShipDesign = { width: 2, height: 2, slots: ["Engine", "Hull", "Hull", "Hull"] };

export function installIssue119Demo(ui: UiState, getState: () => SimState, setState: (state: SimState) => void): void {
  const designs = { miner: DEMO_MINER, hull: DEMO_HULL };
  function setup(stock: { miner: number; hull: number }, shortage = 0): void {
    const state = createInitialState(17);
    const station = state.stations[0]!;
    station.modules.push({ type: "Builder", position: { x: 0, y: -40 }, size: { ...BUILDER_SIZE } });
    station.inventory = Object.fromEntries(MATERIALS.map((material) => [material,
      shipBuildCost(DEMO_MINER)[material] * stock.miner + shipBuildCost(DEMO_HULL)[material] * stock.hull,
    ])) as typeof station.inventory;
    station.inventory.Metal -= shortage;
    const stores = Math.ceil(MATERIALS.reduce((sum, material) => sum + station.inventory[material], 0) / STORAGE_CAPACITY);
    station.storage.capacity = Math.max(1, stores) * STORAGE_CAPACITY;
    for (let i = 1; i < stores; i++) station.modules.push({ type: "Storage", position: { x: 80 + i * 40, y: 0 }, size: { ...STORAGE_SIZE } });
    state.ships = [];
    state.asteroids = [];
    state.respawns = [];
    setState(state);
    ui.clock = { speed: 1, paused: true };
    ui.camera = { center: { x: 20, y: 0 }, zoom: 3 };
    ui.pointer = null;
    ui.shipMenuBuilder = null;
    document.querySelector<HTMLElement>("#ship-menu")!.hidden = true;
    openStoragePanel(document.querySelector<HTMLElement>("#storage-panel")!, state, () => { ui.storagePanelOpen = true; });
    ui.stationPanelId = null;
    ui.selectedShips = [];
    ui.selectedShip = null;
    ui.renderedPanel = "";
  }
  Object.assign(window, { issue119Demo: {
    setup, designs,
    snapshot: () => structuredClone(getState()),
    advance: (seconds: number) => setState(tick(getState(), seconds)),
    deliver: (amount: number) => {
      // A loaded miner already berthed at Home uses the normal unloading tick.
      const state = getState();
      const initialShip = createInitialState(17).ships[0]!;
      const station = state.stations[0]!;
      const ship = { ...initialShip, id: state.nextShipId, state: "unloading" as const,
        design: { width: 3, height: 6, slots: [...Array(16).fill("Storage"), "Engine", "Engine"] } as ShipDesign,
        position: { ...station.dock.position }, timer: cargoTransferSeconds(amount), cargo: amount,
        cargoByMaterial: { Metal: amount, Ice: 0 }, cargoMaterial: "Metal" as const,
        defaultBehaviour: "none" as const, target: null, leg: null, berth: null,
        transfer: { startingCargo: amount, amount },
      };
      setState({ ...state, nextShipId: state.nextShipId + 1, ships: [...state.ships, ship] });
    },
  } });
}
