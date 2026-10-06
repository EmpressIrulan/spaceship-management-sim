import { laserBeam, shipSize, type SimState, type Vec, type Size } from "sim";
import { worldToScreen } from "./camera";
import { asteroidColor } from "./asteroid";
import { cargoGauge } from "./labels";
import { cancelDependentsAt } from "./building";
import { stationConnectors } from "./station-appearance";
import { createStationDrawing } from "./station-rendering";
import { createShipDrawing } from "./ship-rendering";
import { createOverlayDrawing } from "./overlay-rendering";
import type { UiState } from "./ui-state";

const slotKey = ({ x, y }: Vec): string => `${x},${y}`;

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
    const sectorShips = getState().ships.filter((ship) => ship.sectorId === ui.currentSector && ship.state !== "jumpingOut" && ship.state !== "jumpingHome" && ship.state !== "docked");
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
    const state = getState();
    // Every station in the sector draws whole, so a founding one shows its
    // ghosts, its build and its site marker exactly the way Home does.
    for (const station of state.stations) {
      if (station.sectorId !== ui.currentSector) continue;
      const home = station.id === 0;
      for (const connector of stationConnectors(station.modules)) stationDrawing.drawStationConnector(connector.from, connector.to);
      for (const module of station.modules) stationDrawing.drawStationModule(module);
      // The Cancel under the pointer names the ghosts it would take with it, so
      // the hover highlight and the click read the one set and cannot disagree.
      // Slots are keyed by position, since that is how the hover names its
      // ghost. Cancel lives at Home for now.
      const taking = new Set(home
        ? cancelDependentsAt(state, ui.cancelHoveredBuild).map((queued) => slotKey(queued.position))
        : []);
      for (const queued of station.buildQueue) {
        stationDrawing.drawQueuedModule(queued, taking.has(slotKey(queued.position)));
      }
      if (station.buildQueue.length > 0) stationDrawing.drawConstructionSite(station.constructionSite);
      if (station.construction) strokeWorldRect(station.construction.position, station.construction.size, "#cbd5e1");
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
import { homeStation } from "sim";
