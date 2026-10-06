import { CLAIM_BUILD_ORDER, CLAIM_MODULE_COST, GATE_COST, MATERIALS, MODULE_COST, claimSiteBuilt, claimSiteNeeds, hangarCapacity, hangarContents, hangarIncoming, hangarReserved, shipStats, stationIncome, type Ship, type SimState } from "sim";
import type { Hovered } from "./camera";
import { shipStatus } from "./ships";
import { formatDuration } from "./shipyard";

export interface Gauge {
  // 0 to 1. Follows the timer so the bar moves smoothly between whole units.
  fill: number;
  text: string;
}

// An empty ship heading out or waiting at the station has nothing worth
// reading, so it gets no gauge.
export function cargoGauge(ship: Ship): Gauge | null {
  const { hold, miningSeconds } = shipStats(ship.design);
  const text = `${ship.cargo}/${hold}`;
  switch (ship.state) {
    case "idle":
    case "outbound":
    case "moving":
    case "holding":
    case "docking":
    case "docked":
    case "jumpingOut":
    case "jumpingHome":
    case "haulReturning":
    case "haulJumpingReturning":
    case "haulWaitingSource":
      return null;
    case "gateReturning":
      return null;
    case "gateHauling":
    case "waiting":
    case "berthing":
    case "homebound":
    case "haulOutbound":
    case "haulJumpingOutbound":
    case "haulWaitingFull":
      return { fill: hold ? ship.cargo / hold : 0, text };
    case "loading":
      return { fill: hold ? ship.cargo / hold : 0, text };
    case "working":
      return { fill: miningSeconds ? 1 - ship.timer / miningSeconds : 0, text };
    case "unloading":
    case "gateUnloading":
    case "haulUnloading":
    case "haulLoading":
      return { fill: hold ? ship.cargo / hold : 0, text };
  }
}

export interface InfoBox {
  title: string;
  line: string;
  // A button the box carries, for the hovers that can be acted on.
  action?: { label: string; siteId?: number; carrierId?: number; queuedBuild?: number; disabled?: boolean };
}

function claimSiteBox(state: SimState, id: number): InfoBox | null {
  const site = state.claimSites.find((candidate) => candidate.id === id);
  if (!site) return null;
  if (claimSiteBuilt(site)) {
    return { title: "Claim station", line: `${CLAIM_BUILD_ORDER.join(" and ")} built`, action: { label: "Remove site", siteId: site.id } };
  }
  const needs = claimSiteNeeds(site);
  const now = needs.seconds === null
    ? `${needs.building}: ${MATERIALS.map((material) => `${material} ${site.delivered[material]}/${CLAIM_MODULE_COST[material]}`).join(", ")}`
    : `Building ${needs.building}: ${Math.ceil(needs.seconds)} s`;
  return { title: "Claim site", line: needs.next ? `${now}\nThen: ${needs.next}` : now };
}

// Every Storage module shares one inventory, so each shows the same box.
function storageBox(state: SimState): InfoBox {
  const stored = MATERIALS.reduce((total, material) => total + homeStation(state).inventory[material], 0);
  const lines = MATERIALS.filter((material) => homeStation(state).inventory[material] > 0)
    .map((material) => `${material}: ${homeStation(state).inventory[material]}`);
  const income = stationIncome(state);
  const rates = MATERIALS.map((material) => `${material} +${income[material]}/min`).join(", ");
  return {
    title: "Storage",
    line: [`Stored ${stored} / ${homeStation(state).storage.capacity}`, ...lines, `Income: ${rates}`].join("\n"),
  };
}

function dockBox(state: SimState): InfoBox {
  const transferring = state.ships.filter((ship) => ship.state === "loading"
    || ((ship.state === "haulLoading" || ship.state === "haulUnloading") && ship.berth !== null)
    || (ship.state === "unloading" && ship.order?.kind !== "supplySite" && ship.transfer?.destination !== "constructionSite")).length;
  return { title: "Dock", line: `Occupied ${transferring} / ${homeStation(state).dock.capacity}` };
}

