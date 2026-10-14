import { SHIELD_RECHARGE_DELAY } from "./build-constants";
import { shipHp, shipRepairRate, shipShield, shipSize, speedFactor } from "./ship";
import { travelSeconds } from "./motion";
import type { Ship } from "./model";

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
      if (repairer.id === target.id || repairer.repairTargetShipId !== target.id
        || repairer.sectorId !== target.sectorId || !inRepairRange(repairer, target)) return total;
      return total + (rates.get(repairer.id) ?? 0);
    }, 0);
    if (repairedBy <= 0) return target;
    return { ...target, hp: Math.min(maxHp, hp + repairedBy * seconds), maxHp };
  });
}

export function inRepairRange(repairer: Ship, target: Ship): boolean {
  const a = shipSize(repairer.design);
  const b = shipSize(target.design);
  const reach = Math.hypot(a.width + b.width, a.height + b.height) / 2 + 1;
  return Math.hypot(repairer.position.x - target.position.x, repairer.position.y - target.position.y) <= reach;
}

// Keep explicitly assigned Repair ships parked beside their target. The target
// point is deterministic, so two repair ships can approach opposite sides.
export function moveRepairShips(ships: Ship[]): Ship[] {
  return ships.map((repairer) => {
    if (repairer.repairTargetShipId == null || shipRepairRate(repairer.design) <= 0) return repairer;
    const target = ships.find((candidate) => candidate.id === repairer.repairTargetShipId && candidate.id !== repairer.id
      && candidate.sectorId === repairer.sectorId);
    if (!target || inRepairRange(repairer, target)) return repairer;
    const a = shipSize(repairer.design);
    const b = shipSize(target.design);
    const side = repairer.id < target.id ? -1 : 1;
    const destination = { x: target.position.x + side * (a.width + b.width) / 2, y: target.position.y };
    const from = { ...repairer.position };
    const length = Math.hypot(destination.x - from.x, destination.y - from.y);
    return { ...repairer, state: "moving", berth: null, transfer: null,
      leg: { from, to: destination }, timer: travelSeconds(length, Math.max(0.01, speedFactor(repairer.design))) };
  });
}
