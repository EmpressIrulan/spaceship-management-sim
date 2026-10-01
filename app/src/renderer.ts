import {
  BERTH_PAD_SIZE, BUILDER_SIZE, CLAIM_MODULE_COST, CLAIM_SITE_SIZE, DOCK_SIZE, STORAGE_SIZE,
  availableModuleBuildSites, claimSiteSlots, dockBerths, laserBeam, sectorInGateRange, shipSize,
  type Beam, type Ship, type SimState, type Size, type StationModule, type Vec,
} from "sim";
import { bodyOf, hoveredBody, screenToWorld, worldToScreen, type Camera, type Viewport } from "./camera";
import { cargoGauge, infoBox, sectorBox, type Gauge } from "./labels";
import { asteroidColor } from "./asteroid";
import { mapHit, mapLayout, renameLabel, sectorBackdrop } from "./sectors";
import { LASER_COLOR, flickerPixels, laserPulse } from "./laser";
import { buildControlSize, buildControlsVisible, buildMenuItems, pointerInBuildArea } from "./building";
import { shipSprite } from "./ships";
import { renderShipPanel, type ShipPanelContext } from "./ship-panel";
import { orderLineAlpha } from "./selection";
import { cellAt, designOf, designPartAt, draftPartAt, placedDesign, shipMenuView, type ShipDraft } from "./shipyard";
import { moduleAppearance, stationConnectors } from "./station-appearance";
import { renderStoragePanel } from "./storage-panel";
import type { UiState } from "./main";

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

function drawStationConnector(from: Vec, to: Vec): void {
  const start = worldToScreen(ui.camera, ui.viewport, from);
  const end = worldToScreen(ui.camera, ui.viewport, to);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = Math.max(4, 7 * ui.camera.zoom);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = Math.max(1, 2 * ui.camera.zoom);
  ctx.stroke();
  ctx.restore();
}

// The Dock's pads, marked whether or not a ship is on them. Called with the
// canvas already translated to the Dock's centre.
function drawBerthPads(dock: Vec): void {
  const side = BERTH_PAD_SIZE * ui.camera.zoom;
  ctx.save();
  ctx.strokeStyle = moduleAppearance("Dock").accent;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(1, ui.camera.zoom);
  ctx.setLineDash([Math.max(2, 3 * ui.camera.zoom), Math.max(2, 2 * ui.camera.zoom)]);
  for (const pad of dockBerths(dock)) {
    ctx.strokeRect((pad.x - dock.x) * ui.camera.zoom - side / 2, (pad.y - dock.y) * ui.camera.zoom - side / 2, side, side);
  }
  ctx.restore();
}

