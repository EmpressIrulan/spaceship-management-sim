import { availableModuleBuildSites, laserBeam, sectorInGateRange, shipSize } from "sim";
import { bodyOf, hoveredBody, screenToWorld, worldToScreen, type Camera, type Viewport } from "./camera";
import { cargoGauge, infoBox, sectorBox } from "./labels";
import { asteroidColor } from "./asteroid";
import { mapHit, mapLayout } from "./sectors";
import { drawMapOverlay } from "./map-rendering";
import { createShipDrawing } from "./ship-rendering";
import { shipSprite } from "./ships";
import { buildControlSize, buildControlsVisible, buildMenuItems, pointerInBuildArea } from "./building";

import { renderShipPanel, type ShipPanelContext } from "./ship-panel";
import { createOverlayDrawing } from "./overlay-rendering";
import { cellAt, designOf, designPartAt, draftPartAt, placedDesign, shipMenuView, type ShipDraft } from "./shipyard";
import { stationConnectors } from "./station-appearance";
import { createStationDrawing } from "./station-rendering";
import { renderStoragePanel } from "./storage-panel";
import type { UiState } from "./ui-state";
import type { Beam, Ship, SimState, Size, Vec } from "sim";

export interface RendererElements {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  shipPanelBox: HTMLElement;
  partTip: HTMLElement;
  sectorNameEl: HTMLElement | null;
  buildControls: HTMLElement;
  box: HTMLElement;
  boxTitle: HTMLElement;
  boxLine: HTMLElement;
  infoAction: HTMLButtonElement;
  buildMenu: HTMLElement;
  claimButton: HTMLButtonElement;
  hint: HTMLElement;
  renameBox: HTMLInputElement;
  shipMenu: HTMLElement;
  storagePanel: HTMLElement;
  paintViewport: () => Viewport;
  paintPointAt: (point: Vec) => Vec;
}

