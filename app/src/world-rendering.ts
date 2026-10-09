import {
  BUG_SIZE,
  DROP_SIZE,
  HIVE_SIZE,
  gunBeams,
  laserBeam,
  shipSize,
  type DropKind,
  type SimState,
  type Vec,
  type Size,
} from "sim";
import { worldToScreen } from "./camera";
import { asteroidColor } from "./asteroid";
import { cargoGauge } from "./labels";
import { flickerPixels } from "./laser";
import { slotColor } from "./ships";
import { cancelDependentsAt } from "./building";
import { stationConnectors } from "./station-appearance";
import { createStationDrawing } from "./station-rendering";
import { createShipDrawing } from "./ship-rendering";
import { createOverlayDrawing } from "./overlay-rendering";
import type { UiState } from "./ui-state";

const slotKey = ({ x, y }: Vec): string => `${x},${y}`;

// One enemy family: the hive and its bugs wear the same purple, the loot two
// colours apart so a bug juice drop reads differently from a queen larvae.
const HIVE_COLOR = "#7c3aed";
const HIVE_OUTLINE_COLOR = "#4c1d95";
const BUG_COLOR = "#c084fc";
const DROP_COLORS: Record<DropKind, string> = {
  bugJuice: "#84cc16",
  queenLarvae: "#fde68a",
};
// A gun shot wears the yellow of the Gun pixel that fired it, so the shot
// traces straight back to its ship.
const GUN_SHOT_COLOR = slotColor("Gun");
const BITE_COLOR = BUG_COLOR;

// A destroyed hull is gone from the state in one step, so the burst is
// render-side: a hull seen last frame and gone this frame blasts at the spot
// it was last seen, then fades. Sector switches and first frames blast
// nothing.
const EXPLOSION_SECONDS = 0.9;
const EXPLOSION_RADIUS = 30;
const EXPLOSION_COLOR = "#fbbf24";

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

  const spottedHulls = new Map<number, Vec>();
  let spottedSector: number | null = null;
  const blasts: { position: Vec; startedAt: number }[] = [];

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
    // Loot lies where its thing died (it answers hovers first), then the
    // hive, then its bugs on the ground it flits over.
    for (const drop of state.drops ?? []) {
      if (drop.sectorId !== ui.currentSector) continue;
      fillWorldRect(drop.position, DROP_SIZE, DROP_COLORS[drop.kind]);
    }
    const hive = (state.hives ?? []).find((candidate) => candidate.sectorId === ui.currentSector && candidate.alive);
    if (hive) {
      fillWorldRect(hive.position, HIVE_SIZE, HIVE_COLOR);
      strokeWorldRect(hive.position, HIVE_SIZE, HIVE_OUTLINE_COLOR);
    }
    const sectorBugs = (state.bugs ?? []).filter((bug) => bug.sectorId === ui.currentSector);
    for (const bug of sectorBugs) fillWorldRect(bug.position, BUG_SIZE, BUG_COLOR);
    // Every station in the sector draws whole, so a founding one shows its
    // ghosts, its build and its site marker exactly the way Home does.
    for (const station of state.stations) {
      if (station.sectorId !== ui.currentSector) continue;
      for (const connector of stationConnectors(station.modules)) stationDrawing.drawStationConnector(connector.from, connector.to);
      for (const module of station.modules) stationDrawing.drawStationModule(module);
      // The Cancel under the pointer names the ghosts it would take with it, so
      // the hover highlight and the click read the one set and cannot disagree.
      // Slots are keyed by position, since that is how the hover names its ghost.
      const taking = new Set(cancelDependentsAt(state, ui.cancelHoveredBuild).map((queued) => slotKey(queued.position)));
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
    // Every gun shot burning out in the sector draws its beam, and every bug
    // with its quarry pinned flashes its bite alongside the shots.
    for (const beam of gunBeams({ ships: sectorShips })) shipDrawing.drawLaser(beam, seconds, GUN_SHOT_COLOR);
    for (const bug of sectorBugs) {
      if (bug.state !== "hunting" || bug.leg !== null || bug.targetShipId === null) continue;
      const quarry = state.ships.find((candidate) => candidate.id === bug.targetShipId);
      if (quarry) shipDrawing.drawLaser({ from: bug.position, to: quarry.position }, seconds, BITE_COLOR);
    }
    // A hull seen one frame and gone the next has been destroyed: blast at
    // the spot where it was last seen.
    if (spottedSector !== ui.currentSector) {
      spottedSector = ui.currentSector;
      spottedHulls.clear();
    }
    for (const [id, spot] of [...spottedHulls]) {
      if (!sectorShips.some((ship) => ship.id === id)) {
        blasts.push({ position: spot, startedAt: seconds });
        spottedHulls.delete(id);
      }
    }
    for (const ship of sectorShips) spottedHulls.set(ship.id, { ...ship.position });
    for (const ship of sectorShips) {
      shipDrawing.drawShip(ship);
      if (ui.selectedShips.includes(ship.id)) shipDrawing.drawSelectionRing(ship.position, shipSize(ship.design));
      const gauge = cargoGauge(ship);
      if (gauge) shipDrawing.drawGauge(ship.position, gauge, shipSize(ship.design));
    }
    for (let index = blasts.length - 1; index >= 0; index -= 1) {
      const blast = blasts[index]!;
      const age = seconds - blast.startedAt;
      if (age >= EXPLOSION_SECONDS) {
        blasts.splice(index, 1);
        continue;
      }
      const progress = age / EXPLOSION_SECONDS;
      const screen = worldToScreen(ui.camera, ui.viewport, blast.position);
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = EXPLOSION_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, EXPLOSION_RADIUS * (0.3 + progress), 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();
      // Sparks fly as the ring grows, hashed from the clock like the laser's.
      ctx.fillStyle = EXPLOSION_COLOR;
      for (const pixel of flickerPixels({ x: Math.round(screen.x), y: Math.round(screen.y) }, seconds)) {
        ctx.fillRect(pixel.x - 1, pixel.y - 1, 2, 2);
      }
    }
    return { sectorRocks, legacyGateVisible, gate, gateScreen };
  }

  return { draw };
}
import { homeStation } from "sim";