function drawStationModule(module: StationModule): void {
  const center = worldToScreen(ui.camera, ui.viewport, module.position);
  const width = module.size.width * ui.camera.zoom;
  const height = module.size.height * ui.camera.zoom;
  const appearance = moduleAppearance(module.type);
  const detailWidth = Math.max(1.5, 2 * ui.camera.zoom);

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.fillStyle = "#1e293b";
  ctx.strokeStyle = appearance.accent;
  ctx.lineWidth = Math.max(1.5, 2 * ui.camera.zoom);
  ctx.beginPath();
  ctx.ellipse(0, 0, width * 0.47, height * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (appearance.silhouette === "open-bay") {
    ctx.fillStyle = "#020617";
    ctx.fillRect(-width * 0.23, -height * 0.17, width * 0.46, height * 0.42);
    ctx.strokeStyle = appearance.accent;
    ctx.lineWidth = detailWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-width * 0.32, height * 0.28);
    ctx.lineTo(-width * 0.32, -height * 0.1);
    ctx.lineTo(-width * 0.18, -height * 0.3);
    ctx.moveTo(width * 0.32, height * 0.28);
    ctx.lineTo(width * 0.32, -height * 0.1);
    ctx.lineTo(width * 0.18, -height * 0.3);
    ctx.stroke();
  } else if (appearance.silhouette === "tank-cluster") {
    for (const x of [-0.22, 0, 0.22]) {
      ctx.fillStyle = x === 0 ? appearance.accent : "#475569";
      ctx.strokeStyle = appearance.accent;
      ctx.lineWidth = Math.max(1, ui.camera.zoom);
      ctx.beginPath();
      ctx.ellipse(width * x, 0, width * 0.14, height * 0.29, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = appearance.accent;
    ctx.lineWidth = detailWidth;
    ctx.lineCap = "square";
    ctx.beginPath();
    ctx.moveTo(-width * 0.28, height * 0.28);
    ctx.lineTo(-width * 0.28, -height * 0.28);
    ctx.lineTo(width * 0.24, -height * 0.28);
    ctx.lineTo(width * 0.24, -height * 0.14);
    ctx.moveTo(-width * 0.28, -height * 0.08);
    ctx.lineTo(width * 0.2, height * 0.28);
    ctx.moveTo(width * 0.24, -height * 0.14);
    ctx.lineTo(width * 0.34, -height * 0.02);
    ctx.stroke();
    ctx.fillStyle = appearance.accent;
    ctx.beginPath();
    ctx.arc(width * 0.34, height * 0.04, Math.max(1.5, width * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }
  if (module.type === "Dock") drawBerthPads(module.position);
  ctx.restore();
}

// Ships carry ore here and Home builds from it. Always drawn, since Home has
// one from the start.
function drawConstructionSite(): void {
  const { position, size } = getState().station.constructionSite;
  const left = worldToScreen(ui.camera, ui.viewport, { x: position.x - size.width / 2, y: position.y - size.height / 2 });
  const right = worldToScreen(ui.camera, ui.viewport, { x: position.x + size.width / 2, y: position.y + size.height / 2 });
  fillWorldRect(position, size, "rgba(245,158,11,.25)");
  strokeWorldRect(position, size, "#f59e0b");
  ctx.save();
  ctx.strokeStyle = "rgba(245,158,11,.6)";
  ctx.lineWidth = Math.max(1, ui.camera.zoom);
  ctx.beginPath();
  ctx.moveTo(left.x, left.y); ctx.lineTo(right.x, right.y);
  ctx.moveTo(right.x, left.y); ctx.lineTo(left.x, right.y);
  ctx.stroke();
  ctx.restore();
}

// The slot being supplied fills as materials arrive, and is solid while it builds.
function supplyFraction(site: SimState["claimSites"][number]): number {
  if (site.timer !== null) return 1;
  const cost = CLAIM_MODULE_COST.Metal + CLAIM_MODULE_COST.Ice;
  return (site.delivered.Metal + site.delivered.Ice) / cost;
}

function drawClaimSite(site: SimState["claimSites"][number]): void {
  const size = { Dock: DOCK_SIZE, Storage: STORAGE_SIZE, Builder: BUILDER_SIZE };
  claimSiteSlots(site).forEach((slot, index) => {
    if (slot.built) { drawStationModule({ type: slot.type, position: slot.position, size: size[slot.type] }); return; }
    strokeWorldRect(slot.position, size[slot.type], "#cbd5e1");
    if (index !== site.stage) return;
    const height = size[slot.type].height * supplyFraction(site);
    fillWorldRect({ x: slot.position.x, y: slot.position.y + (size[slot.type].height - height) / 2 }, { width: size[slot.type].width, height }, "rgba(148,163,184,.55)");
  });
}

// Edges are rounded so the image lands on whole screen pixels at any zoom.
function drawShip(ship: Ship): void {
  const size = shipSize(ship.design);
  const a = worldToScreen(ui.camera, ui.viewport, { x: ship.position.x - size.width / 2, y: ship.position.y - size.height / 2 });
  const b = worldToScreen(ui.camera, ui.viewport, { x: ship.position.x + size.width / 2, y: ship.position.y + size.height / 2 });
  const x = Math.round(a.x);
  const y = Math.round(a.y);
  ctx.drawImage(shipSprite(ship.design), x, y, Math.max(1, Math.round(b.x) - x), Math.max(1, Math.round(b.y) - y));
}

function drawSelectionRing(center: Vec, size: Size): void {
  const screen = worldToScreen(ui.camera, ui.viewport, center);
  const radius = Math.hypot(size.width, size.height) / 2 * ui.camera.zoom + 5;
  ctx.save();
  ctx.strokeStyle = "#4ade80";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, radius, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

// Screen pixels per canvas pixel above which the pixel grid is drawn.
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

// Screen-space so the numbers stay readable at any zoom.
const GAUGE = { width: 36, height: 12, gap: 4 };

function drawGauge(shipPosition: Vec, gauge: Gauge, size: Size): void {
  const top = worldToScreen(ui.camera, ui.viewport, {
    x: shipPosition.x,
    y: shipPosition.y - size.height / 2,
  });
  const x = Math.round(top.x - GAUGE.width / 2);
  const y = Math.round(top.y - GAUGE.gap - GAUGE.height);

  ctx.fillStyle = "#1f2937";
  ctx.fillRect(x, y, GAUGE.width, GAUGE.height);
  ctx.fillStyle = "#a16207";
  ctx.fillRect(x, y, GAUGE.width * gauge.fill, GAUGE.height);
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, GAUGE.width - 1, GAUGE.height - 1);

  ctx.fillStyle = "#f9fafb";
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(gauge.text, x + GAUGE.width / 2, y + GAUGE.height / 2 + 0.5);
}

// Screen-space, like the gauge, so the beam and flicker read at any zoom.
function drawLaser(beam: Beam, seconds: number): void {
  const from = worldToScreen(ui.camera, ui.viewport, beam.from);
  const to = worldToScreen(ui.camera, ui.viewport, beam.to);
  const pulse = laserPulse(seconds);

  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = LASER_COLOR;
  ctx.lineWidth = 1 + pulse;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();

  // 2 by 2 so a single spark is still visible on a low-density screen.
  ctx.fillStyle = "#fff1f2";
  for (const pixel of flickerPixels({ x: Math.round(to.x), y: Math.round(to.y) }, seconds)) {
    ctx.fillRect(pixel.x - 1, pixel.y - 1, 2, 2);
  }
}

function drawOrderFeedback(seconds: number): void {
  if (ui.orderLines) {
    const alpha = orderLineAlpha(seconds - ui.orderLines.start);
    if (alpha <= 0) ui.orderLines = null;
    else {
      const to = worldToScreen(ui.camera, ui.viewport, ui.orderLines.to);
      ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = "#86efac"; ctx.setLineDash([5, 4]);
      for (const from of ui.orderLines.from) {
        const start = worldToScreen(ui.camera, ui.viewport, from);
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(to.x, to.y); ctx.stroke();
      }
      ctx.restore();
    }
  }
  if (ui.dragBox) {
    ctx.save(); ctx.strokeStyle = "#4ade80"; ctx.fillStyle = "rgba(74,222,128,.12)";
    const x = Math.min(ui.dragBox.start.x, ui.dragBox.end.x); const y = Math.min(ui.dragBox.start.y, ui.dragBox.end.y);
    const w = Math.abs(ui.dragBox.start.x - ui.dragBox.end.x); const h = Math.abs(ui.dragBox.start.y - ui.dragBox.end.y);
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); ctx.restore();
  }
}

function backdropNumber(sectorId: number, index: number, salt: number): number {
  let value = (sectorId + 1) * 0x9e3779b1 ^ (index + 1) * 0x85ebca6b ^ salt;
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return ((value ^ value >>> 16) >>> 0) / 2 ** 32;
}

function drawBackdrop(sectorId: number): void {
  const backdrop = sectorBackdrop(sectorId);
  ctx.fillStyle = backdrop.background;
  ctx.fillRect(0, 0, ui.viewport.width, ui.viewport.height);

  const glowX = ui.viewport.width * (0.2 + backdropNumber(sectorId, 0, 17) * 0.6);
  const glowY = ui.viewport.height * (0.2 + backdropNumber(sectorId, 0, 31) * 0.6);
  const glowRadius = Math.max(ui.viewport.width, ui.viewport.height) * 0.7;
  const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowRadius);
  glow.addColorStop(0, backdrop.wash);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, ui.viewport.width, ui.viewport.height);

  ctx.fillStyle = backdrop.starColor;
  for (let index = 0; index < backdrop.starCount; index += 1) {
    const x = Math.floor(backdropNumber(sectorId, index, 101) * ui.viewport.width);
    const y = Math.floor(backdropNumber(sectorId, index, 211) * ui.viewport.height);
    const size = backdropNumber(sectorId, index, 307) > 0.88 ? 2 : 1;
    ctx.globalAlpha = 0.35 + backdropNumber(sectorId, index, 401) * 0.65;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;
}

function draw(seconds: number): void {
  drawBackdrop(ui.currentSector);
  drawOrderFeedback(seconds);

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
    drawStationConnector(connector.from, connector.to);
  }
  for (const module of ui.currentSector === 0 ? getState().station.modules : []) {
    drawStationModule(module);
  }
  if (ui.currentSector === 0) drawConstructionSite();
  const construction = getState().station.construction;
  if (ui.currentSector === 0 && construction) {
    strokeWorldRect(construction.position, construction.size, "#cbd5e1");
  }
  for (const site of getState().claimSites) {
    if (site.sectorId === ui.currentSector) drawClaimSite(site);
  }

  for (const ship of sectorShips) {
    const beam = laserBeam(getState(), ship);
    if (beam) drawLaser(beam, seconds);
  }

  for (const ship of sectorShips) {
    drawShip(ship);
    if (ui.selectedShips.includes(ship.id)) drawSelectionRing(ship.position, shipSize(ship.design));

    const gauge = cargoGauge(ship);
    if (gauge) drawGauge(ship.position, gauge, shipSize(ship.design));
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
  // Re-checked every frame, so zooming under a still ui.pointer updates it too,
  // and the box closes by itself when a hovered asteroid runs out.
  let hovered = ui.mapOpen ? null : hoveredBody(getState(), ui.camera, ui.viewport, ui.pointer, ui.currentSector);
  if (hovered?.kind === "claimSite") ui.stickySite = hovered.id;
  else if (ui.infoHovered && ui.stickySite !== null && !ui.mapOpen) hovered = { kind: "claimSite", id: ui.stickySite };
  else ui.stickySite = null;
  // A + cell sits above the canvas, so a ship beside it would never hear the
  // click. While the ui.pointer is on a ship, the cells let clicks through.
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

  if (ui.mapOpen) {
    const layout = mapLayout(getState(), ui.viewport);
    ctx.save(); ctx.fillStyle = "rgba(15,23,42,.94)"; ctx.fillRect(0, 0, ui.viewport.width, ui.viewport.height);
    ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 3;
    for (const link of layout.links) { ctx.beginPath(); ctx.moveTo(link.from.x, link.from.y); ctx.lineTo(link.to.x, link.to.y); ctx.stroke(); }
    for (const circle of layout.circles) {
      const available = !ui.pendingGate || circle.id === ui.pendingGate.sectorId || sectorInGateRange(ui.pendingGate.sectorId, circle.id);
      ctx.beginPath(); ctx.arc(circle.center.x, circle.center.y, circle.radius, 0, Math.PI * 2);
      ctx.fillStyle = available ? circle.tint : "#334155";
      ctx.globalAlpha = available ? 1 : 0.55;
      ctx.fill(); ctx.strokeStyle = available ? "#67e8f9" : "#64748b"; ctx.stroke();
      ctx.fillStyle = "#f8fafc"; ctx.textAlign = "center"; ctx.font = "14px monospace";
      ctx.fillText(circle.name, circle.center.x, circle.center.y - 4);
      ctx.fillText(`${circle.ships} ships`, circle.center.x, circle.center.y + 18);
      if (circle.claimed) {
        const label = renameLabel(circle);
        ctx.font = "11px monospace"; ctx.strokeStyle = "#94a3b8"; ctx.strokeRect(label.x, label.y, label.width, label.height);
        ctx.fillText("Rename", circle.center.x, label.y + 12);
        ctx.font = "14px monospace";
      }
      if (ui.renamingSector === circle.id) {
        renameBox.style.left = `${Math.round(circle.center.x - 60)}px`;
        renameBox.style.top = `${Math.round(circle.center.y - 22)}px`;
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}



  return draw;
}
