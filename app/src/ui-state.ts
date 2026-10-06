import type { Material, Vec } from "sim";
import { fitCamera, type Camera, type Viewport } from "./camera";
import type { PendingGate } from "./sectors";
import { INITIAL_CLOCK, type Clock } from "./speed";
import { emptyDraft, emptyView, type ShipDraft } from "./shipyard";
import type { Blueprint } from "./blueprints";
import type { DeleteConfirmation } from "./storage";

export interface UiState {
  currentSector: number;
  mapOpen: boolean;
  viewport: Viewport;
  pointer: Vec | null;
  buildMenuOpen: boolean;
  renderedMenu: string;
  renderedSites: string;
  controlsHovered: boolean;
  selectedBuildSite: Vec | null;
  shipMenuBuilder: number | null;
  draft: ShipDraft;
  blueprints: Blueprint[];
  paintView: Camera;
  paintCanvas: HTMLCanvasElement | null;
  paintPointer: Vec | null;
  partHover: { at: Vec; source: "paint" | "thumb" } | null;
  stroking: Vec | null;
  paintPan: Vec | null;
  selectedShip: number | null;
  selectedShips: number[];
  renderedPanel: string;
  routeRefusalMessage: string | null;
  heldKeys: Set<string>;
  pan: { last: Vec } | null;
  dragBox: { start: Vec; end: Vec; additive: boolean } | null;
  orderLines: { from: Vec[]; to: Vec; start: number } | null;
  pendingGate: PendingGate | null;
  // Set from the map's "Build station" button: the next canvas click places a
  // construction site in the sector it lands in.
  pendingStation: boolean;
  renamingSector: number | null;
  stickyQueuedBuild: Vec | null;
  // The ghost whose Cancel control the pointer is on, so the ghosts that would
  // go with it can be highlighted. Position, not index: the queue shifts.
  cancelHoveredBuild: Vec | null;
  infoHovered: boolean;
  clock: Clock;
  storagePanelOpen: boolean;
  stationPanelId: number | null;
  removeStationConfirmation: number | null;
  renderedStationPanel: string;
  deleteConfirmations: Map<Material, DeleteConfirmation>;
  camera: Camera;
  lastTimeMs: number;
}

export function createUiState(blueprints: Blueprint[]): UiState {
  return {
    currentSector: 0,
    mapOpen: false,
    viewport: { width: 0, height: 0 },
    pointer: null,
    buildMenuOpen: false,
    renderedMenu: "",
    renderedSites: "",
    controlsHovered: false,
    selectedBuildSite: null,
    shipMenuBuilder: null,
    draft: emptyDraft(),
    blueprints,
    paintView: emptyView(),
    paintCanvas: null,
    paintPointer: null,
    partHover: null,
    stroking: null,
    paintPan: null,
    selectedShip: null,
    selectedShips: [],
    renderedPanel: "",
    routeRefusalMessage: null,
    heldKeys: new Set<string>(),
    pan: null,
    dragBox: null,
    orderLines: null,
    pendingGate: null,
    pendingStation: false,
    renamingSector: null,
    stickyQueuedBuild: null,
    cancelHoveredBuild: null,
    infoHovered: false,
    clock: INITIAL_CLOCK,
    storagePanelOpen: false,
    stationPanelId: null,
    removeStationConfirmation: null,
    renderedStationPanel: "",
    deleteConfirmations: new Map<Material, DeleteConfirmation>(),
    camera: fitCamera({ width: 0, height: 0 }, []),
    lastTimeMs: performance.now(),
  };
}