// Null closes the box, including when the hovered asteroid has just gone.
export function infoBox(state: SimState, hovered: Hovered | null): InfoBox | null {
  if (!hovered) return null;
  if (hovered.kind === "dock") return dockBox(state);
  if (hovered.kind === "storage") return storageBox(state);
  if (hovered.kind === "constructionSite") {
    const { inventory } = homeStation(state).constructionSite;
    return { title: "Construction site", line: MATERIALS.map((material) => `${material}: ${inventory[material]}`).join("\n") };
  }
  if (hovered.kind === "construction") {
    const construction = homeStation(state).construction;
    return construction
      ? { title: `Building ${construction.type}`, line: `${Math.ceil(construction.timer)} s` }
      : null;
  }
  if (hovered.kind === "queuedBuild") {
    const queued = homeStation(state).buildQueue[hovered.index];
    if (!queued) return null;
    if (hovered.index === 0 && homeStation(state).construction
      && MATERIALS.every((material) => homeStation(state).constructionSite.inventory[material] >= MODULE_COST[material])) {
      return {
        title: `${queued.type}, queued`,
        line: "Waiting for the module under construction",
        action: { label: "Cancel", queuedBuild: hovered.index },
      };
    }
    const needs = MATERIALS.map((material) => ({
      material,
      amount: hovered.index === 0
        ? Math.max(0, MODULE_COST[material] - homeStation(state).constructionSite.inventory[material])
        : MODULE_COST[material],
    })).filter(({ amount }) => hovered.index > 0 || amount > 0);
    const line = `Needs ${needs.map(({ material, amount }) => `${amount}${hovered.index === 0 ? " more" : ""} ${material}`).join(" and ")}`;
    return { title: `${queued.type}, queued`, line, action: { label: "Cancel", queuedBuild: hovered.index } };
  }
  if (hovered.kind === "module") {
    const module = homeStation(state).modules[hovered.index];
    if (!module) return null;
    if (module.type === "Builder") {
      const job = homeStation(state).shipBuilds.find((candidate) => candidate.builder === hovered.index);
      if (!job) return { title: "Builder", line: "Idle" };
      const size = `${job.design.width}x${job.design.height}`;
      return { title: "Builder", line: `Building ${size}: ${formatDuration(Math.ceil(job.timer))}` };
    }
    if (module.type === "Dock") return dockBox(state);
    return storageBox(state);
  }
  if (hovered.kind === "ship") {
    const ship = state.ships[hovered.index];
    if (!ship) return null;
    const capacity = hangarCapacity(ship.design);
    const incoming = hangarIncoming(state, ship.id);
    const hangarValue = `${hangarReserved(state, ship.id)}/${capacity}${incoming > 0 ? `, ${incoming} incoming` : ""}`;
    const hangar = capacity > 0 ? `\nHangar ${hangarValue}\nDocked ships: ${hangarContents(state, ship.id).length}` : "";
    return { title: "Ship", line: `${shipStatus(state, ship)}${hangar}`,
      ...(capacity > 0 ? { action: { label: "Launch all", carrierId: ship.id, disabled: hangarContents(state, ship.id).length === 0 } } : {}) };
  }
  if (hovered.kind === "claimSite") return claimSiteBox(state, hovered.id);
  if (hovered.kind === "gateProject") {
    const project = state.gateProjects.find((candidate) => candidate.id === hovered.id);
    if (!project) return null;
    if (project.complete) {
      const here = project.ends[hovered.end ?? 0];
      const other = project.ends.find((end) => end !== here);
      return other ? { title: "Gate", line: `Gate to ${state.sectors[other.sectorId]!.name}` } : null;
    }
    return { title: "Gate", line: `Gate ${project.delivered.Metal} / ${GATE_COST.Metal} Metal, ${project.delivered.Ice} / ${GATE_COST.Ice} Ice` };
  }
  const asteroid = state.asteroids.find((a) => a.id === hovered.id);
  return asteroid ? { title: asteroid.rich ? "Rich asteroid" : "Asteroid", line: `${asteroid.material}: ${asteroid.ore}` } : null;
}

// What hovering a sector on the map shows. The rich rock count is what is
// there now, so it drops while one is mined out and waiting to respawn.
export function sectorBox(state: SimState, sectorId: number): InfoBox | null {
  const sector = state.sectors[sectorId];
  if (!sector) return null;
  const rich = state.asteroids.filter((rock) => rock.sectorId === sectorId && rock.rich).length;
  const parts = [`${sector.character.abundant}-rich`, sector.character.density];
  if (rich > 0) parts.push(`Rich rocks: ${rich}`);
  return { title: sector.name, line: parts.join(" · ") };
}
import { homeStation } from "sim";
