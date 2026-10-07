import { fitCamera } from "./camera";
import { gateTargetAllowed, mapHit, mapLayout, renameHit } from "./sectors";
import type { InputContext } from "./input-context";

export function navigateMap(context: InputContext, event: MouseEvent): boolean {
  const { ui, getState, canvas, mousePoint, startRename } = context;
  if (event.target !== canvas || !ui.mapOpen) return false;
  const layout = mapLayout(getState(), ui.viewport);
  const renameId = renameHit(layout, mousePoint(event));
  const id = renameId === null ? mapHit(layout, mousePoint(event)) : null;
  if (renameId !== null) startRename(renameId);
  else if (id !== null) {
    if (!gateTargetAllowed(ui.pendingGate, id)) return true;
    ui.currentSector = id;
    const sectorRocks = getState().asteroids.filter((rock) => rock.sectorId === id);
    // Placed station sites fit the starting view, so a sector the player has
    // founded into centres on its stations as well as its rocks.
    const sectorSites = getState().stations.filter((station) => station.sectorId === id)
      .map((station) => ({ position: station.constructionSite.position, size: station.constructionSite.size }));
    const bodies = [...sectorRocks, ...sectorSites, ...(id === 0 ? [homeStation(getState()).dock, homeStation(getState()).storage, ...homeStation(getState()).modules] : []), getState().sectors[id]!.gate];
    ui.camera = fitCamera(ui.viewport, bodies);
    ui.mapOpen = false;
    if (ui.pendingGate) ui.pendingGate.targetSector = id;
  }
  return true;
}
import { homeStation } from "sim";
