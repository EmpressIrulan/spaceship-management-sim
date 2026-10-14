import { MODULE_HP, SHIELD_RECHARGE_DELAY } from "./build-constants";
import { shipHp, shipRepairRate, shipShield, shipSize, speedFactor } from "./ship";
import { travelSeconds } from "./motion";
import type { RepairTarget, Ship, Station, StationModule, Vec } from "./model";

// Applies one hit to the shield and then to the hull. Null means the ship was
// destroyed. Recharge follows all hits; the ring follows only absorbed damage.
export function damageShip(ship: Ship, damage: number, hitAt: number): Ship | null {
  const { hp, maxHp } = shipHp(ship);
  const { shield, maxShield } = shipShield(ship);
  const shieldDamage = Math.min(shield, damage);
  const hullDamage = damage - shieldDamage;
  const nextShield = shield - shieldDamage;
  const nextHp = hp - hullDamage;
  if (nextHp <= 0) return null;
  return {
    ...ship,
    hp: nextHp,
    maxHp,
    shield: nextShield,
    maxShield,
    shieldLastHit: maxShield > 0 ? hitAt : ship.shieldLastHit,
    shieldLastAbsorbedHit: shieldDamage > 0 ? hitAt : ship.shieldLastAbsorbedHit,
  };
}

export function advanceShields(ships: Ship[], from: number, to: number): Ship[] {
  return ships.map((ship) => {
    const { shield, maxShield, recharge } = shipShield(ship);
    if (ship.shieldLastHit === undefined || maxShield <= shield || recharge <= 0) return ship;
    const eligibleFrom = Math.max(from, ship.shieldLastHit + SHIELD_RECHARGE_DELAY);
    const added = Math.max(0, to - eligibleFrom) * recharge;
    if (added <= 0) return ship;
    return { ...ship, shield: Math.min(maxShield, shield + added), maxShield };
  });
}

export function nextShieldEvent(ships: Ship[], now: number): number {
  let soonest = Infinity;
  for (const ship of ships) {
    const { shield, maxShield, recharge } = shipShield(ship);
    if (ship.shieldLastHit === undefined || shield >= maxShield || recharge <= 0) continue;
    const starts = ship.shieldLastHit + SHIELD_RECHARGE_DELAY;
    const wait = now < starts ? starts - now : (maxShield - shield) / recharge;
    soonest = Math.min(soonest, wait);
  }
  return soonest;
}

export function advanceShipRepairs(ships: Ship[], seconds: number): Ship[] {
  const rates = new Map(ships.map((ship) => [ship.id, shipRepairRate(ship.design)]));
  return ships.map((target) => {
    const { hp, maxHp } = shipHp(target);
    if (hp >= maxHp || seconds <= 0) return target;
    const repairedBy = ships.reduce((total, repairer) => {
      if (repairer.id === target.id || (repairer.repairTarget?.kind === "ship" ? repairer.repairTarget.shipId !== target.id : repairer.repairTargetShipId !== target.id)
        || repairer.sectorId !== target.sectorId || !inRepairRange(repairer, target)) return total;
      return total + (rates.get(repairer.id) ?? 0);
    }, 0);
    if (repairedBy <= 0) return target;
    return { ...target, hp: Math.min(maxHp, hp + repairedBy * seconds), maxHp };
  });
}

export function repairTargetOf(ship: Ship): RepairTarget | null {
  return ship.repairTarget ?? (ship.repairTargetShipId == null ? null : { kind: "ship", shipId: ship.repairTargetShipId });
}

export function advanceModuleRepairs(ships: Ship[], stations: Station[], seconds: number): Station[] {
  if (seconds <= 0) return stations;
  return stations.map((station) => ({ ...station, modules: station.modules.map((module) => {
    const hp = module.hp ?? module.maxHp ?? MODULE_HP;
    const maxHp = module.maxHp ?? MODULE_HP;
    if (hp >= maxHp) return module;
    const rate = ships.reduce((sum, ship) => {
      const target = repairTargetOf(ship);
      if (target?.kind !== "module" || target.stationId !== station.id
        || target.position.x !== module.position.x || target.position.y !== module.position.y
        || ship.sectorId !== station.sectorId || !inModuleRepairRange(ship, module)) return sum;
      return sum + shipRepairRate(ship.design);
    }, 0);
    return rate > 0 ? { ...module, hp: Math.min(maxHp, hp + rate * seconds), maxHp } : module;
  }) }));
}

