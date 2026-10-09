import { GATE_COST, MATERIALS, hangarCapacity, hangarContents, hangarIncoming, hangarReserved, holdsBerth, moduleCost, shipHp, shipStats, stationById, stationIncome, type Ship, type SimState } from "sim";
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
  action?: { label: string; siteId?: number; carrierId?: number; queuedBuild?: number; stationId?: number; disabled?: boolean };
}

// The construction site's stock: what ships have delivered for the module the
// queue wants next.
function siteBox(state: SimState, stationId: number): InfoBox | null {
  const station = stationById(state, stationId);
  if (!station) return null;
  const { inventory } = station.constructionSite;
  return { title: "Construction site", line: MATERIALS.map((material) => `${material}: ${inventory[material]}`).join("\n") };
}

// Every Storage module shares one inventory, so each shows the same box.
function storageBox(state: SimState, stationId = 0): InfoBox {
  const station = stationById(state, stationId);
  if (!station) return { title: "Storage", line: "Station unavailable" };
  const stored = MATERIALS.reduce((total, material) => total + station.inventory[material], 0);
  const lines = MATERIALS.filter((material) => station.inventory[material] > 0)
    .map((material) => `${material}: ${station.inventory[material]}`);
  const income = stationIncome(state, stationId);
  const rates = MATERIALS.map((material) => `${material} +${income[material]}/min`).join(", ");
  return {
    title: "Storage",
    line: [`Stored ${stored} / ${station.storage.capacity}`, ...lines, `Income: ${rates}`].join("\n"),
  };
}

function dockBox(state: SimState, stationId = 0): InfoBox {
  const station = stationById(state, stationId) ?? homeStation(state);
  const inside = state.ships.filter((ship) => holdsBerth(ship) && ship.state !== "berthing" && ship.sectorId === station.sectorId
    && station.modules.some((module) => module.type === "Dock"
      && Math.abs(ship.position.x - module.position.x) <= module.size.width / 2
      && Math.abs(ship.position.y - module.position.y) <= module.size.height / 2));
  const area = inside.reduce((sum, ship) => sum + ship.design.width * ship.design.height, 0);
  return { title: station.name, line: `Dock ${area}/${station.dock.capacity}\n${inside.length} ships inside` };
}

// Null closes the box, including when the hovered asteroid has just gone.
export function infoBox(state: SimState, hovered: Hovered | null): InfoBox | null {
  if (!hovered) return null;
  if (hovered.kind === "dock") return dockBox(state, hovered.stationId);
  if (hovered.kind === "storage") return storageBox(state, hovered.stationId ?? 0);
  if (hovered.kind === "constructionSite") return siteBox(state, hovered.id);
  if (hovered.kind === "construction") {
    const construction = stationById(state, hovered.stationId ?? 0)?.construction;
    return construction
      ? { title: `Building ${construction.type}`, line: `${Math.ceil(construction.timer)} s` }
      : null;
  }
  if (hovered.kind === "queuedBuild") {
    const stationId = hovered.stationId ?? 0;
    const station = stationById(state, stationId);
    const queued = station?.buildQueue[hovered.index];
    if (!queued) return null;
    const cost = moduleCost(queued.type);
    if (hovered.index === 0 && station?.construction
      && MATERIALS.every((material) => station.constructionSite.inventory[material] >= cost[material])) {
      return {
        title: `${queued.type}, queued`,
        line: "Waiting for the module under construction",
        action: { label: "Cancel", queuedBuild: hovered.index, ...(stationId === 0 ? {} : { stationId }) },
      };
    }
    const needs = MATERIALS.map((material) => ({
      material,
      amount: hovered.index === 0
          ? Math.max(0, cost[material] - station!.constructionSite.inventory[material])
        : cost[material],
    })).filter(({ amount }) => hovered.index > 0 || amount > 0);
    const line = `Needs ${needs.map(({ material, amount }) => `${amount}${hovered.index === 0 ? " more" : ""} ${material}`).join(" and ")}`;
    return { title: `${queued.type}, queued`, line, action: { label: "Cancel", queuedBuild: hovered.index, ...(stationId === 0 ? {} : { stationId }) } };
  }
  if (hovered.kind === "module") {
    const station = state.stations.find((candidate) => candidate.id === hovered.stationId);
    const module = station?.modules[hovered.index];
    if (!module) return null;
    if (module.type === "Builder") {
      const job = station?.shipBuilds.find((candidate) => candidate.builder === hovered.index);
      if (!job) return { title: "Builder", line: "Idle" };
      const size = `${job.design.width}x${job.design.height}`;
      return { title: "Builder", line: `Building ${size}: ${formatDuration(Math.ceil(job.timer))}` };
    }
    if (module.type === "Dock") return dockBox(state, hovered.stationId);
    return storageBox(state, hovered.stationId);
  }
  if (hovered.kind === "ship") {
    const ship = state.ships[hovered.index];
    if (!ship) return null;
    const capacity = hangarCapacity(ship.design);
    const incoming = hangarIncoming(state, ship.id);
    const hangarValue = `${hangarReserved(state, ship.id)}/${capacity}${incoming > 0 ? `, ${incoming} incoming` : ""}`;
    const hangar = capacity > 0 ? `\nHangar ${hangarValue}\nDocked ships: ${hangarContents(state, ship.id).length}` : "";
    // A fresh hull has nothing worth reading: the HP line appears once a bite
    // or a shot has taken it below full.
    const { hp, maxHp } = shipHp(ship);
    const hull = hp < maxHp ? `\nHP ${hp}/${maxHp}` : "";
    return { title: "Ship", line: `${shipStatus(state, ship)}${hangar}${hull}`,
      ...(capacity > 0 ? { action: { label: "Launch all", carrierId: ship.id, disabled: hangarContents(state, ship.id).length === 0 } } : {}) };
  }
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
  // Dead things leave the hover with the drop that replaced them: a killed
  // hive stops answering already in hoveredBody.
  if (hovered.kind === "hive") {
    const hive = (state.hives ?? []).find((candidate) => candidate.id === hovered.id);
    return hive?.alive ? { title: "Hive", line: `HP ${hive.hp}/${hive.maxHp}` } : null;
  }
  if (hovered.kind === "bug") {
    const bug = (state.bugs ?? []).find((candidate) => candidate.id === hovered.id);
    return bug ? { title: "Bug", line: `HP ${bug.hp}/${bug.maxHp}` } : null;
  }
  if (hovered.kind === "drop") {
    const drop = (state.drops ?? []).find((candidate) => candidate.id === hovered.id);
    return drop ? { title: drop.kind === "bugJuice" ? "Bug juice" : "Queen larvae", line: "Nothing collects it yet" } : null;
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