export function createRenderer(ui: UiState, getState: () => SimState, elements: RendererElements): (seconds: number) => void {
  const { ctx, canvas, shipPanelBox, partTip, sectorNameEl, buildControls, box, boxTitle, boxLine, infoAction,
    buildMenu, claimButton, hint, renameBox, shipMenu, storagePanel, paintViewport, paintPointAt } = elements;
function fillWorldRect(center: Vec, size: Size, color: string): void {
  const topLeft = worldToScreen(ui.camera, ui.viewport, {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
  });
  ctx.fillStyle = color;
  ctx.fillRect(topLeft.x, topLeft.y, size.width * ui.camera.zoom, size.height * ui.camera.zoom);
}

function strokeWorldRect(center: Vec, size: Size, color: string): void {
  const topLeft = worldToScreen(ui.camera, ui.viewport, {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
  });
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = color;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 2;
  ctx.strokeRect(topLeft.x, topLeft.y, size.width * ui.camera.zoom, size.height * ui.camera.zoom);
  ctx.restore();
}

const stationDrawing = createStationDrawing(ui, getState, ctx, fillWorldRect, strokeWorldRect);
const shipDrawing = createShipDrawing(ui, ctx);
const overlayDrawing = createOverlayDrawing(ui, ctx);

const GRID_ZOOM = 6;

function drawPaintCanvas(): void {
  const surface = ui.paintCanvas!;
  if (surface.width !== surface.clientWidth || surface.height !== surface.clientHeight) {
    surface.width = surface.clientWidth;
    surface.height = surface.clientHeight;
  }
  const g = surface.getContext("2d")!;
  const vp = paintViewport();
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#0f172a";
  g.fillRect(0, 0, vp.width, vp.height);
  const { design, origin } = placedDesign(ui.draft);
  if (design.width > 0) {
    const at = worldToScreen(ui.paintView, vp, origin);
    g.drawImage(shipSprite(design), at.x, at.y, design.width * ui.paintView.zoom, design.height * ui.paintView.zoom);
  }
  if (ui.paintView.zoom >= GRID_ZOOM) {
    const first = screenToWorld(ui.paintView, vp, { x: 0, y: 0 });
    const last = screenToWorld(ui.paintView, vp, { x: vp.width, y: vp.height });
    g.strokeStyle = "rgba(148,163,184,.25)";
    g.lineWidth = 1;
    g.beginPath();
    for (let x = Math.ceil(first.x); x <= last.x; x += 1) {
      const sx = Math.round(worldToScreen(ui.paintView, vp, { x, y: 0 }).x) + 0.5;
      g.moveTo(sx, 0);
      g.lineTo(sx, vp.height);
    }
    for (let y = Math.ceil(first.y); y <= last.y; y += 1) {
      const sy = Math.round(worldToScreen(ui.paintView, vp, { x: 0, y }).y) + 0.5;
      g.moveTo(0, sy);
      g.lineTo(vp.width, sy);
    }
    g.stroke();
  }
  if (ui.paintPointer) {
    const cell = cellAt(ui.paintView, vp, ui.paintPointer);
    const reach = ui.draft.tool === "fill" ? 0 : Math.floor(ui.draft.size / 2);
    const corner = worldToScreen(ui.paintView, vp, { x: cell.x - reach, y: cell.y - reach });
    const span = (2 * reach + 1) * ui.paintView.zoom;
    g.strokeStyle = ui.draft.tool === "erase" ? "#f87171" : "#facc15";
    g.lineWidth = 2;
    g.strokeRect(corner.x, corner.y, span, span);
  }
}

// The name of the part under the mouse, or null when it is not over a design.
function hoveredPart(hover: NonNullable<typeof ui.partHover>): string | null {
  if (hover.source === "paint") {
    if (!ui.paintCanvas || ui.shipMenuBuilder === null) return null;
    return draftPartAt(ui.draft, cellAt(ui.paintView, paintViewport(), paintPointAt(hover.at)));
  }
  const thumb = shipPanelBox.querySelector<HTMLElement>(".ship-thumb");
  const ship = getState().ships.find((candidate) => candidate.id === ui.selectedShip);
  if (!thumb || !ship || shipPanelBox.hidden) return null;
  const bounds = thumb.getBoundingClientRect();
  return designPartAt(ship.design, {
    x: (hover.at.x - bounds.left) / bounds.width,
    y: (hover.at.y - bounds.top) / bounds.height,
  });
}

function renderPartTip(): void {
  const name = ui.partHover && hoveredPart(ui.partHover);
  partTip.hidden = !ui.partHover || name === null;
  if (!ui.partHover || name === null) return;
  partTip.textContent = name;
  partTip.style.left = `${ui.partHover.at.x + 14}px`;
  partTip.style.top = `${ui.partHover.at.y + 14}px`;
}

function draw(seconds: number): void {
  overlayDrawing.drawBackdrop(ui.currentSector);
  overlayDrawing.drawOrderFeedback(seconds);

  const sectorRocks = getState().asteroids.filter((asteroid) => asteroid.sectorId === ui.currentSector);
  const sectorShips = getState().ships.filter((ship) => ship.sectorId === ui.currentSector && ship.state !== "jumpingOut" && ship.state !== "jumpingHome");
  const gate = getState().sectors[ui.currentSector]!.gate;
  const legacyGateVisible = gate.to !== ui.currentSector;
  const gateScreen = worldToScreen(ui.camera, ui.viewport, gate.position);
  if (legacyGateVisible) {
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(gateScreen.x - gate.size.width * ui.camera.zoom / 2, gateScreen.y - gate.size.height * ui.camera.zoom / 2, gate.size.width * ui.camera.zoom, gate.size.height * ui.camera.zoom);
  }
  for (const project of getState().gateProjects) {
    const end = project.ends.find((candidate) => candidate.sectorId === ui.currentSector);
    if (!end) continue;
    if (project.complete) fillWorldRect(end.position, { width: 24, height: 24 }, "#22d3ee");
    else strokeWorldRect(end.position, { width: 24, height: 24 }, "#22d3ee");
  }
  for (const asteroid of sectorRocks) {
    fillWorldRect(asteroid.position, asteroid.size, asteroidColor(asteroid.material, asteroid.rich));
  }
  for (const connector of ui.currentSector === 0 ? stationConnectors(getState().station.modules) : []) {
    stationDrawing.drawStationConnector(connector.from, connector.to);
  }
  for (const module of ui.currentSector === 0 ? getState().station.modules : []) {
    stationDrawing.drawStationModule(module);
  }
  if (ui.currentSector === 0) stationDrawing.drawConstructionSite();
  const construction = getState().station.construction;
  if (ui.currentSector === 0 && construction) {
    strokeWorldRect(construction.position, construction.size, "#cbd5e1");
  }
  for (const site of getState().claimSites) {
    if (site.sectorId === ui.currentSector) stationDrawing.drawClaimSite(site);
  }

  for (const ship of sectorShips) {
    const beam = laserBeam(getState(), ship);
    if (beam) shipDrawing.drawLaser(beam, seconds);
  }

  for (const ship of sectorShips) {
    shipDrawing.drawShip(ship);
    if (ui.selectedShips.includes(ship.id)) shipDrawing.drawSelectionRing(ship.position, shipSize(ship.design));

    const gauge = cargoGauge(ship);
    if (gauge) shipDrawing.drawGauge(ship.position, gauge, shipSize(ship.design));
  }
  const panelContext: ShipPanelContext = renderShipPanel(getState(), shipPanelBox, { selectedShips: ui.selectedShips, selectedShip: ui.selectedShip, renderedPanel: ui.renderedPanel });
  ui.selectedShips = panelContext.selectedShips;
  ui.selectedShip = panelContext.selectedShip;
  ui.renderedPanel = panelContext.renderedPanel;
  renderStoragePanel(storagePanel, getState(), ui.storagePanelOpen, performance.now(), ui.deleteConfirmations);
  renderPartTip();

  if (sectorNameEl) sectorNameEl.textContent = getState().sectors[ui.currentSector]!.name;
  const builtDestination = getState().gateProjects.find((project) => project.complete && project.ends.some((end) => end.sectorId === ui.currentSector))
    ?.ends.find((end) => end.sectorId !== ui.currentSector)?.sectorId;
  const gateDestination = builtDestination ?? (legacyGateVisible ? gate.to : null);
  canvas.setAttribute("aria-label", ui.mapOpen
    ? mapLayout(getState(), ui.viewport).circles.map((circle) => `${circle.name}: ${circle.ships} ships${ui.pendingGate ? `, ${circle.id === ui.pendingGate.sectorId ? "current sector" : sectorInGateRange(ui.pendingGate.sectorId, circle.id) ? "in gate range" : "out of gate range"}` : ""}`).join("; ")
    : `Sector ${getState().sectors[ui.currentSector]!.name}: ${sectorRocks.length} asteroids, ${ui.currentSector === 0 ? "station present" : "no station"}${gateDestination === null ? "" : `, gate to ${getState().sectors[gateDestination]!.name}`}`);
  // Re-checked every frame, so zooming under a still pointer updates it too,
  // and the box closes by itself when a hovered asteroid runs out.
  let hovered = ui.mapOpen ? null : hoveredBody(getState(), ui.camera, ui.viewport, ui.pointer, ui.currentSector);
  if (hovered?.kind === "claimSite") ui.stickySite = hovered.id;
  else if (ui.infoHovered && ui.stickySite !== null && !ui.mapOpen) hovered = { kind: "claimSite", id: ui.stickySite };
  else ui.stickySite = null;
  // A + cell sits above the canvas, so a ship beside it would never hear the
  // click. While the pointer is on a ship, the cells let clicks through.
  buildControls.classList.toggle("over-ship", hovered?.kind === "ship");
  const info = infoBox(getState(), hovered);
  box.hidden = info === null;
  if (info === null) ui.infoHovered = false;
  box.style.pointerEvents = info?.action ? "auto" : "none";
  infoAction.hidden = !info?.action;
  if (info?.action) { infoAction.textContent = info.action.label; infoAction.dataset.site = String(info.action.siteId); }
  const body = hovered && bodyOf(getState(), hovered);
  if (body && info) {
    const anchor = worldToScreen(ui.camera, ui.viewport, {
      x: body.position.x + body.size.width / 2,
      y: body.position.y - body.size.height / 2,
    });
    box.style.left = `${anchor.x + (info.action ? 0 : 8)}px`;
    box.style.top = `${anchor.y}px`;
    boxTitle.textContent = info.title;
    boxLine.textContent = info.line;
  }
  if (legacyGateVisible && ui.pointer && Math.hypot(ui.pointer.x - gateScreen.x, ui.pointer.y - gateScreen.y) < Math.max(14, gate.size.width * ui.camera.zoom / 2)) {
    const jumping = getState().ships.some((ship) => ship.sectorId === ui.currentSector && (ship.state === "jumpingOut" || ship.state === "jumpingHome"));
    box.hidden = false; boxTitle.textContent = "Gate"; boxLine.textContent = jumping ? "Jumping" : `Gate to ${getState().sectors[gate.to]!.name}`;
    box.style.left = `${gateScreen.x + 16}px`; box.style.top = `${gateScreen.y}px`;
  }
  if (ui.mapOpen) {
    // The map covers the sector, so only its circles have anything to show.
    const layout = mapLayout(getState(), ui.viewport);
    const id = ui.pointer ? mapHit(layout, ui.pointer) : null;
    const sectorInfo = id === null ? null : sectorBox(getState(), id);
    box.hidden = sectorInfo === null;
    if (sectorInfo && id !== null) {
      const circle = layout.circles[id]!;
      box.style.left = `${circle.center.x + circle.radius + 8}px`;
      box.style.top = `${circle.center.y - circle.radius}px`;
      boxTitle.textContent = sectorInfo.title;
      boxLine.textContent = sectorInfo.line;
    }
  }

  const sites = availableModuleBuildSites(getState());
  const sitesKey = JSON.stringify(sites);
  if (sitesKey !== ui.renderedSites) {
    ui.renderedSites = sitesKey;
    buildControls.replaceChildren(...sites.map((site) => {
      const button = document.createElement("button");
      button.className = "build-toggle";
      button.dataset.x = String(site.x);
      button.dataset.y = String(site.y);
      button.setAttribute("aria-label", `Add station module at ${site.x}, ${site.y}`);
      const symbol = document.createElement("span");
      symbol.textContent = "+";
      button.append(symbol);
      return button;
    }));
  }
  const control = buildControlSize(ui.camera.zoom);
  buildControls.style.setProperty("--cell", `${control.cell}px`);
  buildControls.style.setProperty("--glyph", `${control.glyph}px`);
  for (const button of buildControls.querySelectorAll<HTMLButtonElement>("button[data-x]")) {
    const screen = worldToScreen(ui.camera, ui.viewport, {
      x: Number(button.dataset.x),
      y: Number(button.dataset.y),
    });
    button.style.left = `${screen.x - control.cell / 2}px`;
    button.style.top = `${screen.y - control.cell / 2}px`;
  }
  const inBuildArea = ui.pointer !== null
    && pointerInBuildArea(getState(), screenToWorld(ui.camera, ui.viewport, ui.pointer));
  buildControls.hidden = ui.currentSector !== 0 || !buildControlsVisible(inBuildArea, ui.controlsHovered);
  if (ui.buildMenuOpen && ui.selectedBuildSite) {
    const screen = worldToScreen(ui.camera, ui.viewport, ui.selectedBuildSite);
    buildMenu.style.left = `${Math.round(screen.x + 20)}px`;
    buildMenu.style.top = `${Math.round(screen.y - 20)}px`;
  }
  if (ui.shipMenuBuilder !== null) {
    drawPaintCanvas();
    const view = shipMenuView(getState(), ui.shipMenuBuilder, ui.draft);
    const stats = shipMenu.querySelector<HTMLElement>(".stats")!;
    const text = `Pixels ${view.pixels}\nSpeed ${view.stats.speed}\nHold ${view.stats.hold}\nMining time ${view.stats.miningTime}`;
    if (stats.textContent !== text) stats.textContent = text;
    const cost = shipMenu.querySelector<HTMLElement>(".cost")!;
    const costKey = JSON.stringify([view.parts, view.buildTime, view.materials]);
    if (cost.dataset.key !== costKey) {
      cost.dataset.key = costKey;
      cost.replaceChildren(document.createTextNode(`${view.parts}\nBuild time ${view.buildTime}\nCost `));
      view.materials.forEach((material, index) => {
        if (index > 0) cost.append(" ");
        const total = document.createElement("span");
        total.textContent = `${material.amount} ${material.material}`;
        total.classList.toggle("short", material.short);
        cost.append(total);
      });
    }
    shipMenu.querySelector<HTMLButtonElement>(".build")!.disabled = !view.canBuild;
    const blueprintName = shipMenu.querySelector<HTMLInputElement>(".blueprint-name")!;
    shipMenu.querySelector<HTMLButtonElement>("button[data-blueprint-save]")!.disabled =
      blueprintName.value.trim() === "" || designOf(ui.draft).width === 0;
  }
  const menuItems = buildMenuItems(getState());
  const menuKey = JSON.stringify(menuItems);
  if (menuKey !== ui.renderedMenu) {
    ui.renderedMenu = menuKey;
    buildMenu.replaceChildren(...menuItems.map((item) => {
      const button = document.createElement("button");
      button.dataset.module = item.type;
      button.disabled = item.disabled;
      button.title = item.title;
      const name = document.createElement("span");
      name.textContent = item.type;
      const cost = document.createElement("span");
      cost.textContent = item.cost;
      button.append(name, cost);
      return button;
    }));
  }

  claimButton.hidden = !ui.mapOpen;
  hint.hidden = !ui.pendingClaim;
  hint.textContent = ui.mapOpen ? "Pick the sector for the claim station" : "Click a spot for the construction site. Esc cancels.";
  renameBox.hidden = ui.renamingSector === null || !ui.mapOpen;
  if (renameBox.hidden) ui.renamingSector = null;

  if (ui.mapOpen) drawMapOverlay(ui, getState(), ctx, renameBox);
}



  return draw;
}