function inModuleRepairRange(repairer: Ship, target: StationModule): boolean {
  const size = shipSize(repairer.design);
  return Math.hypot(repairer.position.x - target.position.x, repairer.position.y - target.position.y)
    <= Math.hypot(size.width + target.size.width, size.height + target.size.height) / 2 + 1;
}

export function inRepairRange(repairer: Ship, target: Ship): boolean {
  const a = shipSize(repairer.design);
  const b = shipSize(target.design);
  const reach = Math.hypot(a.width + b.width, a.height + b.height) / 2 + 1;
  return Math.hypot(repairer.position.x - target.position.x, repairer.position.y - target.position.y) <= reach;
}

// Keep explicitly assigned Repair ships parked beside their target. The target
// point is deterministic, so two repair ships can approach opposite sides.
export function moveRepairShips(ships: Ship[], stations: Station[] = []): Ship[] {
  return ships.map((original) => {
    if (shipRepairRate(original.design) <= 0) return original;
    let repairer = original;
    let targetId = repairTargetOf(repairer);
    if (targetId?.kind === "ship") {
      const target = ships.find((item) => item.id === (targetId as Extract<RepairTarget, { kind: "ship" }>).shipId);
      if (!target || shipHp(target).hp >= shipHp(target).maxHp) targetId = null;
    } else if (targetId?.kind === "module") {
      const moduleTarget = targetId as Extract<RepairTarget, { kind: "module" }>;
      const target = stations.find((item) => item.id === moduleTarget.stationId)?.modules.find((item) => item.position.x === moduleTarget.position.x && item.position.y === moduleTarget.position.y);
      if (!target || (target.hp ?? target.maxHp ?? 40) >= (target.maxHp ?? 40)) targetId = null;
    }
    if (!targetId && repairTargetOf(original)) repairer = { ...repairer, repairTarget: null, repairTargetShipId: null, order: repairer.order?.kind === "repair" ? null : repairer.order };
    if (!targetId && repairer.defaultBehaviour === "repair") {
      const choices: { target: RepairTarget; position: Vec; distance: number }[] = [];
      for (const target of ships) {
        if (target.id === repairer.id || target.sectorId !== repairer.sectorId || target.state === "docked" || target.hangarId != null
          || shipHp(target).hp >= shipHp(target).maxHp) continue;
        choices.push({ target: { kind: "ship", shipId: target.id }, position: target.position,
          distance: Math.hypot(target.position.x - repairer.position.x, target.position.y - repairer.position.y) });
      }
      for (const station of stations.filter((item) => item.sectorId === repairer.sectorId)) for (const module of station.modules) {
        const hp = module.hp ?? module.maxHp ?? MODULE_HP;
        if (hp >= (module.maxHp ?? MODULE_HP)) continue;
        choices.push({ target: { kind: "module", stationId: station.id, position: module.position }, position: module.position,
          distance: Math.hypot(module.position.x - repairer.position.x, module.position.y - repairer.position.y) });
      }
      choices.sort((a, b) => a.distance - b.distance);
      targetId = choices[0]?.target ?? null;
      if (targetId) repairer = { ...repairer, repairTarget: targetId, repairTargetShipId: targetId.kind === "ship" ? targetId.shipId : null };
    }
    if (!targetId) return repairer;
    let position: Vec;
    let targetWidth: number;
    let targetIndex: number;
    if (targetId.kind === "ship") {
      const target = ships.find((candidate) => candidate.id === targetId.shipId && candidate.id !== repairer.id && candidate.sectorId === repairer.sectorId);
      if (!target || inRepairRange(repairer, target)) return repairer;
      position = target.position; const size = shipSize(target.design); targetWidth = size.width; targetIndex = target.id;
    } else {
      const station = stations.find((candidate) => candidate.id === targetId.stationId && candidate.sectorId === repairer.sectorId);
      const module = station?.modules.find((item) => item.position.x === targetId.position.x && item.position.y === targetId.position.y);
      if (!module || inModuleRepairRange(repairer, module)) return repairer;
      position = module.position; targetWidth = module.size.width; targetIndex = station!.id;
    }
    const a = shipSize(repairer.design);
    const side = repairer.id < targetIndex ? -1 : 1;
    const destination = { x: position.x + side * (a.width + targetWidth) / 2, y: position.y };
    const from = { ...repairer.position };
    const length = Math.hypot(destination.x - from.x, destination.y - from.y);
    return { ...repairer, state: "moving", berth: null, transfer: null,
      leg: { from, to: destination }, timer: travelSeconds(length, Math.max(0.01, speedFactor(repairer.design))) };
  });
}
