import { createInitialState, tick, renameStation, removeStation, stationById } from "sim";
import { panBy } from "./camera";
import { gameSeconds } from "./speed";
import { keyPan } from "./selection";
import { loadBlueprints, resolveBlueprintStore } from "./blueprints";
import { createRenderer } from "./renderer";
import { installPanels } from "./panels";
import { installContextMenu } from "./context-menu";
import { installBuildMenu } from "./build-menu";
import { installShipMenu } from "./ship-menu";
import { openClaimNaming } from "./claim-naming";
import { installInput, mousePoint } from "./input";
import { renderSpeedControls } from "./menu-rendering";
import { createUiState } from "./ui-state";

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
const stationButtonEl = document.querySelector<HTMLButtonElement>("#station-button");
const hintEl = document.querySelector<HTMLElement>("#hint");
const renameBoxEl = document.querySelector<HTMLInputElement>("#rename-box");
const infoActionEl = document.querySelector<HTMLButtonElement>("#info-action");
if (!stationButtonEl || !hintEl || !renameBoxEl || !infoActionEl) throw new Error("missing build station controls");
const stationButton: HTMLButtonElement = stationButtonEl;
const hint: HTMLElement = hintEl;
const renameBox: HTMLInputElement = renameBoxEl;
const infoAction: HTMLButtonElement = infoActionEl;
const speedControlsEl = document.querySelector<HTMLElement>("#speed-controls");
const storagePanelEl = document.querySelector<HTMLElement>("#storage-panel");
const stationPanelEl = document.querySelector<HTMLElement>("#station-panel");
if (!speedControlsEl || !canvasEl || !boxEl || !titleEl || !lineEl || !buildControlsEl || !buildMenuEl || !shipMenuEl || !shipPanelEl || !partTipEl || !gateMenuEl || !storagePanelEl || !stationPanelEl) {
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
const stationPanel: HTMLElement = stationPanelEl;

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
const ui = createUiState(loadBlueprints(blueprintStore));
stationPanel.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const id = Number(target.closest<HTMLButtonElement>("button[data-station-rename],button[data-station-remove]")?.dataset.stationRename ?? target.closest<HTMLButtonElement>("button[data-station-remove]")?.dataset.stationRemove);
  if (!Number.isInteger(id)) return;
  if (target.closest("button[data-station-rename]")) {
    const name = stationPanel.querySelector<HTMLInputElement>("input[name=station-name]")?.value ?? "";
    state = renameStation(state, id, name);
    ui.removeStationConfirmation = null;
  } else if (ui.removeStationConfirmation === id) {
    state = removeStation(state, id);
    ui.stationPanelId = null;
    ui.removeStationConfirmation = null;
  } else ui.removeStationConfirmation = id;
});
const closeStoragePanel = installPanels(ui, () => state, (next) => { state = next; }, storagePanel, shipPanelBox);
const closeBuildMenu = installBuildMenu(ui, () => state, (next) => { state = next; }, buildControls, buildMenu, (event) => mousePoint(canvas, event));
const shipMenuSystem = installShipMenu(ui, () => state, (next) => { state = next; }, shipMenu, shipPanelBox, blueprintStore);
const closeGateMenu = installContextMenu(ui, () => state, (next) => { state = next; }, canvas, gateMenu, stationButton, (event) => mousePoint(canvas, event));
const startRename = installInput(ui, () => state, (next) => { state = next; }, { canvas, box, infoAction, renameBox, speedControls, storagePanel, buildControls, ctx }, { closeStoragePanel, closeBuildMenu, closeGateMenu, openShipMenu: shipMenuSystem.openShipMenu, closeShipMenu: shipMenuSystem.closeShipMenu });

const draw = createRenderer(ui, () => state, { ctx, canvas, shipPanelBox, partTip, sectorNameEl, buildControls, box, boxTitle, boxLine, infoAction, buildMenu, stationButton, hint, renameBox, shipMenu, storagePanel, stationPanel, paintViewport: shipMenuSystem.paintViewport, paintPointAt: shipMenuSystem.paintPointAt });

function frame(nowMs: number): void {
  const dt = Math.max(0, (nowMs - ui.lastTimeMs) / 1000);
  ui.lastTimeMs = nowMs;
  const movement = keyPan(ui.heldKeys, dt);
  if (movement.x || movement.y) ui.camera = panBy(ui.camera, movement.x, movement.y);
  // Paused frames skip the tick, so selecting, ordering and the menus keep
  // working on a state that simply does not advance.
  const seconds = gameSeconds(ui.clock, dt);
  if (seconds > 0) {
    state = tick(state, seconds);
    openClaimNaming(ui, state.finishedClaims, startRename);
  }
  renderSpeedControls(speedControls, ui.clock);
  draw(nowMs / 1000);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
