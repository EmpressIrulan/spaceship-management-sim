import { laserBeam, shipSize, type SimState, type Vec, type Size } from "sim";
import { worldToScreen } from "./camera";
import { asteroidColor } from "./asteroid";
import { cargoGauge } from "./labels";
import { stationConnectors } from "./station-appearance";
import { createStationDrawing } from "./station-rendering";
import { createShipDrawing } from "./ship-rendering";
import { createOverlayDrawing } from "./overlay-rendering";
import type { UiState } from "./ui-state";

export interface WorldDrawing {
  draw: (seconds: number) => { sectorRocks: SimState["asteroids"]; legacyGateVisible: boolean; gate: SimState["sectors"][number]["gate"]; gateScreen: Vec };
}

export function createWorldDrawing(
  ui: UiState,
  getState: () => SimState,
  ctx: CanvasRenderingContext2D,
  fillWorldRect: (center: Vec, size: Size, color: string) => void,
  strokeWorldRect: (center: Vec, size: Size, color: string) => void,
): WorldDrawing {
  const stationDrawing = createStationDrawing(ui, getState, ctx, fillWorldRect, strokeWorldRect);
  const shipDrawing = createShipDrawing(ui, ctx);
  const overlayDrawing = createOverlayDrawing(ui, ctx);

  function draw(seconds: number) {
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
    for (const asteroid of sectorRocks) fillWorldRect(asteroid.position, asteroid.size, asteroidColor(asteroid.material, asteroid.rich));
    for (const connector of ui.currentSector === 0 ? stationConnectors(getState().station.modules) : []) {
      stationDrawing.drawStationConnector(connector.from, connector.to);
    }
    for (const module of ui.currentSector === 0 ? getState().station.modules : []) stationDrawing.drawStationModule(module);
    if (ui.currentSector === 0) stationDrawing.drawConstructionSite();
    const construction = getState().station.construction;
    if (ui.currentSector === 0 && construction) strokeWorldRect(construction.position, construction.size, "#cbd5e1");
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
    return { sectorRocks, legacyGateVisible, gate, gateScreen };
  }

  return { draw };
}
