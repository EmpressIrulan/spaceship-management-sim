import { createInitialState, tick, type Material, type Vec } from "sim";
import { fitCamera, panBy, type Camera, type Viewport } from "./camera";
import { INITIAL_CLOCK, gameSeconds } from "./speed";
import { keyPan } from "./selection";
import { emptyDraft, emptyView, type ShipDraft } from "./shipyard";
import { loadBlueprints, resolveBlueprintStore, type Blueprint } from "./blueprints";
import type { PendingGate } from "./sectors";
import { createRenderer } from "./renderer";
import { installPanels } from "./panels";
import { installContextMenu } from "./context-menu";
import { installBuildMenu } from "./build-menu";
import { installShipMenu } from "./ship-menu";
import { installInput, mousePoint } from "./input";
import { renderSpeedControls } from "./menu-rendering";
import type { DeleteConfirmation } from "./storage";

const canvasEl = document.querySelector<HTMLCanvasElement>("#screen");
const boxEl = document.querySelector<HTMLElement>("#info");
const titleEl = document.querySelector<HTMLElement>("#info-title");
const lineEl = document.querySelector<HTMLElement>("#info-line");
const buildControlsEl = document.querySelector<HTMLElement>("#build-controls");
const buildMenuEl = document.querySelector<HTMLElement>("#build-menu");
const shipMenuEl = document.querySelector<HTMLElement>("#ship-menu");
const shipPanelEl = document.querySelector<HTMLElement>("#ship-panel");
const partTipEl = document.querySelector<HTMLElement>("#part-tip");
const sectorNameEl = document.querySelector<HTMLElement>("#sector-name");
const gateMenuEl = document.querySelector<HTMLElement>("#gate-menu");
const claimButtonEl = document.querySelector<HTMLButtonElement>("#claim-button");
const hintEl = document.querySelector<HTMLElement>("#hint");
const renameBoxEl = document.querySelector<HTMLInputElement>("#rename-box");
const infoActionEl = document.querySelector<HTMLButtonElement>("#info-action");
if (!claimButtonEl || !hintEl || !renameBoxEl || !infoActionEl) throw new Error("missing claim station controls");
const claimButton: HTMLButtonElement = claimButtonEl;
const hint: HTMLElement = hintEl;
const renameBox: HTMLInputElement = renameBoxEl;
const infoAction: HTMLButtonElement = infoActionEl;
const speedControlsEl = document.querySelector<HTMLElement>("#speed-controls");
const storagePanelEl = document.querySelector<HTMLElement>("#storage-panel");
if (!speedControlsEl || !canvasEl || !boxEl || !titleEl || !lineEl || !buildControlsEl || !buildMenuEl || !shipMenuEl || !shipPanelEl || !partTipEl || !gateMenuEl || !storagePanelEl) {
  throw new Error("missing #screen canvas or #info box");
}
const shipMenu: HTMLElement = shipMenuEl;
const shipPanelBox: HTMLElement = shipPanelEl;
const partTip: HTMLElement = partTipEl;
const canvas: HTMLCanvasElement = canvasEl;
const box: HTMLElement = boxEl;
const boxTitle: HTMLElement = titleEl;
const boxLine: HTMLElement = lineEl;
const buildControls: HTMLElement = buildControlsEl;
const buildMenu: HTMLElement = buildMenuEl;
const gateMenu: HTMLElement = gateMenuEl;
const speedControls: HTMLElement = speedControlsEl;
const storagePanel: HTMLElement = storagePanelEl;

const context = canvas.getContext("2d");
if (!context) {
  throw new Error("2d context unavailable");
}
const ctx: CanvasRenderingContext2D = context;

// ?seed=N replays a sector exactly; otherwise each load gets a fresh one.
const seedParam = new URLSearchParams(location.search).get("seed");
const seed = seedParam === null ? Date.now() % 2 ** 32 : Number(seedParam);

let state = createInitialState(seed);
const blueprintStore = resolveBlueprintStore(window);
const ui = {
  currentSector: 0,
  mapOpen: false,
  viewport: { width: 0, height: 0 } as Viewport,
  pointer: null as Vec | null,
  buildMenuOpen: false,
  renderedMenu: "",
  renderedSites: "",
  controlsHovered: false,
  selectedBuildSite: null as Vec | null,
  shipMenuBuilder: null as number | null,
  draft: emptyDraft() as ShipDraft,
  blueprints: loadBlueprints(blueprintStore) as Blueprint[],
  paintView: emptyView() as Camera,
  paintCanvas: null as HTMLCanvasElement | null,
  paintPointer: null as Vec | null,
  partHover: null as { at: Vec; source: "paint" | "thumb" } | null,
  stroking: null as Vec | null,
  paintPan: null as Vec | null,
  selectedShip: null as number | null,
  selectedShips: [] as number[],
  renderedPanel: "",
  heldKeys: new Set<string>(),
  pan: null as { last: Vec } | null,
  dragBox: null as { start: Vec; end: Vec; additive: boolean } | null,
  orderLines: null as { from: Vec[]; to: Vec; start: number } | null,
  pendingGate: null as PendingGate | null,
  pendingClaim: false,
  renamingSector: null as number | null,
  stickySite: null as number | null,
  infoHovered: false,
  clock: INITIAL_CLOCK,
  storagePanelOpen: false,
  deleteConfirmations: new Map<Material, DeleteConfirmation>(),
  camera: fitCamera({ width: 0, height: 0 }, []),
  lastTimeMs: performance.now()
};
export type UiState = typeof ui;
const closeStoragePanel = installPanels(ui, () => state, (next) => { state = next; }, storagePanel, shipPanelBox);
const closeBuildMenu = installBuildMenu(ui, () => state, (next) => { state = next; }, buildControls, buildMenu, (event) => mousePoint(canvas, event));
const shipMenuSystem = installShipMenu(ui, () => state, (next) => { state = next; }, shipMenu, shipPanelBox, blueprintStore);
const closeGateMenu = installContextMenu(ui, () => state, (next) => { state = next; }, canvas, gateMenu, claimButton, (event) => mousePoint(canvas, event));
installInput(ui, () => state, (next) => { state = next; }, { canvas, box, infoAction, renameBox, speedControls, storagePanel, ctx }, { closeStoragePanel, closeBuildMenu, closeGateMenu, openShipMenu: shipMenuSystem.openShipMenu, closeShipMenu: shipMenuSystem.closeShipMenu });

const draw = createRenderer(ui, () => state, { ctx, canvas, shipPanelBox, partTip, sectorNameEl, buildControls, box, boxTitle, boxLine, infoAction, buildMenu, claimButton, hint, renameBox, shipMenu, storagePanel, paintViewport: shipMenuSystem.paintViewport, paintPointAt: shipMenuSystem.paintPointAt });

function frame(nowMs: number): void {
  const dt = Math.max(0, (nowMs - ui.lastTimeMs) / 1000);
  ui.lastTimeMs = nowMs;
  const movement = keyPan(ui.heldKeys, dt);
  if (movement.x || movement.y) ui.camera = panBy(ui.camera, movement.x, movement.y);
  // Paused frames skip the tick, so selecting, ordering and the menus keep
  // working on a state that simply does not advance.
  const seconds = gameSeconds(ui.clock, dt);
  if (seconds > 0) state = tick(state, seconds);
  renderSpeedControls(speedControls, ui.clock);
  draw(nowMs / 1000);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
